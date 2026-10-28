// Shared domain types for ProofPay.

export type CriterionStatus = "pass" | "partial" | "fail";

export type MilestoneStatus =
  | "draft" // created, not yet funded
  | "funded" // money authorized (held) via PayPal
  | "submitted" // freelancer delivered work
  | "released" // verified funds captured + paid out
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
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  paypalRefundId?: string;
  paypalPayoutBatchId?: string;
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
