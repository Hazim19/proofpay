import { randomUUID } from "node:crypto";
import type { PayPalClient } from "../paypal/client.ts";
import type { JsonStore } from "../store.ts";
import { draftContract } from "../ai/drafter.ts";
import { loadAiConfig } from "../ai/client.ts";
import { verifyDeliverableWithAi } from "../ai/verifier.ts";
import type { Contract, LedgerEvent, Milestone } from "../types.ts";

/**
 * Escrow domain flow:
 *   createContract -> fundMilestone -> submitDeliverable -> verifyMilestone
 *   -> releaseMilestone
 *
 * Every step appends to the ledger (the dispute-ready evidence trail) and
 * persists through the JSON store.
 *
 * Security posture after the 2026-10-28 audit (AUDIT_KEAMANAN.md):
 *  - The hero contract is a locked read-only showcase (no writes at all).
 *  - Every mutating milestone operation runs under a per-milestone lock,
 *    and state transitions that guard money (`funding`, `releasing`) are
 *    persisted BEFORE the first PayPal call, so concurrent or repeated
 *    calls can never pay twice (K-2/T-7).
 *  - Verification is one-shot per deliverable submission (T-1): a verdict,
 *    once recorded, is immutable; only a fresh deliverable (a revision)
 *    can be verified again.
 *  - Release refuses the live-PayPal + stub-AI combination (T-6), clamps
 *    and validates the fraction in code (S-2), never touches PayPal for a
 *    sub-cent release (S-5), requires a COMPLETED capture (S-6), and
 *    reconciles payouts instead of leaving money hanging (T-9/T-10).
 */

/** Contracts that are frozen showcases: no write may mutate them. */
const READ_ONLY_CONTRACT_IDS = new Set(["ct_3e86782b"]);

/** Two-decimal currencies the money formatting (toFixed(2)) is correct for. */
const SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "HKD", "NZD", "CHF",
  "SEK", "NOK", "DKK", "PLN",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BRIEF_CHARS = 10_000;
