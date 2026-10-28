import { createHash } from "node:crypto";
import { resolveSetting } from "../settings.ts";

/**
 * PayPal REST client (sandbox-first).
 *
 * Credentials resolve per setting through ../settings.ts:
 *   1. environment: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
 *      PAYPAL_ENV ("sandbox" | "live")
 *   2. the runtime secrets file written by the /connect page
 *      ($PROOFPAY_SECRETS_FILE, default ./data/secrets.json)
 * Environment always wins. PAYPAL_MODE ("mock" forces offline mock mode)
 * and PAYPAL_WEBHOOK_ID are environment-only.
 *
 * The client re-resolves its config on every token fetch (and every public
 * call), so credentials saved via /connect take effect WITHOUT a restart;
 * a credential change also drops the cached access token.
 *
 * MOCK MODE: when PAYPAL_MODE=mock OR either credential is absent, every
 * function returns a deterministic mock object (same inputs -> same ids), so
 * the full escrow flow runs offline with zero accounts involved.
 *
 * No credential is ever hardcoded or logged.
 */

export interface PayPalConfig {
  clientId?: string;
  clientSecret?: string;
  env: "sandbox" | "live";
  mode: "mock" | "live";
  webhookId?: string;
}

export function loadPayPalConfig(): PayPalConfig {
  const clientId = resolveSetting("PAYPAL_CLIENT_ID");
  const clientSecret = resolveSetting("PAYPAL_CLIENT_SECRET");
  const env = resolveSetting("PAYPAL_ENV") === "live" ? "live" : "sandbox";
  const forcedMock = process.env.PAYPAL_MODE === "mock";
  const mode: PayPalConfig["mode"] =
    forcedMock || !clientId || !clientSecret ? "mock" : "live";
  return {
    clientId,
    clientSecret,
    env,
    mode,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || undefined,
  };
}

const BASE_URLS: Record<PayPalConfig["env"], string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

