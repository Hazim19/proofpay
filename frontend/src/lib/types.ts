// Mirrors src/types.ts on the backend (API contract — do not drift).

export type CriterionStatus = "pass" | "partial" | "fail";

export type MilestoneStatus =
  | "draft"
  | "awaiting_approval"
  | "funded"
  | "submitted"
  | "released"
  | "failed";

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  keywords: string[];
}

export interface Deliverable {
  kind: string;
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
  releaseFraction: number;
  criteria: CriterionResult[];
  verifier: string;
}

export interface Milestone {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: MilestoneStatus;
  criteria: Criterion[];
  paypalOrderId?: string;
  approvalUrl?: string;
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
  type: string;
  detail: Record<string, unknown>;
}

export interface Health {
  ok: boolean;
  service: string;
  paypalMode: string;
  paypalEnv: string;
  aiMode: string;
  aiModel: string | null;
  ts: string;
}
