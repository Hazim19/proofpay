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
 * verdict per criterion. Three defences keep money safe:
 *   1. The prompt allows "pass" ONLY with concrete cited evidence.
 *   2. A code-side evidence gate (audit T-5) downgrades any "pass" OR
 *      "partial" whose cited evidence is missing, generic praise, or NOT
 *      FOUND in the actual deliverable text to "fail" — the model's word
 *      alone never releases money, and neither do quotes fabricated by
 *      the model or planted via prompt injection in the deliverable.
 *   3. The deliverable reaches the model framed as untrusted data, never
 *      as instructions (see prompts.ts).
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

/**
 * Code-side evidence gate (audit T-5). The model's cited evidence is only
 * believed when it can be FOUND in the actual deliverable text. Matching:
 * both texts are normalised (lowercase, non-alphanumerics collapsed to
 * single spaces, trimmed), then the evidence matches when EITHER
 *   (a) the normalised evidence (length >= 12 chars) is a substring of the
 *       normalised deliverable, OR
 *   (b) fuzzy word-run match: the longest run of consecutive evidence
 *       words that appears contiguously in the deliverable covers at
 *       least 60% of the evidence's words AND is at least 4 words long.
 * Anything else — invented quotes, paraphrases, quotes planted by prompt
 * injection that do not come from the deliverable — does not match.
 */
/** Function words that carry no evidentiary content on their own. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "as", "at", "by", "from", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "these", "those", "all", "any", "every",
  "how", "what", "when", "where", "which", "who", "will", "would", "can",
  "could", "has", "have", "had", "not", "no", "yes", "so", "if", "then",
  "than", "into", "over", "under", "per", "via",
]);

export function evidenceMatchesDeliverable(
  evidence: string,
  deliverableContent: string,
): boolean {
  const normalize = (s: string) =>
    s
      // Re-audit F1.4: fold accents/diacritics identically on both
      // sides (NFKD + strip combining marks) so the verdict no longer
      // depends on which Unicode encoding a quote happens to use.
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const ev = normalize(evidence);
  const del = normalize(deliverableContent);
  if (ev.length < 12 || !del) return false;
  const evWords = ev.split(" ");
  // Re-audit hardening (2026-10-28): evidence made only of function
  // words ("the and the and the and") is not evidence, even when that
  // word salad literally appears in the deliverable — a pure-stopword
  // run otherwise satisfied the fuzzy rule below. Real cited evidence
  // always names things: require at least two content words.
  const contentWords = evWords.filter((w) => !STOPWORDS.has(w));
  if (contentWords.length < 2) return false;
  // Re-audit F1.2: the word floor guards BOTH branches — a 1–3 word
  // "quote" (a bare feature name) is satisfied by any passing mention
  // in the deliverable, including negated or planned ones.
  if (evWords.length < 4) return false;
  if (del.includes(ev)) return true;
  const delWords = del.split(" ");
  // Re-audit F1.3: the fuzzy scan is O(evidence × deliverable × run);
  // cap the evidence length it will process so a model emitting a
  // several-hundred-word "quote" cannot stall the event loop.
  // (Verbatim long quotes still pass via the substring branch above.)
  if (evWords.length > 48) return false;
  // Longest contiguous run of evidence words present in the deliverable.
  // Re-audit F1.1: the run must ANCHOR the evidence — the words outside
  // the run (head + tail together) may total at most ONE word. The
  // previous >=60% rule let the model invent up to 40% of the cited
  // evidence at the ends, which is exactly where the criterion-relevant
  // payload sits ("…with realtime websocket notifications"). One word
  // of slack tolerates a trimmed article or a mangled edge word; the
  // semantic payload of a feature claim needs more room than that.
  // The qualifying run must also contain a content word, so fabricated
  // content cannot ride on a long stopword run.
  let best = 0;
  for (let i = 0; i < evWords.length; i++) {
    // Head slack: a run starting later than index 1 can never qualify.
    if (i > 1) break;
    for (let j = 0; j < delWords.length; j++) {
      if (evWords[i] !== delWords[j]) continue;
      let run = 0;
      let runHasContent = false;
      while (
        i + run < evWords.length &&
        j + run < delWords.length &&
        evWords[i + run] === delWords[j + run]
      ) {
        if (!STOPWORDS.has(evWords[i + run])) runHasContent = true;
        run++;
      }
      const tailSlack = evWords.length - (i + run);
      if (runHasContent && i + tailSlack <= 1 && run > best) best = run;
    }
  }
  return best >= 4 && best / evWords.length >= 0.6;
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
  ], { deadlineAt: Date.now() + 190_000 });

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

    // Evidence gate (audit T-5), enforced in code for pass AND partial:
    // a paying verdict needs concrete evidence that is actually present
    // in the deliverable. Failing either check downgrades to "fail", so
    // fabricated quotes and prompt-injected verdicts release nothing.
    let evidenceVerified = false;
    if (status === "pass" || status === "partial") {
      if (!isConcreteEvidence(evidence, c.label)) {
        status = "fail";
        reason =
          `${reason} (Downgraded to fail by the code-side evidence gate: no concrete evidence was cited.)`.trim();
      } else if (!evidenceMatchesDeliverable(evidence, input.deliverableContent)) {
        status = "fail";
        reason =
          `${reason} (Downgraded to fail by the code-side evidence gate: the cited evidence was not found in the deliverable.)`.trim();
      } else {
        evidenceVerified = true;
      }
    }
    return {
      criterionId: c.id,
      label: c.label,
      status,
      reason: evidence
        ? `${reason} Evidence: ${evidence}`.trim()
        : reason || "No reason given.",
      evidence: evidence || undefined,
      evidenceVerified,
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
