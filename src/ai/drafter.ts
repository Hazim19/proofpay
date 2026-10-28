import { AiError, chatCompletionText, loadAiConfig, parseJsonObject } from "./client.ts";
import {
  buildDrafterRepairMessage,
  buildDrafterUserMessage,
  CONTRACT_DRAFTER_SYSTEM_PROMPT,
  type ChatMessage,
} from "./prompts.ts";
import { generateContractFromBrief } from "./stubs.ts";

/**
 * ============================================================================
 * CONTRACT DRAFTER — turns a free-text job brief into milestones with
 * weighted acceptance criteria.
 *
 * Live mode (AI_BASE_URL + AI_API_KEY + AI_MODEL set): one chat call with
 * the strict JSON contract from ./prompts.ts, then hard validation:
 *   - 1–4 milestones, each with a title and a positive amount
 *   - 2–5 criteria per milestone, each with a description and weight > 0
 *   - criterion weights per milestone sum to 1 (small drift is normalized;
 *     anything worse triggers ONE repair call with the validation error,
 *     after which invalid output is a clean AiError/502 — never a fake)
 *   - when a budget is given, milestone amounts are rescaled to sum to it
 *
 * Stub mode (any AI_* variable missing): delegates to the deterministic
 * template in ./stubs.ts so the app runs fully offline.
 * ============================================================================
 */

export interface DraftedCriterion {
  label: string;
  weight: number;
  /** Only the stub drafter fills these (its verifier scores by keywords). */
  keywords: string[];
}

export interface DraftedMilestone {
  title: string;
  amount: number;
  criteria: DraftedCriterion[];
}

export interface DraftResult {
  title: string;
  milestones: DraftedMilestone[];
  /** "stub-template-v1" or "ai:<model>" — recorded in the ledger. */
  generator: string;
}

export interface DraftInput {
  id: string;
  brief: string;
  clientEmail: string;
  freelancerEmail: string;
  totalAmount: number;
  currency: string;
  now: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function draftContract(input: DraftInput): Promise<DraftResult> {
  const config = loadAiConfig();
  if (config.mode === "stub") {
    const contract = generateContractFromBrief(input);
    return {
      title: contract.title,
      generator: "stub-template-v1",
      milestones: contract.milestones.map((m) => ({
        title: m.title,
        amount: m.amount,
        criteria: m.criteria.map((c) => ({
          label: c.label,
          weight: c.weight,
          keywords: c.keywords,
        })),
      })),
    };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: CONTRACT_DRAFTER_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildDrafterUserMessage({
        brief: input.brief,
        currency: input.currency,
        totalAmount: input.totalAmount,
      }),
    },
  ];

  const raw = await chatCompletionText(config, messages);
  try {
    return validateDraft(raw, input);
  } catch (firstErr) {
    if (!(firstErr instanceof AiError)) throw firstErr;
    // One repair attempt: hand the model its own output plus the exact
    // validation problem, then validate again just as strictly.
    const repaired = await chatCompletionText(config, [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: buildDrafterRepairMessage(firstErr.message) },
    ]);
    try {
      return validateDraft(repaired, input);
    } catch (secondErr) {
      throw new AiError(
        `AI contract draft invalid after one repair attempt: ${
          secondErr instanceof Error ? secondErr.message : String(secondErr)
        }`,
      );
    }
  }
}

function validateDraft(raw: string, input: DraftInput): DraftResult {
  const config = loadAiConfig();
  const obj = parseJsonObject(raw);

  const rawMilestones = obj.milestones;
  if (!Array.isArray(rawMilestones) || rawMilestones.length < 1 || rawMilestones.length > 4) {
    throw new AiError("draft must contain 1 to 4 milestones");
  }

  const milestones: DraftedMilestone[] = rawMilestones.map((rm, mi) => {
    if (typeof rm !== "object" || rm === null) {
      throw new AiError(`milestone ${mi + 1} is not an object`);
    }
    const m = rm as Record<string, unknown>;
    if (typeof m.title !== "string" || !m.title.trim()) {
      throw new AiError(`milestone ${mi + 1} has no title`);
    }
    if (typeof m.amount !== "number" || !Number.isFinite(m.amount) || m.amount <= 0) {
      throw new AiError(`milestone ${mi + 1} has an invalid amount`);
    }
    if (!Array.isArray(m.criteria) || m.criteria.length < 2 || m.criteria.length > 5) {
      throw new AiError(`milestone ${mi + 1} must have 2 to 5 criteria`);
    }
    const criteria: DraftedCriterion[] = m.criteria.map((rc, ci) => {
      if (typeof rc !== "object" || rc === null) {
        throw new AiError(`criterion ${ci + 1} of milestone ${mi + 1} is not an object`);
      }
      const c = rc as Record<string, unknown>;
      if (typeof c.description !== "string" || !c.description.trim()) {
        throw new AiError(
          `criterion ${ci + 1} of milestone ${mi + 1} has no description`,
        );
      }
      if (typeof c.weight !== "number" || !Number.isFinite(c.weight) || c.weight <= 0) {
        throw new AiError(
          `criterion ${ci + 1} of milestone ${mi + 1} has an invalid weight`,
        );
      }
      return { label: c.description.trim(), weight: c.weight, keywords: [] };
    });

    // Weights must sum to 1: normalize rounding drift, reject real errors
    // (the caller turns a rejection into one repair attempt).
    const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
    if (Math.abs(sum - 1) > 0.05) {
      throw new AiError(
        `criterion weights of milestone ${mi + 1} sum to ${round4(sum)}, not 1`,
      );
    }
    for (const c of criteria) c.weight = round4(c.weight / sum);
    const drift = round4(1 - criteria.reduce((acc, c) => acc + c.weight, 0));
    if (drift !== 0) {
      const largest = criteria.reduce((a, b) => (b.weight > a.weight ? b : a));
      largest.weight = round4(largest.weight + drift);
    }

    return { title: m.title.trim(), amount: round2(m.amount), criteria };
  });

  // Milestone amounts must sum to the agreed budget: rescale proportionally
  // and let the last milestone absorb the rounding remainder.
  const total = milestones.reduce((acc, m) => acc + m.amount, 0);
  if (Math.abs(total - input.totalAmount) > 0.001) {
    const factor = input.totalAmount / total;
    let running = 0;
    milestones.forEach((m, i) => {
      if (i === milestones.length - 1) {
        m.amount = round2(input.totalAmount - running);
      } else {
        m.amount = round2(m.amount * factor);
        running += m.amount;
      }
      if (!(m.amount > 0)) {
        throw new AiError("rescaled milestone amount is not positive");
      }
    });
  }

  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim().slice(0, 80)
      : `Contract: ${input.brief.slice(0, 60)}${input.brief.length > 60 ? "…" : ""}`;

  return { title, milestones, generator: `ai:${config.model}` };
}
