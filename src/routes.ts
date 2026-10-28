import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PayPalClient } from "./paypal/client.ts";
import { loadAiConfig } from "./ai/client.ts";
import type { EscrowService } from "./services/escrow.ts";
import {
  SETTING_KEYS,
  checkSetupToken,
  isPrivateOrLoopbackHost,
  settingsStatus,
  setupTokenRequired,
  writeSecretsFile,
  type SecretsFile,
  type SettingKey,
} from "./settings.ts";
import { httpError } from "./services/escrow.ts";
import type { Contract, Milestone } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(here, "../public/index.html"), "utf8");
const connectHtml = readFileSync(resolve(here, "../public/connect.html"), "utf8");

interface ContractBody {
  brief: string;
  clientEmail: string;
  freelancerEmail: string;
  totalAmount: number;
  currency?: string;
}

interface SubmitBody {
  kind?: string;
  content: string;
}

// Audit K-1 (read side): public GET responses never carry the live PayPal
// approval URL — that actionable link is returned ONLY in the direct
// response to the actor performing the fund step. Everything else about
// the contract stays public so judges can inspect the demo.
function publicMilestone(m: Milestone): Milestone {
  if (!m.approvalUrl) return m;
  const copy = { ...m };
  delete copy.approvalUrl;
  return copy;
}

function publicContract(c: Contract): Contract {
  return { ...c, milestones: c.milestones.map(publicMilestone) };
}

