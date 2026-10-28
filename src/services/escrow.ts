import { randomUUID } from "node:crypto";
import type { PayPalClient } from "../paypal/client.ts";
import type { JsonStore } from "../store.ts";
import { draftContract } from "../ai/drafter.ts";
import { verifyDeliverableWithAi } from "../ai/verifier.ts";
import type { Contract, LedgerEvent, Milestone } from "../types.ts";

/**
 * Escrow domain flow:
 *   createContract -> fundMilestone -> submitDeliverable -> verifyMilestone
 *   -> releaseMilestone
 *
 * Every step appends to the ledger (the dispute-ready evidence trail) and
 * persists through the JSON store.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class EscrowService {
  private readonly store: JsonStore;
  private readonly paypal: PayPalClient;

  constructor(store: JsonStore, paypal: PayPalClient) {
    this.store = store;
    this.paypal = paypal;
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
    if (!(input.totalAmount > 0)) {
      throw httpError(400, "totalAmount must be > 0");
    }
    const id = `ct_${randomUUID().slice(0, 8)}`;
    const currency = (input.currency ?? "USD").toUpperCase();
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
  /** Client funds a milestone: create PayPal order (AUTHORIZE) + authorize. */
  async fundMilestone(contractId: string, milestoneId: string) {
    const { contract, milestone } = this.find(contractId, milestoneId);
    const m = milestone as Milestone;
    if (m.status !== "draft") {
      throw httpError(409, `milestone is ${m.status}, expected draft`);
    }
    const order = await this.paypal.createOrder({
      amount: m.amount,
      currency: m.currency,
      referenceId: m.id,
      description: `ProofPay escrow: ${contract.title} / ${m.title}`,
    });
    const auth = await this.paypal.authorizeOrder(order.id);
    m.paypalOrderId = order.id;
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

  // ---------------------------------------------------------------- submit
  submitDeliverable(
    contractId: string,
    milestoneId: string,
    input: { kind?: string; content: string },
  ) {
    const { contract, milestone } = this.find(contractId, milestoneId);
    const m = milestone as Milestone;
    if (m.status !== "funded" && m.status !== "failed") {
      throw httpError(
        409,
        `milestone is ${m.status}, expected funded (or failed, for revision)`,
      );
    }
    if (!input.content?.trim()) throw httpError(400, "content is required");
    m.deliverable = {
      kind: input.kind ?? "text",
      content: input.content,
      submittedAt: new Date().toISOString(),
    };
    m.status = "submitted";
    m.verification = undefined;
    this.store.save();
    this.log(contract.id, "deliverable_submitted", {
      kind: m.deliverable.kind,
      length: m.deliverable.content.length,
    }, m.id);
    return m;
  }

  // ---------------------------------------------------------------- verify
  async verifyMilestone(contractId: string, milestoneId: string) {
    const { contract, milestone } = this.find(contractId, milestoneId);
    const m = milestone as Milestone;
    if (m.status !== "submitted" || !m.deliverable) {
      throw httpError(409, `milestone is ${m.status}, expected submitted`);
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
      })),
    }, m.id);
    return report;
  }

  // --------------------------------------------------------------- release
  /**
   * Release after verification:
   *  - fraction 0   -> nothing moves; funds stay held, freelancer revises.
   *  - fraction > 0 -> capture the authorization in full, refund the
   *                    unreleased remainder to the client, and pay out the
   *                    released share to the freelancer.
   */
  async releaseMilestone(contractId: string, milestoneId: string) {
    const { contract, milestone } = this.find(contractId, milestoneId);
    const m = milestone as Milestone;
    if (!m.verification) {
      throw httpError(409, "milestone has not been verified yet");
    }
    if (m.status === "released") {
      throw httpError(409, "milestone already released");
    }
    if (!m.paypalAuthorizationId) {
      throw httpError(409, "milestone is not funded");
    }

    const fraction = m.verification.releaseFraction;
    if (fraction <= 0) {
      this.log(contract.id, "release_blocked", {
        reason: "verification failed on all criteria; funds remain held",
      }, m.id);
      return { released: false, milestone: m };
    }

    const releaseAmount = round2(m.amount * fraction);
    const remainder = round2(m.amount - releaseAmount);

    const capture = await this.paypal.captureAuthorization({
      authorizationId: m.paypalAuthorizationId,
      currency: m.currency,
      finalCapture: true,
    });
    m.paypalCaptureId = capture.captureId;
    this.log(contract.id, "captured", {
      captureId: capture.captureId,
      amount: m.amount,
      currency: m.currency,
    }, m.id);

    if (remainder > 0) {
      const refund = await this.paypal.refundCapture({
        captureId: capture.captureId,
        amount: remainder,
        currency: m.currency,
        note: "ProofPay: unreleased portion returned after partial verification",
      });
      m.paypalRefundId = refund.refundId;
      this.log(contract.id, "refunded", {
        refundId: refund.refundId,
        amount: remainder,
        currency: m.currency,
        to: "client",
      }, m.id);
    }

    const payout = await this.paypal.createPayout({
      email: contract.freelancerEmail,
      amount: releaseAmount,
      currency: m.currency,
      note: `ProofPay release for milestone "${m.title}" (${Math.round(fraction * 100)}% verified)`,
      senderItemId: `${m.id}-release`,
    });
    m.paypalPayoutBatchId = payout.payoutBatchId;
    m.status = "released";
    this.store.save();
    this.log(contract.id, "payout_sent", {
      payoutBatchId: payout.payoutBatchId,
      amount: releaseAmount,
      currency: m.currency,
      to: contract.freelancerEmail,
    }, m.id);

    return { released: true, releaseAmount, remainder, milestone: m };
  }

  // ---------------------------------------------------------------- events
  listEvents(contractId?: string): LedgerEvent[] {
    const events = this.store.data.events;
    return contractId
      ? events.filter((e) => e.contractId === contractId)
      : events;
  }

  recordWebhook(contractId: string, event: unknown, verified: boolean | null) {
    return this.log(contractId, "webhook_received", {
      verified,
      event,
    });
  }
}

export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}