const MAX_DELIVERABLE_CHARS = 100_000;
const DELIVERABLE_KINDS = new Set(["text", "link", "file"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class EscrowService {
  private readonly store: JsonStore;
  private readonly paypal: PayPalClient;
  /** Per-milestone promise chains serialising mutating operations. */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(store: JsonStore, paypal: PayPalClient) {
    this.store = store;
    this.paypal = paypal;
  }

  /** Run `fn` while holding the milestone's lock (FIFO per milestone). */
  private async withMilestoneLock<T>(
    milestoneId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(milestoneId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.locks.set(milestoneId, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      // Re-audit F2.2: evict the chain once it has drained and nobody
      // has chained onto us, so the map cannot grow without bound.
      if (this.locks.get(milestoneId) === tail) {
        this.locks.delete(milestoneId);
      }
    }
  }

  private assertWritable(contractId: string): void {
    if (READ_ONLY_CONTRACT_IDS.has(contractId)) {
      throw httpError(
        403,
        "this contract is a locked showcase and cannot be changed",
      );
    }
  }

  private log(
    contractId: string,
    type: string,
    detail: Record<string, unknown>,
    milestoneId?: string,
  ): LedgerEvent {
    return this.store.addEvent({
      id: randomUUID(),
      ts: new Date().toISOString(),
      contractId,
      milestoneId,
      type,
      detail,
    });
  }

  private find(contractId: string, milestoneId?: string) {
    const contract = this.store.data.contracts.find((c) => c.id === contractId);
    if (!contract) throw httpError(404, `contract ${contractId} not found`);
    if (milestoneId === undefined) return { contract, milestone: undefined };
    const milestone = contract.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw httpError(404, `milestone ${milestoneId} not found`);
    return { contract, milestone };
  }

  // ---------------------------------------------------------------- create
  /**
   * Create a contract from a free-text brief. The AI layer drafts the
   * milestones + weighted criteria (live model when AI_* env vars are set,
   * deterministic stub otherwise); in live mode an invalid draft surfaces
   * as a 502 AiError rather than a fake contract.
   */
  async createContract(input: {
    brief: string;
    clientEmail: string;
    freelancerEmail: string;
    totalAmount: number;
    currency?: string;
  }): Promise<Contract> {
    if (!input.brief?.trim()) throw httpError(400, "brief is required");
    if (input.brief.length > MAX_BRIEF_CHARS) {
      throw httpError(400, `brief must be at most ${MAX_BRIEF_CHARS} characters`);
    }
    // Audit S-3/S-7: validate money, emails and currency at the boundary.
    if (
      typeof input.totalAmount !== "number" ||
      !Number.isFinite(input.totalAmount) ||
      input.totalAmount < 1 ||
      input.totalAmount > 1_000_000
    ) {
      throw httpError(400, "totalAmount must be a finite number between 1 and 1000000");
    }
    if (!EMAIL_RE.test(input.clientEmail ?? "")) {
      throw httpError(400, "clientEmail must be a valid email address");
    }
    if (!EMAIL_RE.test(input.freelancerEmail ?? "")) {
      throw httpError(400, "freelancerEmail must be a valid email address");
    }
    const currency = (input.currency ?? "USD").toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw httpError(400, `currency ${currency} is not supported`);
    }
    const id = `ct_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const draft = await draftContract({
      id,
      brief: input.brief.trim(),
      clientEmail: input.clientEmail,
      freelancerEmail: input.freelancerEmail,
      totalAmount: input.totalAmount,
      currency,
      now,
    });
    // Audit S-7: a drafted milestone of $0.00 could never be funded; refuse
    // the contract instead of persisting a permanently stuck milestone.
    if (draft.milestones.some((m) => !(m.amount >= 0.01))) {
      throw httpError(502, "the drafted milestones contain a non-positive amount");
    }
    const contract: Contract = {
      id,
      title: draft.title,
      brief: input.brief.trim(),
      clientEmail: input.clientEmail,
      freelancerEmail: input.freelancerEmail,
      currency,
      createdAt: now,
      milestones: draft.milestones.map((m, mi) => ({
        id: `${id}-m${mi + 1}`,
        title: m.title,
        amount: m.amount,
        currency,
        status: "draft",
        criteria: m.criteria.map((c, ci) => ({
          id: `${id}-m${mi + 1}-c${ci + 1}`,
          label: c.label,
          weight: c.weight,
          keywords: c.keywords,
        })),
      })),
    };
    this.store.data.contracts.push(contract);
    this.store.save();
    this.log(contract.id, "contract_created", {
      title: contract.title,
      milestones: contract.milestones.length,
      currency: contract.currency,
      generator: draft.generator,
    });
    return contract;
  }

  listContracts(): Contract[] {
    return this.store.data.contracts;
  }

  getContract(contractId: string): Contract {
    return this.find(contractId).contract;
  }

  // ------------------------------------------------------------------ fund
  /**
   * Client starts funding a milestone: create the PayPal order (AUTHORIZE).
   *
   * Mock mode: authorize immediately (the offline flow is unchanged) and
   * the milestone lands in "funded".
   *
   * Live mode: a real order cannot be authorized until the payer approves
   * it in PayPal Checkout, so the milestone stops at "awaiting_approval"
   * with the approval URL attached; confirmFunding() finishes the job once
   * PayPal reports the order APPROVED.
   */
  async fundMilestone(contractId: string, milestoneId: string) {
    return this.withMilestoneLock(milestoneId, () =>
      this.fundMilestoneLocked(contractId, milestoneId),
    );
  }

  private async fundMilestoneLocked(contractId: string, milestoneId: string) {
    this.assertWritable(contractId);
    const { contract, milestone } = this.find(contractId, milestoneId);
    const m = milestone as Milestone;
    // Re-audit F2.1: a milestone stranded in "funding" (process died
    // after the claim was persisted but before the order result was)
    // resumes here instead of being stuck forever: createOrder carries
    // the deterministic PayPal-Request-Id `${mid}-order` (and the mock
    // id is a deterministic hash), so re-presenting the same creation
    // returns the existing order rather than duplicating it.
    if (m.status !== "draft" && m.status !== "funding") {
      throw httpError(409, `milestone is ${m.status}, expected draft`);
    }
    // Audit T-7: claim the milestone synchronously (and persist) BEFORE
    // the first await, so a concurrent fund cannot create a second order.
    if (m.status === "draft") {
      m.status = "funding";
      this.store.save();
    }
    let order;
    try {
      order = await this.paypal.createOrder({
        amount: m.amount,
        currency: m.currency,
        referenceId: m.id,
        description: `ProofPay escrow: ${contract.title} / ${m.title}`,
        fundingContext: { contractId: contract.id, milestoneId: m.id },
      });
    } catch (err) {
      m.status = "draft";
      this.store.save();
      throw err;
    }
    m.paypalOrderId = order.id;
    if (this.paypal.mode === "mock") {
      const auth = await this.paypal.authorizeOrder(order.id);
      m.paypalAuthorizationId = auth.authorizationId;
      m.status = "funded";
      this.store.save();
      this.log(contract.id, "milestone_funded", {
        orderId: order.id,
        authorizationId: auth.authorizationId,
        amount: m.amount,
        currency: m.currency,
        paypalMode: this.paypal.mode,
      }, m.id);
      return m;
    }
    m.approvalUrl = order.approvalUrl;
    m.status = "awaiting_approval";
    this.store.save();
    this.log(contract.id, "order_created", {
      orderId: order.id,
      amount: m.amount,
      currency: m.currency,
      paypalMode: this.paypal.mode,
    }, m.id);
    return m;
  }

  /**
   * Finish funding after the client returns from PayPal Checkout (live
   * mode): if the order is APPROVED, authorize it so the funds are held
   * and the milestone becomes "funded". Idempotent — an already-funded
   * milestone is returned unchanged. A not-yet-approved order is a 409,
   * not an error: the client simply has not finished approving.
   *
   * Audit T-9: if PayPal already holds an authorization for the order
   * (e.g. an earlier authorize succeeded but its response was lost), the
   * existing authorization is ADOPTED instead of authorizing again.
   *
   * Mock mode: behaves like the old instant fund for a milestone that is
   * still draft/awaiting (the mock fund path is already instant, so this
   * only matters for a confirm call on an unfunded milestone).
   */
  async confirmFunding(contractId: string, milestoneId: string) {
    return this.withMilestoneLock(milestoneId, async () => {
      this.assertWritable(contractId);
      const { contract, milestone } = this.find(contractId, milestoneId);
      const m = milestone as Milestone;
      if (m.status === "funded") return m;
      if (this.paypal.mode === "mock") {
        if (
          m.status === "draft" ||
          m.status === "awaiting_approval" ||
          m.status === "funding"
        ) {
          m.status = "draft";
          return this.fundMilestoneLocked(contractId, milestoneId);
        }
        throw httpError(
          409,
          `milestone is ${m.status}, expected awaiting_approval`,
        );
      }
      if (m.status !== "awaiting_approval" || !m.paypalOrderId) {
        throw httpError(
          409,
          `milestone is ${m.status}, expected awaiting_approval`,
        );
      }
      const order = await this.paypal.getOrder(m.paypalOrderId);
      const existing = order.authorizations[0];
      if (existing && existing.status !== "CREATED") {
        // Re-audit F3.4: never adopt a dead authorization (VOIDED,
        // DENIED, EXPIRED, already CAPTURED) as "funded" — the milestone
        // would pass submit/verify and then fail at capture forever.
        throw httpError(
          409,
          `PayPal order ${m.paypalOrderId} has an authorization in status ${existing.status}; it cannot be adopted as held funds`,
        );
      }
      if (existing) {
        // T-9 adoption path: the money is already held; just record it.
        m.paypalAuthorizationId = existing.id;
        m.approvalUrl = undefined;
        m.status = "funded";
        this.store.save();
        this.log(contract.id, "funding_authorized", {
          orderId: m.paypalOrderId,
          authorizationId: existing.id,
          amount: m.amount,
          currency: m.currency,
          paypalMode: this.paypal.mode,
          adoptedExistingAuthorization: true,
        }, m.id);
        return m;
      }
      if (order.status !== "APPROVED") {
        throw httpError(
          409,
          `PayPal order ${m.paypalOrderId} is ${order.status}; the client has not approved the payment yet`,
        );
      }
      const auth = await this.paypal.authorizeOrder(m.paypalOrderId);
      m.paypalAuthorizationId = auth.authorizationId;
      m.approvalUrl = undefined;
      m.status = "funded";
      this.store.save();
      this.log(contract.id, "funding_authorized", {
        orderId: m.paypalOrderId,
        authorizationId: auth.authorizationId,
        amount: m.amount,
        currency: m.currency,
        paypalMode: this.paypal.mode,
      }, m.id);
      return m;
    });
  }

  // ---------------------------------------------------------------- submit
  async submitDeliverable(
    contractId: string,
    milestoneId: string,
    input: { kind?: string; content: string },
  ) {
    return this.withMilestoneLock(milestoneId, async () => {
      this.assertWritable(contractId);
      const { contract, milestone } = this.find(contractId, milestoneId);
      const m = milestone as Milestone;
      if (m.status !== "funded" && m.status !== "failed") {
        throw httpError(
          409,
          `milestone is ${m.status}, expected funded (or failed, for revision)`,
        );
      }
      if (!input.content?.trim()) throw httpError(400, "content is required");
      // Audit S-4: per-field caps (the deliverable is stored in db.json
      // and sent to the model on every verification).
      if (input.content.length > MAX_DELIVERABLE_CHARS) {
        throw httpError(
          400,
          `deliverable must be at most ${MAX_DELIVERABLE_CHARS} characters`,
        );
      }
      const kind = input.kind ?? "text";
      if (!DELIVERABLE_KINDS.has(kind)) {
        throw httpError(400, "kind must be one of text, link, file");
      }
      m.deliverable = {
        kind,
        content: input.content,
        submittedAt: new Date().toISOString(),
      };
      m.status = "submitted";
      // A fresh submission is the ONLY way to unlock a new verification
      // (audit T-1): the previous verdict is discarded with the revision.
      m.verification = undefined;
      this.store.save();
      this.log(contract.id, "deliverable_submitted", {
        kind: m.deliverable.kind,
        length: m.deliverable.content.length,
      }, m.id);
      return m;
    });
  }

  // ---------------------------------------------------------------- verify
  async verifyMilestone(contractId: string, milestoneId: string) {
    return this.withMilestoneLock(milestoneId, async () => {
      this.assertWritable(contractId);
      const { contract, milestone } = this.find(contractId, milestoneId);
      const m = milestone as Milestone;
      if (m.status !== "submitted" || !m.deliverable) {
        throw httpError(409, `milestone is ${m.status}, expected submitted`);
      }
      // Audit T-1: one verification per submission. A recorded verdict is
      // immutable — re-rolling the (non-deterministic) model until the
      // release fraction improves is exactly the escrow bypass this
      // blocks. A revision (new deliverable) clears the verdict first.
      if (m.verification) {
        throw httpError(
          409,
          "this deliverable has already been verified; the verdict is final for this submission — submit a revision to be verified again",
        );
      }
      const report = await verifyDeliverableWithAi({
        milestone: m,
        deliverableKind: m.deliverable.kind,
        deliverableContent: m.deliverable.content,
        now: new Date().toISOString(),
      });
      m.verification = report;
      if (report.overall === "fail") m.status = "failed";
      this.store.save();
      this.log(contract.id, "verified", {
        overall: report.overall,
        releaseFraction: report.releaseFraction,
        verifier: report.verifier, // "stub-v1" or "ai:<model>"
        criteria: report.criteria.map((c) => ({
          criterion: c.criterionId,
          status: c.status,
          evidenceVerified: c.evidenceVerified ?? null,
        })),
      }, m.id);
      return report;
    });
  }

  // --------------------------------------------------------------- release
  /**
   * Release after verification:
   *  - fraction 0   -> nothing moves; funds stay held, freelancer revises.
   *  - fraction > 0 -> capture the authorization in full, refund the
   *                    unreleased remainder to the client, and pay out the
   *                    released share to the freelancer.
   *
   * Safety (audit K-2/S-2/S-5/S-6/T-10): the whole operation runs under
   * the milestone lock; the status moves to "releasing" and is persisted
   * before the first PayPal call; every PayPal POST carries a
   * deterministic PayPal-Request-Id; each completed step's id is persisted
   * before the next step begins, so a retry resumes exactly where the
   * previous attempt stopped and can never pay twice. A repeated release
   * on a settled milestone returns the original settlement. A payout that
   * PayPal rejects permanently lands in the terminal, visible
   * "settlement_failed" state with the captured funds accounted for in
   * the ledger, instead of hanging forever in "submitted".
   */
  async releaseMilestone(contractId: string, milestoneId: string) {
    return this.withMilestoneLock(milestoneId, async () => {
      this.assertWritable(contractId);
      const { contract, milestone } = this.find(contractId, milestoneId);
      const m = milestone as Milestone;
      if (!m.verification) {
        throw httpError(409, "milestone has not been verified yet");
      }
      // Idempotent replay: a settled milestone returns its settlement.
      if (m.status === "released") {
        const f = m.verification.releaseFraction;
        const releaseAmount = round2(m.amount * f);
        return {
          released: true,
          alreadyReleased: true,
          releaseAmount,
          remainder: round2(m.amount - releaseAmount),
          milestone: m,
        };
      }
      if (m.status === "settlement_failed") {
        throw httpError(
          409,
          `settlement failed permanently: ${m.settlementError ?? "payout failed"} — the captured funds are accounted for in the ledger and need operator handling`,
        );
      }
      // Audit R-7: explicit status precondition (submitted, or releasing
      // when resuming an interrupted attempt).
      if (m.status !== "submitted" && m.status !== "releasing") {
        throw httpError(409, `milestone is ${m.status}, expected submitted`);
      }
      if (!m.paypalAuthorizationId) {
        throw httpError(409, "milestone is not funded");
      }
      // Audit T-6: never release real money on a keyword-stub verdict.
      if (
        this.paypal.mode === "live" &&
        loadAiConfig().mode === "stub" &&
        process.env.PROOFPAY_ALLOW_STUB_RELEASE !== "1"
      ) {
        throw httpError(
          409,
          "refusing to release live PayPal funds while the AI verifier is in stub mode",
        );
      }

      const fraction = m.verification.releaseFraction;
      // Audit S-2: the fraction is validated in code at the money boundary.
      if (!Number.isFinite(fraction) || fraction > 1) {
        throw httpError(409, `invalid release fraction: ${fraction}`);
      }
      if (fraction <= 0) {
        this.log(contract.id, "release_blocked", {
          reason: "verification failed on all criteria; funds remain held",
        }, m.id);
        return { released: false, milestone: m };
      }

      const releaseAmount = round2(m.amount * fraction);
      const remainder = round2(m.amount - releaseAmount);
      // Audit S-5: a sub-cent release rounds to $0.00 — treat it as a zero
      // release and keep the funds held instead of capturing and then
      // failing on a $0.00 payout.
      if (releaseAmount <= 0) {
        this.log(contract.id, "release_blocked", {
          reason: `release fraction ${fraction} rounds to 0.00; funds remain held`,
        }, m.id);
        return { released: false, milestone: m };
      }

      // Claim the release BEFORE any PayPal call (persisted).
      if (m.status !== "releasing") {
        m.status = "releasing";
        this.store.save();
      }

      // Resumable capture: a previous attempt may already have captured
      // (and refunded) before a later step failed; never redo those steps.
      let captureId = m.paypalCaptureId;
      if (!captureId) {
        const capture = await this.paypal.captureAuthorization({
          authorizationId: m.paypalAuthorizationId,
          currency: m.currency,
          finalCapture: true,
          requestId: `${m.id}-capture`,
        });
        captureId = capture.captureId;
        m.paypalCaptureId = captureId;
        this.store.save();
        this.log(contract.id, "captured", {
          captureId,
          amount: m.amount,
          currency: m.currency,
          paypalStatus: capture.status,
        }, m.id);
        // Audit S-6: only settle on money PayPal actually completed.
        if (capture.status !== "COMPLETED") {
          throw httpError(
            502,
            `PayPal capture ${captureId} is ${capture.status}, not COMPLETED; settlement paused and can be retried`,
          );
        }
      } else {
        // Re-audit F3.1: on a RESUMED release, re-examine the existing
        // capture's live status instead of trusting the status seen by
        // the attempt that created it (a capture left PENDING by a
        // paused attempt must not be settled on blind).
        const capture = await this.paypal.getCapture(captureId);
        if (capture.status !== "COMPLETED") {
          throw httpError(
            502,
            `PayPal capture ${captureId} is ${capture.status}, not COMPLETED; settlement paused and can be retried`,
          );
        }
      }

      if (remainder > 0 && !m.paypalRefundId) {
        const refund = await this.paypal.refundCapture({
          captureId,
          amount: remainder,
          currency: m.currency,
          note: "ProofPay: unreleased portion returned after partial verification",
          requestId: `${m.id}-refund`,
        });
        m.paypalRefundId = refund.refundId;
        this.store.save();
        this.log(contract.id, "refunded", {
          refundId: refund.refundId,
          amount: remainder,
          currency: m.currency,
          to: "client",
          paypalStatus: refund.status,
        }, m.id);
      }

      // ---- payout, with reconciliation (audit T-10) ----
      if (m.paypalPayoutBatchId) {
        // A previous attempt created the batch; refresh its state instead
        // of paying again.
        const batch = await this.paypal.getPayoutBatch(m.paypalPayoutBatchId);
        if (batch.batchStatus === "DENIED" || batch.batchStatus === "CANCELED") {
          // Re-audit F3.3: a CANCELED batch moved no money either; it
          // must not be recorded as paid.
          return this.markSettlementFailed(contract, m,
            `PayPal payout batch ${m.paypalPayoutBatchId} was ${batch.batchStatus}`);
        }
        m.status = "released";
        m.settlementError = undefined;
        this.store.save();
        this.log(contract.id, "payout_confirmed", {
          payoutBatchId: m.paypalPayoutBatchId,
          batchStatus: batch.batchStatus,
          amount: releaseAmount,
          currency: m.currency,
          to: contract.freelancerEmail,
        }, m.id);
        return { released: true, releaseAmount, remainder, milestone: m };
      }

      m.payoutAttempted = true;
      this.store.save();
      let payout;
      try {
        payout = await this.paypal.createPayout({
          email: contract.freelancerEmail,
          amount: releaseAmount,
          currency: m.currency,
          note: `ProofPay release for milestone "${m.title}" (${Math.round(fraction * 100)}% verified)`,
          senderItemId: `${m.id}-release`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const statusMatch = message.match(/failed: (\d{3})\b/);
        const status = statusMatch ? Number(statusMatch[1]) : null;
        // A 4xx from the Payouts API is normally a permanent rejection
        // (bad receiver, invalid request): park the milestone in the
        // terminal settlement_failed state. Re-audit F3.2: 401/403
        // (expired token / fixable credentials) and 429 (rate limit)
        // are NOT permanent — they stay resumable in "releasing", as do
        // 5xx and network errors.
        if (
          status !== null &&
          status >= 400 &&
          status < 500 &&
          status !== 401 &&
          status !== 403 &&
          status !== 429
        ) {
          return this.markSettlementFailed(contract, m, message);
        }
        throw err;
      }
      m.paypalPayoutBatchId = payout.payoutBatchId;
      if (payout.batchStatus === "DENIED" || payout.batchStatus === "CANCELED") {
        return this.markSettlementFailed(contract, m,
          `PayPal payout batch ${payout.payoutBatchId} was ${payout.batchStatus}`);
      }
      m.status = "released";
      this.store.save();
      this.log(contract.id, "payout_sent", {
        payoutBatchId: payout.payoutBatchId,
        batchStatus: payout.batchStatus,
        amount: releaseAmount,
        currency: m.currency,
        to: contract.freelancerEmail,
      }, m.id);

      return { released: true, releaseAmount, remainder, milestone: m };
    });
  }

  /**
   * Terminal settlement failure (audit T-10): the capture (and any refund)
   * already happened, but the earned share could not be paid out. The
   * milestone stops moving and says why; the ledger carries the full
   * accounting so an operator can settle manually.
   */
  private markSettlementFailed(
    contract: Contract,
    m: Milestone,
    error: string,
  ) {
    // Re-audit F6.2: the milestone (and therefore settlementError) is
    // served by the public contract API — never persist raw upstream
    // error text there. Batch-status messages are our own strings and
    // are safe to keep; HTTP failures collapse to their status code.
    const statusMatch = error.match(/failed: (\d{3})\b/);
    const publicError = error.startsWith("PayPal payout batch")
      ? error
      : statusMatch
        ? `payout failed permanently (PayPal HTTP ${statusMatch[1]}); the captured funds are accounted for in the ledger`
        : "payout failed permanently; the captured funds are accounted for in the ledger";
    m.status = "settlement_failed";
    m.settlementError = publicError;
    this.store.save();
    this.log(contract.id, "settlement_failed", {
      error: publicError,
      capturedAmount: m.amount,
      currency: m.currency,
      captureId: m.paypalCaptureId ?? null,
      refundId: m.paypalRefundId ?? null,
      payoutBatchId: m.paypalPayoutBatchId ?? null,
      payoutAttempted: m.payoutAttempted ?? false,
      intendedFreelancerEmail: contract.freelancerEmail,
    }, m.id);
    return { released: false, settlementFailed: true, error: publicError, milestone: m };
  }

  // ---------------------------------------------------------------- events
  listEvents(contractId?: string): LedgerEvent[] {
    const events = this.store.data.events;
    return contractId
      ? events.filter((e) => e.contractId === contractId)
      : events;
  }

  /**
   * Record a webhook in the ledger (audit S-1): the stored payload is
   * capped so an attacker cannot bloat the ledger with arbitrary bodies;
   * id/type survive for reconciliation.
   */
  recordWebhook(contractId: string, event: unknown, verified: boolean | null) {
    const raw = JSON.stringify(event ?? {});
    const e = (event ?? {}) as { id?: string; event_type?: string };
    const stored =
      raw.length <= 8_000
        ? { verified, event }
        : {
            verified,
            eventId: e.id ?? null,
            eventType: e.event_type ?? null,
            truncated: true,
            preview: raw.slice(0, 2_000),
          };
    return this.log(contractId, "webhook_received", stored);
  }
}

export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}
