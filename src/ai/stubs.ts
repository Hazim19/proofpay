import type {
  Contract,
  Criterion,
  CriterionResult,
  Milestone,
  VerificationReport,
} from "../types.ts";

/**
 * ============================================================================
 * AI STUBS — deterministic templates backing the AI layer's offline mode.
 *
 * As of the AI-layer build, these functions are no longer called directly by
 * the escrow service. They are the FALLBACK used by src/ai/drafter.ts and
 * src/ai/verifier.ts whenever the AI environment (AI_BASE_URL / AI_API_KEY /
 * AI_MODEL) is not fully configured, so the app still runs fully offline.
 * In live mode the real model path is used instead; invalid model output
 * surfaces as a 502 error, never as one of these templates.
 *
 * Both stubs are deliberately deterministic (same input -> same output) so
 * the escrow flow can be developed, tested and demoed offline.
 * ============================================================================
 */

function slugWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Stub contract generator. Splits the total into two milestones (draft
 * delivery + final delivery) and attaches three measurable criteria to each,
 * seeded with keywords extracted from the brief.
 */
export function generateContractFromBrief(input: {
  id: string;
  brief: string;
  clientEmail: string;
  freelancerEmail: string;
  totalAmount: number;
  currency: string;
  now: string;
}): Contract {
  const words = slugWords(input.brief);
  const topic = words.slice(0, 3).join(" ") || "the work";
  const firstAmount = round2(input.totalAmount / 2);
  const secondAmount = round2(input.totalAmount - firstAmount);

  const mkCriteria = (stage: string, focus: string[]): Criterion[] => [
    {
      id: `${stage}-c1`,
      label: `Deliverable covers the brief, specifically: ${topic}`,
      weight: 0.5,
      keywords: focus.length ? focus : words.slice(0, 4),
    },
    {
      id: `${stage}-c2`,
      label: "Delivered in the agreed format, complete and ready to use",
      weight: 0.3,
      keywords: ["format", "complete", "final"],
    },
    {
      id: `${stage}-c3`,
      label: "Includes a summary of what was done and how to use it",
      weight: 0.2,
      keywords: ["summary", "how to", "usage", "notes"],
    },
  ];

  const milestones: Milestone[] = [
    {
      id: `${input.id}-m1`,
      title: "Draft delivery",
      amount: firstAmount,
      currency: input.currency,
      status: "draft",
      criteria: mkCriteria("m1", words.slice(0, 3)),
    },
    {
      id: `${input.id}-m2`,
      title: "Final delivery",
      amount: secondAmount,
      currency: input.currency,
      status: "draft",
      criteria: mkCriteria("m2", words.slice(3, 6)),
    },
  ];

  return {
    id: input.id,
    title: `Contract: ${input.brief.slice(0, 60)}${input.brief.length > 60 ? "…" : ""}`,
    brief: input.brief,
    clientEmail: input.clientEmail,
    freelancerEmail: input.freelancerEmail,
    currency: input.currency,
    createdAt: input.now,
    milestones,
  };
}

/**
 * Stub verifier. Scores each criterion by keyword coverage of the
 * deliverable text: all keywords found -> pass, some -> partial, none ->
 * fail. Release fraction is the weighted score (pass = 1, partial = 0.5,
 * fail = 0).
 */
export function verifyDeliverable(input: {
  milestone: Milestone;
  deliverableContent: string;
  now: string;
}): VerificationReport {
  const text = input.deliverableContent.toLowerCase();
  const results: CriterionResult[] = input.milestone.criteria.map((c) => {
    const found = c.keywords.filter((k) => text.includes(k.toLowerCase()));
    if (c.keywords.length > 0 && found.length === c.keywords.length) {
      return {
        criterionId: c.id,
        label: c.label,
        status: "pass",
        reason: `All expected elements found (${found.join(", ")}).`,
      };
    }
    if (found.length > 0) {
      return {
        criterionId: c.id,
        label: c.label,
        status: "partial",
        reason: `Only some expected elements found (${found.join(", ")}); the rest are missing.`,
      };
    }
    return {
      criterionId: c.id,
      label: c.label,
      status: "fail",
      reason: "None of the expected elements were found in the deliverable.",
    };
  });

  const weightOf = new Map(
    input.milestone.criteria.map((c) => [c.id, c.weight]),
  );
  let fraction = 0;
  for (const r of results) {
    const w = weightOf.get(r.criterionId) ?? 0;
    fraction += w * (r.status === "pass" ? 1 : r.status === "partial" ? 0.5 : 0);
  }
  const releaseFraction = Math.round(fraction * 100) / 100;
  const overall =
    releaseFraction >= 1 ? "pass" : releaseFraction <= 0 ? "fail" : "partial";

  return {
    milestoneId: input.milestone.id,
    checkedAt: input.now,
    overall,
    releaseFraction,
    criteria: results,
    verifier: "stub-v1",
  };
}
