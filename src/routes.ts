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
  settingsStatus,
  writeSecretsFile,
  type SecretsFile,
  type SettingKey,
} from "./settings.ts";
import { httpError } from "./services/escrow.ts";

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
   * Setup-token gate for the settings surface. When PROOFPAY_SETUP_TOKEN
   * is set, the token must arrive as the `x-setup-token` header or the
   * `setup_token` query parameter; when unset, everything is allowed
   * (local-demo default — server.ts logs a startup warning in that case).
   */
  const requireSetupToken = (req: FastifyRequest, reply: FastifyReply) => {
    const query = (req.query ?? {}) as { setup_token?: string };
    const ok = checkSetupToken({
      header: req.headers["x-setup-token"] as string | undefined,
      query: query.setup_token,
    });
    if (!ok) {
      reply.status(401).send({ error: "setup token required" });
    }
    return ok;
  };

  app.get("/connect", async (req, reply) => {
    if (!requireSetupToken(req, reply)) return reply;
    return reply.type("text/html").send(connectHtml);
  });

  /** Safe status only — never any stored value (see settings.ts). */
  app.get("/api/settings", async (req, reply) => {
    if (!requireSetupToken(req, reply)) return reply;
    return settingsStatus();
  });

  app.post<{ Body: Record<string, unknown> }>(
    "/api/settings",
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
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw httpError(400, "AI_BASE_URL must use http(s)");
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
  app.post<{ Body: ContractBody }>("/api/contracts", async (req) => {
    const contract = await escrow.createContract(req.body ?? ({} as ContractBody));
    return { contract };
  });

  app.get("/api/contracts", async () => ({ contracts: escrow.listContracts() }));

  app.get<{ Params: { id: string } }>(
    "/api/contracts/:id",
    async (req) => ({ contract: escrow.getContract(req.params.id) }),
  );

  // -------------------------------------------------- milestone lifecycle
  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/fund",
    async (req) => ({
      milestone: await escrow.fundMilestone(req.params.id, req.params.mid),
    }),
  );

  app.post<{ Params: { id: string; mid: string }; Body: SubmitBody }>(
    "/api/contracts/:id/milestones/:mid/submit",
    async (req) => ({
      milestone: escrow.submitDeliverable(
        req.params.id,
        req.params.mid,
        req.body ?? ({} as SubmitBody),
      ),
    }),
  );

  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/verify",
    async (req) => ({
      verification: await escrow.verifyMilestone(req.params.id, req.params.mid),
    }),
  );

  app.post<{ Params: { id: string; mid: string } }>(
    "/api/contracts/:id/milestones/:mid/release",
    async (req) => escrow.releaseMilestone(req.params.id, req.params.mid),
  );

  // ---------------------------------------------------------------- ledger
  app.get<{ Querystring: { contractId?: string } }>(
    "/api/events",
    async (req) => ({ events: escrow.listEvents(req.query.contractId) }),
  );

  // --------------------------------------------------------------- webhooks
  /**
   * PayPal webhook intake. Records the raw event in the ledger (against the
   * contract referenced in the event when identifiable, otherwise under the
   * "unmatched" bucket) so payment state can be reconciled later.
   */
  app.post("/api/webhooks/paypal", async (req) => {
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
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const contract = orderId
      ? escrow
          .listContracts()
          .find((c) => c.milestones.some((m) => m.paypalOrderId === orderId))
      : undefined;
    escrow.recordWebhook(contract?.id ?? "unmatched", event, verified);
    return { received: true, verified };
  });
}
