import type { LedgerEvent, Milestone } from "./types.ts";

export function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch] as string,
  );
}

export function money(amount: unknown, currency?: string): string {
  const n = Number(amount);
  return (
    (currency || "USD") +
    " " +
    (Number.isFinite(n) ? n.toFixed(2) : esc(amount))
  );
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting client approval",
};
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/* Milestone lifecycle: Draft → Funded → Submitted → Verified → Released,
   rendered from the milestone's real status (and its verification, when one
   exists while the status is still "submitted"). */
export const LIFECYCLE = ["Draft", "Funded", "Submitted", "Verified", "Released"];
export type StepState = "done" | "current" | "todo" | "fail";

export function stepperStates(m: Milestone): StepState[] {
  const overall = m.verification?.overall;
  switch (m.status) {
    case "draft":
      return ["current", "todo", "todo", "todo", "todo"];
    case "awaiting_approval":
      return ["done", "current", "todo", "todo", "todo"];
    case "funded":
      return ["done", "done", "current", "todo", "todo"];
    case "submitted":
      if (!m.verification) return ["done", "done", "done", "current", "todo"];
      return overall === "fail"
        ? ["done", "done", "done", "fail", "todo"]
        : ["done", "done", "done", "done", "current"];
    case "failed":
      return ["done", "done", "done", "fail", "todo"];
    case "released":
      return ["done", "done", "done", "done", "done"];
    default:
      return ["current", "todo", "todo", "todo", "todo"];
  }
}

/** Readable one-line summary of a ledger event's detail object. */
export function detailText(d: Record<string, unknown> | undefined): string {
  if (!d || typeof d !== "object") return "";
  const parts: string[] = [];
  if (d.amount !== undefined) parts.push(money(d.amount, d.currency as string));
  if (d.title) parts.push(String(d.title));
  if (d.generator) parts.push("drafted by " + d.generator);
  if (d.orderId) parts.push("order " + d.orderId);
  if (d.authorizationId) parts.push("authorisation " + d.authorizationId);
  if (d.captureId) parts.push("capture " + d.captureId);
  if (d.refundId)
    parts.push("refund " + d.refundId + (d.to ? " to " + d.to : ""));
  if (d.payoutBatchId)
    parts.push("payout batch " + d.payoutBatchId + (d.to ? " to " + d.to : ""));
  if (d.verifier)
    parts.push(
      "verifier " +
        d.verifier +
        (d.overall ? " · " + d.overall : "") +
        (d.releaseFraction !== undefined
          ? " · release " + Math.round(Number(d.releaseFraction) * 100) + "%"
          : ""),
    );
  if (d.kind)
    parts.push(
      "deliverable: " + d.kind + (d.length ? ", " + d.length + " chars" : ""),
    );
  if (d.paypalMode) parts.push("PayPal " + d.paypalMode);
  return parts.join(" · ");
}

export const EV_CLASS: Record<string, string> = {
  captured: "money",
  refunded: "money",
  payout_sent: "money",
  verified: "ai",
  contract_created: "ai",
  order_created: "fund",
  funding_authorized: "fund",
};

export function sumEvents(
  events: LedgerEvent[],
  types: string[],
): number {
  return events
    .filter((e) => types.includes(e.type))
    .reduce((s, e) => s + (Number(e.detail?.amount) || 0), 0);
}

/** Split an amount into currency word + figure, for display typography
    (small "USD" beside a large serif figure, as in the register). */
export function moneyFig(
  amount: unknown,
  currency?: string,
): { cur: string; num: string } {
  const n = Number(amount);
  return {
    cur: currency || "USD",
    num: Number.isFinite(n) ? n.toFixed(2) : String(amount ?? ""),
  };
}

/** "28 October 2026" from an ISO timestamp (read in UTC so the day the
    register shows never shifts with the viewer's timezone). */
export function longDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Register wording for a milestone's present state. */
export function milestoneStateLabel(m: Milestone): string {
  switch (m.status) {
    case "draft":
      return "Draft — awaiting funding";
    case "awaiting_approval":
      return "Awaiting client approval";
    case "funded":
      return "Funded — held in escrow";
    case "submitted":
      return m.verification
        ? "Examined — awaiting settlement"
        : "Submitted — under examination";
    case "released":
      return "Settled — released";
    case "failed":
      return "Examination failed — funds held";
    default:
      return m.status;
  }
}

/** Examination-table wording for a criterion finding. */
export function findingLabel(status: string): string {
  return status === "pass"
    ? "Satisfied"
    : status === "partial"
      ? "Met in part"
      : "Not met";
}
