import { createHash, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * ============================================================================
 * RUNTIME SETTINGS — the safe way to hand ProofPay real sandbox credentials
 * at runtime (used by the /connect page and POST /api/settings).
 *
 * Values live in a local JSON secrets file:
 *   path = $PROOFPAY_SECRETS_FILE, default ./data/secrets.json
 * The file is created with mode 0600 (directory 0700) and is gitignored.
 * It is NEVER served back: the settings API only reports, per value,
 * whether it is configured, where it came from ("env" | "file"), and —
 * for the PayPal client id only — its last 4 characters.
 *
 * PRECEDENCE: an environment variable always wins over the secrets file.
 * Both loaders (PayPal + AI) resolve through `resolveSetting()`, and both
 * re-resolve on every use (PayPal: every token fetch; AI: every call), so
 * values saved through /connect take effect live, without a restart.
 * ============================================================================
 */

export const SETTING_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_ENV",
  "PUBLIC_BASE_URL",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export type SecretsFile = Partial<Record<SettingKey, string>>;

export function secretsFilePath(): string {
  return resolve(process.env.PROOFPAY_SECRETS_FILE ?? "./data/secrets.json");
}

/** Read the secrets file ({} when absent or unreadable). Never logs values. */
export function readSecretsFile(): SecretsFile {
  const path = secretsFilePath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    const out: SecretsFile = {};
    for (const key of SETTING_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Merge a patch into the secrets file and persist it atomically with
 * owner-only permissions (dir 0700, file 0600). Only known keys with
 * non-empty string values are accepted; empty values mean "leave as is",
 * so a blank form field can never wipe a stored secret.
 */
export function writeSecretsFile(patch: SecretsFile): SecretsFile {
  const clean: SecretsFile = {};
  for (const key of SETTING_KEYS) {
    const value = patch[key];
    if (typeof value === "string" && value.trim()) clean[key] = value.trim();
  }
  const merged = { ...readSecretsFile(), ...clean };
  const path = secretsFilePath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  return merged;
}

/** Where a setting's effective value comes from. */
export function settingSource(
  key: SettingKey,
  file: SecretsFile = readSecretsFile(),
): "env" | "file" | null {
  if (process.env[key]?.trim()) return "env";
  if (file[key]) return "file";
  return null;
}

/**
 * Effective value for a setting: environment first, secrets file second.
 * This is the single funnel both config loaders use.
 */
export function resolveSetting(key: SettingKey): string | undefined {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;
  return readSecretsFile()[key];
}

// ------------------------------------------------------------ setup token
/**
 * The settings API is guarded by a setup token, sent ONLY as the
 * `x-setup-token` header (audit T-2: tokens must never travel in URLs,
 * where they leak into server logs, browser history and Referer headers).
 * The gate FAILS CLOSED (audit T-4): when PROOFPAY_SETUP_TOKEN is not set,
 * `checkSetupToken` never returns true and the routes answer 503 — a
 * redeploy that loses the env var can no longer open the settings surface
 * silently. The /connect HTML form itself carries no data and stays
 * reachable so the operator can type the token into it.
 */
export function setupTokenRequired(): boolean {
  return Boolean(process.env.PROOFPAY_SETUP_TOKEN?.trim());
}

export function checkSetupToken(input: { header?: string }): boolean {
  const expected = process.env.PROOFPAY_SETUP_TOKEN?.trim();
  if (!expected) return false; // fail closed
  const provided = input.header ?? "";
  // Constant-time comparison (audit R-1): hash both sides so the compare
  // itself is length-independent, then timingSafeEqual.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ------------------------------------------------- outbound URL safety
/**
 * True when a hostname points at loopback / private / link-local space
 * (audit S-8): an AI_BASE_URL aimed there would make the server send the
 * AI API key to an internal target (SSRF / credential exfiltration).
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:")) return true; // IPv6 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // IPv6 unique-local fc00::/7
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
  }
  return false;
}

// ---------------------------------------------------------------- status
export interface SettingStatus {
  configured: boolean;
  source: "env" | "file" | null;
}

export interface SettingsStatus {
  setupTokenRequired: boolean;
  paypal: {
    clientId: SettingStatus & { last4: string | null };
    clientSecret: SettingStatus;
    env: SettingStatus & { value: "sandbox" | "live" };
  };
  ai: {
    baseUrl: SettingStatus;
    apiKey: SettingStatus;
    model: SettingStatus & { value: string | null };
  };
}

/**
 * The ONLY representation of the settings that may leave the server.
 * Contains no secret values: booleans, sources, the client id's last 4
 * characters, the PayPal environment name, and the AI model name (neither
 * of the last two is a credential).
 */
export function settingsStatus(): SettingsStatus {
  const file = readSecretsFile();
  const status = (key: SettingKey): SettingStatus => {
    const source = settingSource(key, file);
    return { configured: source !== null, source };
  };
  const clientId = resolveSetting("PAYPAL_CLIENT_ID");
  return {
    // Audit R-4: the absolute secrets-file path is no longer disclosed.
    setupTokenRequired: setupTokenRequired(),
    paypal: {
      clientId: {
        ...status("PAYPAL_CLIENT_ID"),
        last4: clientId ? clientId.slice(-4) : null,
      },
      clientSecret: status("PAYPAL_CLIENT_SECRET"),
      env: {
        ...status("PAYPAL_ENV"),
        value: resolveSetting("PAYPAL_ENV") === "live" ? "live" : "sandbox",
      },
    },
    ai: {
      baseUrl: status("AI_BASE_URL"),
      apiKey: status("AI_API_KEY"),
      model: {
        ...status("AI_MODEL"),
        value: resolveSetting("AI_MODEL") ?? null,
      },
    },
  };
}