const createContractSchema = {
  body: {
    type: "object",
    required: ["brief", "clientEmail", "freelancerEmail", "totalAmount"],
    properties: {
      brief: { type: "string", minLength: 1, maxLength: 10_000 },
      clientEmail: { type: "string", minLength: 3, maxLength: 254 },
      freelancerEmail: { type: "string", minLength: 3, maxLength: 254 },
      totalAmount: { type: "number", minimum: 1, maximum: 1_000_000 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
    },
  },
} as const;

const submitSchema = {
  body: {
    type: "object",
    required: ["content"],
    properties: {
      kind: { type: "string", enum: ["text", "link", "file"] },
      content: { type: "string", minLength: 1, maxLength: 100_000 },
    },
  },
} as const;

/** Rate-limit presets (audit T-3), enforced per client IP. */
const RL = {
  settings: { max: 10, timeWindow: "1 minute" },
  createContract: { max: 12, timeWindow: "1 minute" },
  verify: { max: 20, timeWindow: "1 minute" },
  milestoneWrite: { max: 30, timeWindow: "1 minute" },
  webhook: { max: 120, timeWindow: "1 minute" },
} as const;

export function registerRoutes(
  app: FastifyInstance,
  deps: { escrow: EscrowService; paypal: PayPalClient },
): void {
  const { escrow, paypal } = deps;

  app.get("/", async (_req, reply) => {
    return reply.type("text/html").send(indexHtml);
  });

  app.get("/health", async () => {
    // Fresh config resolution: credentials saved via /connect are
    // reflected here (and everywhere) without a restart.
    const ai = loadAiConfig();
    return {
      ok: true,
      service: "proofpay",
      paypalMode: paypal.mode,
      paypalEnv: paypal.env,
      aiMode: ai.mode,
      aiModel: ai.mode === "live" ? ai.model : null,
      ts: new Date().toISOString(),
    };
  });

  // ------------------------------------------------------ connect/settings
  /**
   * Setup-token gate for the settings API (audit T-2/T-4). The token is
   * accepted ONLY as the `x-setup-token` header — never in a URL. The
   * gate FAILS CLOSED: when PROOFPAY_SETUP_TOKEN is not configured the
   * settings surface answers 503 instead of opening up.
   */
  const requireSetupToken = (req: FastifyRequest, reply: FastifyReply) => {
    if (!setupTokenRequired()) {
      reply.status(503).send({
        error:
          "settings are disabled: PROOFPAY_SETUP_TOKEN is not configured on the server",
      });
      return false;
    }
    const ok = checkSetupToken({
      header: req.headers["x-setup-token"] as string | undefined,
    });
    if (!ok) {
      reply.status(401).send({ error: "setup token required" });
    }
    return ok;
  };

  // The /connect page itself is just a form — it contains no settings
  // data, so it is served without the token (the operator types the token
  // into it). Every byte of settings data and every settings write stays
  // behind the header gate above.
  app.get("/connect", async (_req, reply) => {
    return reply.type("text/html").send(connectHtml);
  });

  /** Safe status only — never any stored value (see settings.ts). */
  app.get(
    "/api/settings",
    { config: { rateLimit: RL.settings } },
    async (req, reply) => {
      if (!requireSetupToken(req, reply)) return reply;
      return settingsStatus();
    },
  );

  app.post<{ Body: Record<string, unknown> }>(
    "/api/settings",
    { config: { rateLimit: RL.settings } },
    async (req, reply) => {
      if (!requireSetupToken(req, reply)) return reply;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: SecretsFile = {};
      for (const [key, value] of Object.entries(body)) {
        if (!(SETTING_KEYS as readonly string[]).includes(key)) {
          throw httpError(400, `unknown setting: ${key}`);
        }
        if (typeof value !== "string") {
          throw httpError(400, `${key} must be a string`);
        }
        patch[key as SettingKey] = value;
      }
      // Audit S-8: PUBLIC_BASE_URL shapes PayPal return URLs, so it is
      // deploy configuration only — not writable through this API.
      if (patch.PUBLIC_BASE_URL !== undefined && patch.PUBLIC_BASE_URL.trim()) {
        throw httpError(
          400,
          "PUBLIC_BASE_URL is managed by deployment configuration and cannot be changed here",
        );
      }
      if (
        patch.PAYPAL_ENV !== undefined &&
        patch.PAYPAL_ENV.trim() &&
        !["sandbox", "live"].includes(patch.PAYPAL_ENV.trim())
      ) {
        throw httpError(400, "PAYPAL_ENV must be \"sandbox\" or \"live\"");
      }
      if (patch.AI_BASE_URL?.trim()) {
        let url: URL;
        try {
          url = new URL(patch.AI_BASE_URL.trim());
        } catch {
          throw httpError(400, "AI_BASE_URL must be a valid URL");
        }
        // Audit S-8: the AI key is sent to this host — require https and
        // refuse loopback/private/link-local targets (SSRF/exfiltration).
        if (url.protocol !== "https:") {
          throw httpError(400, "AI_BASE_URL must use https");
        }
        if (isPrivateOrLoopbackHost(url.hostname)) {
          throw httpError(
            400,
            "AI_BASE_URL must not point at a private or loopback host",
          );
        }
      }
      // The patch is applied to the secrets file; the response is the safe
      // status view, so no submitted value is ever echoed back. Clients
      // re-resolve config per call, so the new values are already live.
      writeSecretsFile(patch);
      return settingsStatus();
    },
  );

  // ------------------------------------------------------------- contracts
  app.post<{ Body: ContractBody }>(
    "/api/contracts",
    { schema: createContractSchema, config: { rateLimit: RL.createContract } },
    async (req) => {
      const contract = await escrow.createContract(req.body ?? ({} as ContractBody));
      return { contract: publicContract(contract) };
    },
  );

  app.get("/api/contracts", async () => ({
    contracts: escrow.listContracts().map(publicContract),
  }));

  app.get<{ Params: { id: string } }>(
    "/api/contracts/:id",
    async (req) => ({ contract: publicContract(escrow.getContract(req.params.id)) }),
  );

  // -------------------------------------------------- milestone lifecycle
  // The fund response is the ONE place the live approvalUrl is returned:
  // it goes directly to the actor performing the funding step (K-1).
  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/fund",
    { config: { rateLimit: RL.milestoneWrite } },
    async (req) => ({
      milestone: await escrow.fundMilestone(req.params.id, req.params.mid),
    }),
  );

  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/confirm-fund",
    { config: { rateLimit: RL.milestoneWrite } },
    async (req) => ({
      milestone: publicMilestone(
        await escrow.confirmFunding(req.params.id, req.params.mid),
      ),
    }),
  );

  // --------------------------------------- PayPal Checkout return points
  /**
   * Browser-facing return URLs baked into live PayPal orders. The client
   * lands here after approving (or cancelling) in PayPal Checkout; PayPal
   * preserves our contractId/milestoneId query params and appends its own
   * (token = order id, PayerID). These handlers must never 500 a browser
   * tab: every outcome becomes a 302 back to the demo page with a status
   * flag in the query string.
   */
  app.get<{ Querystring: { contractId?: string; milestoneId?: string } }>(
    "/fund/return",
    // Re-audit F5.2: this browser return point drives PayPal calls
    // (getOrder/authorize) off unauthenticated query params — give it a
    // bucket of its own instead of only the global safety net.
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { contractId, milestoneId } = req.query;
      try {
        if (!contractId || !milestoneId) {
          throw new Error("missing contractId or milestoneId");
        }
        await escrow.confirmFunding(contractId, milestoneId);
        return reply.redirect(`/?funded=${encodeURIComponent(milestoneId)}`);
      } catch (err) {
        // Audit R-3: internal error text stays in the server log; the
        // browser only ever sees a fixed error code.
        req.log.error(err, "funding confirmation failed");
        return reply.redirect("/?funding_error=confirmation_failed");
      }
    },
  );

  app.get("/fund/cancel", async (_req, reply) => {
    return reply.redirect("/?funding_cancelled=1");
  });

  app.post<{ Params: { id: string; mid: string }; Body: SubmitBody }>(
    "/api/contracts/:id/milestones/:mid/submit",
    { schema: submitSchema, config: { rateLimit: RL.milestoneWrite } },
    async (req) => ({
      milestone: publicMilestone(
        await escrow.submitDeliverable(
          req.params.id,
          req.params.mid,
          req.body ?? ({} as SubmitBody),
        ),
      ),
    }),
  );

  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/verify",
    { config: { rateLimit: RL.verify } },
    async (req) => ({
      verification: await escrow.verifyMilestone(req.params.id, req.params.mid),
    }),
  );

  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/release",
    { config: { rateLimit: RL.milestoneWrite } },
    async (req) => {
      const result = await escrow.releaseMilestone(req.params.id, req.params.mid);
      return {
        ...result,
        milestone: publicMilestone(result.milestone),
      };
    },
  );

  // ---------------------------------------------------------------- ledger
  app.get<{ Querystring: { contractId?: string } }>(
    "/api/events",
    // Re-audit F5.2: the full-ledger dump grows unboundedly; bucket it.
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req) => ({ events: escrow.listEvents(req.query.contractId) }),
  );

  // --------------------------------------------------------------- webhooks
  /**
   * PayPal webhook intake. Records the event in the ledger (against the
   * contract referenced in the event when identifiable, otherwise under
   * the "unmatched" bucket) so payment state can be reconciled later.
   *
   * Audit S-1: in live PayPal mode an event whose signature verification
   * does not succeed is REJECTED (401) and never recorded — the ledger is
   * evidence and must not be poisonable by unauthenticated posts. Events
   * are deduplicated by event id. (In mock mode there is nothing to
   * verify against, so events are recorded with verified: null.)
   */
  app.post(
    "/api/webhooks/paypal",
    { config: { rateLimit: RL.webhook } },
    async (req, reply) => {
      const event = (req.body ?? {}) as {
        id?: string;
        event_type?: string;
        resource?: { supplementary_data?: { related_ids?: { order_id?: string } } };
      };
      const headers: Record<string, string | undefined> = {
        "paypal-auth-algo": req.headers["paypal-auth-algo"] as string | undefined,
        "paypal-cert-url": req.headers["paypal-cert-url"] as string | undefined,
        "paypal-transmission-id": req.headers["paypal-transmission-id"] as
          | string
          | undefined,
        "paypal-transmission-sig": req.headers["paypal-transmission-sig"] as
          | string
          | undefined,
        "paypal-transmission-time": req.headers["paypal-transmission-time"] as
          | string
          | undefined,
      };
      const { verified } = await paypal.verifyWebhookSignature({ headers, event });
      if (paypal.mode === "live" && verified !== true) {
        reply.status(401);
        return { received: false, verified };
      }
      if (event.id) {
        const duplicate = escrow.listEvents().some((e) => {
          if (e.type !== "webhook_received") return false;
          const d = e.detail as {
            event?: { id?: string };
            eventId?: string | null;
          };
          return d.event?.id === event.id || d.eventId === event.id;
        });
        if (duplicate) return { received: true, verified, deduplicated: true };
      }
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      const contract = orderId
        ? escrow
            .listContracts()
            .find((c) => c.milestones.some((m) => m.paypalOrderId === orderId))
        : undefined;
      escrow.recordWebhook(contract?.id ?? "unmatched", event, verified);
      return { received: true, verified };
    },
  );
}
