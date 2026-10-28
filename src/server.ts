import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { loadPayPalConfig, PayPalClient } from "./paypal/client.ts";
import { loadAiConfig } from "./ai/client.ts";
import { JsonStore } from "./store.ts";
import { EscrowService } from "./services/escrow.ts";
import { registerRoutes } from "./routes.ts";

const port = Number(process.env.PORT ?? 3000);

const paypal = new PayPalClient(loadPayPalConfig());
let store: JsonStore;
try {
  store = new JsonStore();
} catch (err) {
  console.error(
    `ProofPay cannot start: data store failed to load: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  process.exit(1);
}
const escrow = new EscrowService(store, paypal);

const app = Fastify({
  // Strict JSON typing: without this, ajv coerces "100" into 100 before
  // the service layer can reject a string amount (audit S-3).
  ajv: { customOptions: { coerceTypes: false } },
  // Behind the Cloudflare tunnel every request arrives from 127.0.0.1;
  // trustProxy makes req.ip the real client IP (X-Forwarded-For), which
  // the rate limiter keys on.
  trustProxy: true,
  // Audit S-4: explicit body cap (field-level caps live in the routes).
  bodyLimit: 256 * 1024,
  logger: {
    // Audit T-2: request URLs are logged WITHOUT their query strings, so
    // a token (or any other secret) in a URL can never land in the logs.
    serializers: {
      req(request: { method?: string; url?: string; headers?: { host?: string }; ip?: string }) {
        const url = (request.url ?? "").split("?")[0];
        return {
          method: request.method,
          url,
          host: request.headers?.host,
          remoteAddress: request.ip,
        };
      },
    },
  },
});

// Audit T-3: global rate-limit safety net (stricter per-route limits are
// configured in routes.ts for settings, contract creation and verify).
await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

// Audit S-9 (minimal, demo-safe subset): clickjacking + MIME-sniffing
// protection on every response, including the credential-entry page.
app.addHook("onSend", async (_req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Content-Security-Policy", "frame-ancestors 'none'");
  reply.header("X-Frame-Options", "DENY");
});

registerRoutes(app, { escrow, paypal });

// Uniform JSON error shape: { error: string }
app.setErrorHandler((err, _req, reply) => {
  const statusCode =
    typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? ((err as { statusCode: number }).statusCode as number)
      : 500;
  reply
    .status(statusCode)
    .send({ error: err instanceof Error ? err.message : String(err) });
});

try {
  await app.listen({ port, host: "0.0.0.0" });
  const ai = loadAiConfig();
  app.log.info(
    `ProofPay running (PayPal mode=${paypal.mode}, env=${paypal.env}; AI mode=${ai.mode}${ai.mode === "live" ? `, model=${ai.model}` : ""})`,
  );
  if (!process.env.PROOFPAY_SETUP_TOKEN?.trim()) {
    // Audit T-4: the settings surface now FAILS CLOSED in this state
    // (routes answer 503); the rest of the demo keeps running.
    app.log.error(
      "PROOFPAY_SETUP_TOKEN is not set: the settings surface is DISABLED (fail-closed). Set PROOFPAY_SETUP_TOKEN to enable /connect.",
    );
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
