import Fastify from "fastify";
import { loadPayPalConfig, PayPalClient } from "./paypal/client.ts";
import { loadAiConfig } from "./ai/client.ts";
import { JsonStore } from "./store.ts";
import { EscrowService } from "./services/escrow.ts";
import { registerRoutes } from "./routes.ts";

const port = Number(process.env.PORT ?? 3000);

const paypal = new PayPalClient(loadPayPalConfig());
const store = new JsonStore();
const escrow = new EscrowService(store, paypal);

const app = Fastify({ logger: true });
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
    app.log.warn(
      "PROOFPAY_SETUP_TOKEN is not set: the /connect settings page is UNAUTHENTICATED (local demo default). Set PROOFPAY_SETUP_TOKEN before exposing this app beyond localhost.",
    );
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
