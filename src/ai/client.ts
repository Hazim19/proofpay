import { resolveSetting } from "../settings.ts";
import type { ChatMessage } from "./prompts.ts";

/**
 * ============================================================================
 * AI CLIENT — a minimal OpenAI-compatible chat client.
 *
 * Configured per setting through ../settings.ts (environment first, then
 * the runtime secrets file written by the /connect page):
 *   AI_BASE_URL  e.g. https://api.openai.com/v1 (any OpenAI-compatible host)
 *   AI_API_KEY   bearer key for that host
 *   AI_MODEL     model name to call
 *
 * LIVE MODE requires all three. If any is absent the layer is in STUB MODE
 * and the drafter/verifier fall back to the deterministic stubs in
 * ./stubs.ts, so the app still runs fully offline. Config is re-resolved on
 * every call, so values saved via /connect apply without a restart.
 *
 * The key is only ever sent in the Authorization header to AI_BASE_URL,
 * and is never logged or returned.
 * ============================================================================
 */

export interface AiConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** "live" when baseUrl + apiKey + model are all present, else "stub". */
  mode: "live" | "stub";
}

export function loadAiConfig(): AiConfig {
  const baseUrl = resolveSetting("AI_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = resolveSetting("AI_API_KEY");
  const model = resolveSetting("AI_MODEL");
  const mode: AiConfig["mode"] = baseUrl && apiKey && model ? "live" : "stub";
  return { baseUrl, apiKey, model, mode };
}

/**
 * Error raised for any live-AI failure (unreachable provider, bad status,
 * non-JSON or invalid output). Carries HTTP status 502 so the API layer
 * surfaces it as a clean "bad gateway" error — in live mode ProofPay never
 * silently substitutes a fake AI result.
 */
export class AiError extends Error {
  readonly statusCode = 502;
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

// 180s: the live Gemini model has been observed taking ~50s for a trivial
// prompt during provider slowdowns, so 60s was too tight for real verdicts.
const REQUEST_TIMEOUT_MS = 180_000;

// Audit S-10: one shared deadline per logical request. Callers pass a
// `deadlineAt`; every attempt (including the response_format fallback and
// the drafter's repair call) draws from the SAME budget instead of each
// restarting a fresh 180s, and at most MAX_CONCURRENT_AI calls run at
// once, so a burst of requests cannot exhaust the provider quota.
const MAX_CONCURRENT_AI = 3;
let aiInFlight = 0;
const aiWaiters: Array<() => void> = [];
async function acquireAiSlot(): Promise<void> {
  if (aiInFlight < MAX_CONCURRENT_AI) {
    aiInFlight++;
    return;
  }
  // When woken, the slot has been handed over directly (count unchanged).
  await new Promise<void>((resolve) => aiWaiters.push(resolve));
}
function releaseAiSlot(): void {
  const next = aiWaiters.shift();
  if (next) {
    next();
    return;
  }
  aiInFlight--;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
}

/**
 * Send one chat completion and return the raw message text.
 * Asks for a JSON object response; if the provider rejects the
 * `response_format` parameter, retries once without it (the prompts still
 * demand JSON-only output, and callers validate strictly).
 */
export async function chatCompletionText(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { deadlineAt?: number } = {},
): Promise<string> {
  if (config.mode !== "live" || !config.baseUrl || !config.apiKey || !config.model) {
    throw new AiError("AI live mode is not configured (AI_BASE_URL, AI_API_KEY, AI_MODEL)");
  }
  const deadlineAt = opts.deadlineAt ?? Date.now() + REQUEST_TIMEOUT_MS;
  const url = `${config.baseUrl}/chat/completions`;
  const baseBody = {
    model: config.model,
    messages,
    temperature: 0.2,
  };

  const attempt = async (withJsonFormat: boolean): Promise<string> => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new AiError("AI request deadline exceeded");
    }
    const timeoutMs = Math.min(REQUEST_TIMEOUT_MS, Math.max(1_000, remaining));
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(
          withJsonFormat
            ? { ...baseBody, response_format: { type: "json_object" } }
            : baseBody,
        ),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiError(
        `AI provider unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      if (withJsonFormat && res.status === 400 && text.includes("response_format")) {
        return attempt(false);
      }
      throw new AiError(
        `AI provider returned HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      throw new AiError("AI provider returned a non-JSON envelope");
    }
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AiError("AI provider returned an empty completion");
    }
    return content;
  };

  await acquireAiSlot();
  try {
    return await attempt(true);
  } finally {
    releaseAiSlot();
  }
}

/** Parse a model completion as a JSON object, tolerating code fences. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AiError("AI output was not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AiError("AI output was not a JSON object");
  }
  return value as Record<string, unknown>;
}
