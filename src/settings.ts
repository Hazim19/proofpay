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
 * The /connect page and the settings API are guarded by a setup token when
 * PROOFPAY_SETUP_TOKEN is set (header `x-setup-token` or `?setup_token=`).
 * When it is unset the page is open — the local-demo default — and the
 * server logs a loud warning at startup (see server.ts).
 */
export function setupTokenRequired(): boolean {
  return Boolean(process.env.PROOFPAY_SETUP_TOKEN?.trim());
}

export function checkSetupToken(input: {
  header?: string;
  query?: string;
}): boolean {
  const expected = process.env.PROOFPAY_SETUP_TOKEN?.trim();
  if (!expected) return true;
  return input.header === expected || input.query === expected;
}

// ---------------------------------------------------------------- status
export interface SettingStatus {
  configured: boolean;
  source: "env" | "file" | null;
}

export interface SettingsStatus {
  secretsFile: string;
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
    secretsFile: secretsFilePath(),
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
