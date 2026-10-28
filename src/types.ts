// Shared domain types for ProofPay.

export type CriterionStatus = "pass" | "partial" | "fail";

export type MilestoneStatus =
  | "draft" // created, not yet funded
  | "funding" // fund call in flight (order being created); guards concurrent funds
  | "awaiting_approval" // live mode: PayPal order created, waiting for the client to approve it in PayPal Checkout
  | "funded" // money authorized (held) via PayPal
  | "submitted" // freelancer delivered work
  | "releasing" // release in flight (or interrupted mid-settlement; resumable)
  | "released" // verified funds captured + paid out
  | "settlement_failed" // captured, but the payout failed permanently; operator attention required
  | "failed"; // verification failed, funds still held, awaiting revision

export interface Criterion {
  id: string;
  label: string;
  /** Relative weight used for proportional release. Weights in a milestone sum to ~1. */
  weight: number;
  /** Keywords the (stub) verifier looks for in the deliverable. Replaced by the real AI. */
  keywords: string[];
}

export interface Deliverable {
  kind: string; // e.g. "text" | "link" | "file"
  content: string;
  submittedAt: string;
}

export interface CriterionResult {
  criterionId: string;
  label: string;
  status: CriterionStatus;
  reason: string;
  /** The evidence quote the verifier cited for this criterion, when any. */
  evidence?: string;
  /**
   * Set by the code-side evidence gate (never by the model): true when the
   * cited evidence was matched verbatim/fuzzily inside the deliverable.
   */
  evidenceVerified?: boolean;
}

export interface VerificationReport {
  milestoneId: string;
  checkedAt: string;
  overall: CriterionStatus;
  /** 0..1 — share of the milestone amount to release to the freelancer. */
  releaseFraction: number;
  criteria: CriterionResult[];
  verifier: string; // identifies which verifier produced the report ("stub-v1" for now)
}

export interface Milestone {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: MilestoneStatus;
  criteria: Criterion[];
  // PayPal linkage (ids only, never credentials)
  paypalOrderId?: string;
  /** Live mode only: payer approval URL in PayPal Checkout, set while awaiting_approval. */
  approvalUrl?: string;
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  paypalRefundId?: string;
  paypalPayoutBatchId?: string;
  /** True once a payout creation has been attempted for the current release. */
  payoutAttempted?: boolean;
  /** Human-readable terminal settlement problem (status settlement_failed). */
  settlementError?: string;
  deliverable?: Deliverable;
  verification?: VerificationReport;
}

export interface Contract {
  id: string;
  title: string;
  brief: string;
  clientEmail: string;
  freelancerEmail: string;
  currency: string;
  createdAt: string;
  milestones: Milestone[];
}

export interface LedgerEvent {
  id: string;
  ts: string;
  contractId: string;
  milestoneId?: string;
  type: string; // contract_created | milestone_funded | deliverable_submitted | verified | captured | refunded | payout_sent | webhook_received | release_blocked ...
  detail: Record<string, unknown>;
}

export interface Db {
  contracts: Contract[];
  events: LedgerEvent[];
}