/** Deterministic mock id: stable for a given seed string. */
function mockId(prefix: string, seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${prefix}-${hex.slice(0, 16).toUpperCase()}`;
}

function money(amount: number, currency: string) {
  return { currency_code: currency, value: amount.toFixed(2) };
}

export interface OrderResult {
  id: string;
  status: string;
  intent: string;
  mock?: boolean;
  raw: unknown;
}

export interface AuthorizationResult {
  authorizationId: string;
  status: string;
  mock?: boolean;
  raw: unknown;
}

export interface CaptureResult {
  captureId: string;
  status: string;
  mock?: boolean;
  raw: unknown;
}

export interface RefundResult {
  refundId: string;
  status: string;
  mock?: boolean;
  raw: unknown;
}

export interface PayoutResult {
  payoutBatchId: string;
  batchStatus: string;
  mock?: boolean;
  raw: unknown;
}

export class PayPalClient {
  private config: PayPalConfig;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config: PayPalConfig = loadPayPalConfig()) {
    this.config = config;
  }

  /**
   * Re-resolve the config (environment first, then the runtime secrets
   * file). Called on every public operation and token fetch, so settings
   * saved through /connect apply live. When the credentials or environment
   * change, any cached access token is dropped.
   */
  private refreshConfig(): void {
    const next = loadPayPalConfig();
    if (
      next.clientId !== this.config.clientId ||
      next.clientSecret !== this.config.clientSecret ||
      next.env !== this.config.env ||
      next.mode !== this.config.mode ||
      next.webhookId !== this.config.webhookId
    ) {
      this.config = next;
      this.tokenCache = null;
    }
  }

  get mode(): PayPalConfig["mode"] {
    this.refreshConfig();
    return this.config.mode;
  }

  get env(): PayPalConfig["env"] {
    this.refreshConfig();
    return this.config.env;
  }

  private get baseUrl(): string {
    return BASE_URLS[this.config.env];
  }

  /** OAuth2 client-credentials token fetch (live mode only). */
  async getAccessToken(): Promise<string> {
    this.refreshConfig();
    if (this.config.mode === "mock") return "MOCK-ACCESS-TOKEN";
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(
        `PayPal token request failed: ${res.status} ${await res.text()}`,
      );
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  private async api<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as T) : ({} as T);
    if (!res.ok) {
      throw new Error(
        `PayPal API ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`,
      );
    }
    return json;
  }

  /**
   * Create an order with intent AUTHORIZE (funds are held, not yet captured).
   * This is the escrow funding step.
   */
  async createOrder(input: {
    amount: number;
    currency: string;
    referenceId: string;
    description?: string;
  }): Promise<OrderResult> {
    this.refreshConfig();
    if (this.config.mode === "mock") {
      const id = mockId(
        "MOCKORDER",
        `order:${input.referenceId}:${input.amount}:${input.currency}`,
      );
      return {
        id,
        status: "CREATED",
        intent: "AUTHORIZE",
        mock: true,
        raw: { note: "deterministic mock order (no PayPal account involved)" },
      };
    }
    const raw = await this.api<Record<string, unknown>>("/v2/checkout/orders", {
      method: "POST",
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: input.referenceId,
            description: input.description,
            amount: money(input.amount, input.currency),
          },
        ],
      },
    });
    return {
      id: String(raw.id),
      status: String(raw.status),
      intent: "AUTHORIZE",
      raw,
    };
  }

  /** Authorize a created order so the funds are held. */
  async authorizeOrder(orderId: string): Promise<AuthorizationResult> {
    this.refreshConfig();
    if (this.config.mode === "mock") {
      return {
        authorizationId: mockId("MOCKAUTH", `auth:${orderId}`),
        status: "CREATED",
        mock: true,
        raw: { note: "deterministic mock authorization" },
      };
    }
    const raw = await this.api<{
      purchase_units?: Array<{
        payments?: { authorizations?: Array<{ id: string; status: string }> };
      }>;
    }>(`/v2/checkout/orders/${orderId}/authorize`, { method: "POST", body: {} });
    const auth = raw.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) {
      throw new Error("PayPal authorize response had no authorization object");
    }
    return { authorizationId: auth.id, status: auth.status, raw };
  }

  /**
   * Capture an authorization. Omit `amount` to capture the full authorized
   * amount; pass an amount for a partial capture. `finalCapture` closes the
   * authorization (any uncaptured remainder is released back to the payer).
   */
  async captureAuthorization(input: {
    authorizationId: string;
    amount?: number;
    currency: string;
    finalCapture?: boolean;
  }): Promise<CaptureResult> {
    this.refreshConfig();
    if (this.config.mode === "mock") {
      return {
        captureId: mockId(
          "MOCKCAP",
          `capture:${input.authorizationId}:${input.amount ?? "full"}:${input.finalCapture ? "final" : "open"}`,
        ),
        status: "COMPLETED",
        mock: true,
        raw: { note: "deterministic mock capture" },
      };
    }
    const body: Record<string, unknown> = {
      final_capture: input.finalCapture ?? false,
    };
    if (input.amount !== undefined) {
      body.amount = money(input.amount, input.currency);
    }
    const raw = await this.api<{ id: string; status: string }>(
      `/v2/payments/authorizations/${input.authorizationId}/capture`,
      { method: "POST", body },
    );
    return { captureId: raw.id, status: raw.status, raw };
  }

  /** Refund a capture (full refund when amount is omitted). */
  async refundCapture(input: {
    captureId: string;
    amount?: number;
    currency: string;
    note?: string;
  }): Promise<RefundResult> {
    this.refreshConfig();
    if (this.config.mode === "mock") {
      return {
        refundId: mockId(
          "MOCKREF",
          `refund:${input.captureId}:${input.amount ?? "full"}`,
        ),
        status: "COMPLETED",
        mock: true,
        raw: { note: "deterministic mock refund" },
      };
    }
    const body: Record<string, unknown> = {};
    if (input.amount !== undefined) {
      body.amount = money(input.amount, input.currency);
    }
    if (input.note) body.note_to_payer = input.note;
    const raw = await this.api<{ id: string; status: string }>(
      `/v2/payments/captures/${input.captureId}/refund`,
      { method: "POST", body },
    );
    return { refundId: raw.id, status: raw.status, raw };
  }

  /** Create a payout to a PayPal account identified by email. */
  async createPayout(input: {
    email: string;
    amount: number;
    currency: string;
    note?: string;
    senderItemId: string;
  }): Promise<PayoutResult> {
    this.refreshConfig();
    if (this.config.mode === "mock") {
      return {
        payoutBatchId: mockId(
          "MOCKBATCH",
          `payout:${input.senderItemId}:${input.email}:${input.amount}`,
        ),
        batchStatus: "SUCCESS",
        mock: true,
        raw: { note: "deterministic mock payout" },
      };
    }
    const raw = await this.api<{
      batch_header: { payout_batch_id: string; batch_status: string };
    }>("/v1/payments/payouts", {
      method: "POST",
      body: {
        sender_batch_header: {
          sender_batch_id: input.senderItemId,
          email_subject: "You have a payment from ProofPay",
          email_message:
            "Your milestone payment was verified and released by ProofPay.",
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: input.email,
            amount: money(input.amount, input.currency),
            note: input.note ?? "ProofPay milestone release",
            sender_item_id: input.senderItemId,
          },
        ],
      },
    });
    return {
      payoutBatchId: raw.batch_header.payout_batch_id,
      batchStatus: raw.batch_header.batch_status,
      raw,
    };
  }

  /**
   * Verify a webhook signature (live mode, requires PAYPAL_WEBHOOK_ID).
   * In mock mode, or when no webhook id is configured, returns `verified: null`
   * meaning "not verifiable in this configuration" — the intake route records
   * the event either way and flags the verification state.
   */
  async verifyWebhookSignature(input: {
    headers: Record<string, string | undefined>;
    event: unknown;
  }): Promise<{ verified: boolean | null }> {
    this.refreshConfig();
    if (this.config.mode === "mock" || !this.config.webhookId) {
      return { verified: null };
    }
    try {
      const raw = await this.api<{ verification_status: string }>(
        "/v1/notifications/verify-webhook-signature",
        {
          method: "POST",
          body: {
            auth_algo: input.headers["paypal-auth-algo"],
            cert_url: input.headers["paypal-cert-url"],
            transmission_id: input.headers["paypal-transmission-id"],
            transmission_sig: input.headers["paypal-transmission-sig"],
            transmission_time: input.headers["paypal-transmission-time"],
            webhook_id: this.config.webhookId,
            webhook_event: input.event,
          },
        },
      );
      return { verified: raw.verification_status === "SUCCESS" };
    } catch {
      return { verified: false };
    }
  }
}
