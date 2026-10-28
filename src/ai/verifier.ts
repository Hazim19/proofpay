import { AiError, chatCompletionText, loadAiConfig, parseJsonObject } from "./client.ts";
import {
  buildVerifierUserMessage,
  VERIFIER_SYSTEM_PROMPT,
} from "./prompts.ts";
import { verifyDeliverable } from "./stubs.ts";
import type {
  CriterionResult,
  CriterionStatus,
  Milestone,
  VerificationReport,
} from "../types.ts";

/**
 * ============================================================================
 * DELIVERABLE VERIFIER — judges a submitted deliverable against a
 * milestone's acceptance criteria and computes the release fraction.
 *
 * Live mode: one structured chat call (prompts in ./prompts.ts) returning a
 * verdict per criterion. Two defences keep money safe:
 *   1. The prompt allows "pass" ONLY with concrete cited evidence.
 *   2. A post-check downgrades any "pass" whose evidence is missing, tiny,
 *      or generic praise ("looks good", "well done", ...) to "partial".
 * A criterion the model returns no verdict for counts as "fail" — silence
 * never releases money. An unparseable response is a clean AiError/502.
 *
 * Stub mode: delegates to the deterministic keyword verifier in ./stubs.ts.
 *
 * Release fraction = Σ weight × (pass 1, partial 0.5, fail 0).
 * ============================================================================
 */

const VERDICTS: readonly string[] = ["pass", "partial", "fail"];

/** Generic-praise phrases that can never serve as evidence for a pass. */
const VAGUE_EVIDENCE_PATTERNS: RegExp[] = [
  /^(it\s+)?(looks|seems|is|sounds)\s+(good|great|fine|ok|okay|complete|professional|nice)\.?$/i,
  /^(well\s+(done|written)|good\s+(job|work)|nice\s+work|excellent\s+work)\.?$/i,
  /^(yes|done|present|ok|okay|good|complete|provided|included)\.?$/i,
  /^the\s+deliverable\s+(is|looks|seems)\s+/i,
];

function isConcreteEvidence(evidence: string, criterionLabel: string): boolean {
  const ev = evidence.trim();
  if (ev.length < 12) return false;
  if (VAGUE_EVIDENCE_PATTERNS.some((re) => re.test(ev))) return false;
  // Evidence that merely restates the criterion is not evidence.
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (normalize(ev) === normalize(criterionLabel)) return false;
  return true;
}

export async function verifyDeliverableWithAi(input: {
  milestone: Milestone;
  deliverableKind: string;
  deliverableContent: string;
  now: string;
}): Promise<VerificationReport> {
  const config = loadAiConfig();
  if (config.mode === "stub") {
    return verifyDeliverable({
      milestone: input.milestone,
      deliverableContent: input.deliverableContent,
      now: input.now,
    });
  }

  const raw = await chatCompletionText(config, [
    { role: "system", content: VERIFIER_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildVerifierUserMessage({
        milestoneTitle: input.milestone.title,
        amount: input.milestone.amount,
        currency: input.milestone.currency,
        criteria: input.milestone.criteria.map((c) => ({
          id: c.id,
          label: c.label,
          weight: c.weight,
        })),
        deliverableKind: input.deliverableKind,
        deliverableContent: input.deliverableContent,
      }),
    },
  ]);

  const obj = parseJsonObject(raw);
  if (!Array.isArray(obj.criteria)) {
    throw new AiError("verifier output has no criteria array");
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of obj.criteria) {
    if (typeof entry === "object" && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (typeof e.criterionId === "string") byId.set(e.criterionId, e);
    }
  }

  const results: CriterionResult[] = input.milestone.criteria.map((c) => {
    const entry = byId.get(c.id);
    if (!entry || typeof entry.verdict !== "string" || !VERDICTS.includes(entry.verdict)) {
      return {
        criterionId: c.id,
        label: c.label,
        status: "fail" as CriterionStatus,
        reason: "The verifier returned no valid verdict for this criterion.",
      };
    }
    let status = entry.verdict as CriterionStatus;
    const evidence = typeof entry.evidence === "string" ? entry.evidence.trim() : "";
    let reason = typeof entry.reason === "string" ? entry.reason.trim() : "";

    if (status === "pass" && !isConcreteEvidence(evidence, c.label)) {
      status = "partial";
      reason =
        `${reason} (Downgraded from pass: the cited evidence was not concrete.)`.trim();
    }
    return {
      criterionId: c.id,
      label: c.label,
      status,
      reason: evidence
        ? `${reason} Evidence: ${evidence}`.trim()
        : reason || "No reason given.",
    };
  });

  const weightOf = new Map(input.milestone.criteria.map((c) => [c.id, c.weight]));
  let fraction = 0;
  for (const r of results) {
    const w = weightOf.get(r.criterionId) ?? 0;
    fraction += w * (r.status === "pass" ? 1 : r.status === "partial" ? 0.5 : 0);
  }
  const releaseFraction = Math.round(fraction * 100) / 100;
  const overall: CriterionStatus =
    releaseFraction >= 1 ? "pass" : releaseFraction <= 0 ? "fail" : "partial";

  return {
    milestoneId: input.milestone.id,
    checkedAt: input.now,
    overall,
    releaseFraction,
    criteria: results,
    verifier: `ai:${config.model}`,
  };
}
