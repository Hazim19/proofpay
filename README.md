# ProofPay

**AI-verified milestone escrow for freelance work.**

A client describes a job in plain words. ProofPay turns it into a contract
with milestones and measurable acceptance criteria, holds the milestone money
with PayPal (authorize now, capture later), and releases it **only after an
AI verifier checks the actual deliverable against every criterion**:

- **All criteria pass** → full capture + payout to the freelancer.
- **Some criteria pass** → proportional release: the earned share is paid
  out, the unearned remainder is refunded to the client.
- **Nothing passes** → the money stays held, the freelancer gets the
  verifier's reasons and revises.

Every step (contract, funding, delivery, verification, capture, refund,
payout, webhooks) is written to a ledger that doubles as a dispute-ready
evidence trail.

> Entry for the **PayPal AI Hackathon** (Devpost).
> Status: **working scaffold**. The contract drafter and the verifier run
> through a provider-agnostic AI layer (`src/ai/`): with `AI_BASE_URL`,
> `AI_API_KEY` and `AI_MODEL` set they call a real model with strict
> JSON contracts (prompts in `src/ai/prompts.ts`); without them they fall
> back to deterministic stubs so everything still runs offline. The PayPal
> integration is real and runs against the sandbox when credentials are
> provided.

## At a glance

ProofPay is a milestone escrow agent for cross-border freelance work, and it
pays on evidence rather than trust. A client states a job in plain language;
an AI drafter turns it into a contract of milestones with weighted,
measurable acceptance criteria. The client funds each milestone through
PayPal as an authorization hold. When the freelancer delivers, an AI verifier
grades the deliverable against every criterion and has to cite concrete
evidence for each pass. ProofPay then captures exactly the earned share,
pays it out to the freelancer, and refunds the remainder to the client.
Neither side has to take the other's word for anything: the client cannot
accept delivery and refuse payment, and the freelancer cannot collect for
work that was never checked.

### The demo flow

1. **Contract** — the client describes the job in a sentence or two and the
   drafter produces milestones, each with 2–5 acceptance criteria and
   weights that sum to 1.
2. **Fund** — the client approves the contract and funds the milestone
   through PayPal Checkout (Orders v2, `AUTHORIZE` intent). The money is
   held, not yet the freelancer's and no longer freely the client's. In
   live mode this is a real two-step: ProofPay creates the order, the
   client is redirected to PayPal to approve it, and ProofPay authorizes
   the hold only once PayPal reports the order approved (mock mode funds
   instantly).
3. **Deliver** — the freelancer submits the work (text, link, or file
   reference) on the milestone page.
4. **Verify** — the verifier grades the deliverable criterion by criterion:
   `pass`, `partial`, or `fail`, each with a reason and cited evidence. A
   pass with only vague praise behind it is downgraded to `partial` by a
   post-check, and an unanswered criterion counts as `fail`.
5. **Release** — the weighted verdicts set the release fraction. ProofPay
   captures the milestone, pays the earned share to the freelancer through
   Payouts, and refunds the unearned remainder to the client. If nothing
   passes, nothing moves and the freelancer revises against the verifier's
   written reasons. Every step lands in the AG Grid ledger, which doubles
   as the evidence pack if the job is ever disputed.

### Prize categories targeted

- **Best Use of PayPal + AI** — PayPal holds, captures, refunds, and pays
  out; AI decides how much of the held money each side gets, per criterion.
  Neither half works without the other.
- **Best Use of Agentic Commerce** — the agent drafts the contract,
  verifies the goods, and settles the payment end to end. Humans approve
  the contract and deliver the work; the agent handles the money movement
  in between.
- **Best Use of AG Grid** (sponsor) — the ledger is a live AG Grid table of
  every contract, funding, verification, capture, refund, payout, and
  webhook event, filterable per contract, so judges can audit the whole
  demo from one screen.

### Architecture at a glance

- **Backend**: Node.js + TypeScript on Fastify 5. TypeScript runs through
  Node's native type stripping, so there is no build step.
- **PayPal layer** (`src/paypal/client.ts`): OAuth2 client credentials,
  Orders v2 authorize, capture (full or partial), capture refund, Payouts,
  and webhook intake with signature verification. Deterministic mock mode
  when no credentials are set.
- **AI layer** (`src/ai/`): a provider-agnostic client for any
  OpenAI-compatible chat endpoint. The drafter and verifier share strict
  JSON output contracts (see `src/ai/prompts.ts`), hard validation, and a
  deterministic stub fallback so the app runs offline.
- **State**: a JSON-file store for contracts, milestones, and the event
  ledger (scaffold-grade, behind one small module).
- **Frontend**: one page with client and freelancer views plus the AG Grid
  Community ledger, and a `/connect` settings page for runtime credentials.

### Run it

- **Mock mode (no credentials needed)**: `npm install && npm start`, then
  open <http://localhost:3000>. The full contract → fund → verify →
  release flow runs offline against deterministic PayPal mocks and stub
  AI. Details in *Quick start* below.
- **Live sandbox**: start the server and open `/connect` to paste a PayPal
  sandbox Client ID and Secret (plus optional AI endpoint settings).
  Values are stored in a local `0600` secrets file outside git, applied
  live, and never displayed back. Environment variables work too and take
  precedence. Details in the `/connect` section below.

## Quick start (offline, mock mode)

No PayPal account needed — with no credentials set, the PayPal client
returns deterministic mock objects and the whole flow runs locally.

```bash
npm install
npm start          # http://localhost:3000
```

Open <http://localhost:3000> for the two-role demo UI (client / freelancer)
with the AG Grid ledger, or drive the API directly (see below).

## Running against the PayPal sandbox

1. Create a REST API app at
   <https://developer.paypal.com/dashboard/applications> (Sandbox).
2. Copy `.env.example` values into your environment:

```bash
export PAYPAL_MODE=live            # anything but "mock" + credentials = live
export PAYPAL_ENV=sandbox
export PAYPAL_CLIENT_ID=your-sandbox-client-id
export PAYPAL_CLIENT_SECRET=your-sandbox-secret
export PAYPAL_WEBHOOK_ID=          # optional, for webhook verification
npm start
```

Credentials are read from the environment only. They are never stored in
this repository, and `PAYPAL_MODE=mock` (or missing credentials) always
falls back to the offline mock.

## Runtime settings via `/connect` (no secrets in chat, repo, or env files)

Judges and reviewers should not have to paste secrets into a terminal.
With the server running, open **<http://localhost:3000/connect>** and paste
the sandbox Client ID / Secret (and optionally `AI_BASE_URL` / `AI_API_KEY`
/ `AI_MODEL`) into the form. On submit the server:

- writes the values to a local secrets file
  (`$PROOFPAY_SECRETS_FILE`, default `./data/secrets.json`, created with
  mode `0600`; the file is gitignored),
- applies them **live** — the PayPal client re-resolves its config on
  every token fetch and the AI layer on every call, so neither a restart
  nor a redeploy is needed,
- never renders a stored value back: the page and `GET /api/settings`
  report only *configured: yes/no*, the source (`env` or `file`), and the
  client id's last 4 characters.

Precedence: an environment variable always beats the secrets file, so a
deployment can still pin credentials through the environment and the file
only fills the gaps. Set **`PROOFPAY_SETUP_TOKEN`** to guard the page: the
token is then required as an `x-setup-token` header or `?setup_token=`
query value. Without it the page is open (local-demo default) and the
server logs a startup warning saying so.

## AI layer

The contract drafter and the deliverable verifier call any
OpenAI-compatible chat endpoint, configured through the environment or
the `/connect` page (see above):

```bash
export AI_BASE_URL=https://api.openai.com/v1   # any compatible host
export AI_API_KEY=your-key
export AI_MODEL=gpt-4o-mini                    # any model on that host
```

- **Drafter**: converts the brief into 1–4 milestones, each with 2–5
  acceptance criteria carrying weights that sum to 1. Output is validated
  hard; a malformed draft gets exactly one repair attempt, then the API
  returns a clean `502` — it never silently invents a contract.
- **Verifier**: returns a per-criterion verdict (`pass` / `partial` /
  `fail`) with cited evidence. A `pass` requires concrete evidence quoted
  from the deliverable; a post-check downgrades passes backed by vague
  praise to `partial`. The weighted verdicts set the release fraction.
- **Fallback**: if any of the three variables is missing, deterministic
  stubs (`src/ai/stubs.ts`) take over and the whole flow runs offline.
  `GET /health` reports `aiMode` (`live` / `stub`) and the model in use.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service + PayPal mode/env |
| GET | `/connect` | Runtime settings page (paste sandbox/AI credentials) |
| GET | `/api/settings` | Safe settings status (configured yes/no + source; never values) |
| POST | `/api/settings` | Save credentials to the local secrets file; applied live |
| POST | `/api/contracts` | Create a contract from a brief (AI drafter; stub fallback offline) |
| GET | `/api/contracts` | List contracts |
| GET | `/api/contracts/:id` | Get one contract |
| POST | `/api/contracts/:id/milestones/:mid/fund` | Create PayPal order (AUTHORIZE); live mode returns an approval URL and stops at `awaiting_approval`, mock mode authorizes instantly |
| POST | `/api/contracts/:id/milestones/:mid/confirm-fund` | After the client approves in PayPal Checkout: authorize the order — money held (idempotent) |
| GET | `/fund/return`, `/fund/cancel` | PayPal Checkout return points; confirm funding and 302 back to the demo page |
| POST | `/api/contracts/:id/milestones/:mid/submit` | Freelancer submits a deliverable `{ kind, content }` |
| POST | `/api/contracts/:id/milestones/:mid/verify` | Run the verifier (AI; stub fallback offline) — per-criterion report |
| POST | `/api/contracts/:id/milestones/:mid/release` | Capture + refund remainder + payout, per verification |
| GET | `/api/events?contractId=` | The ledger / evidence trail |
| POST | `/api/webhooks/paypal` | PayPal webhook intake (signature verified in live mode when `PAYPAL_WEBHOOK_ID` is set) |

Example mock flow:

```bash
# create
curl -s localhost:3000/api/contracts -H 'Content-Type: application/json' -d '{
  "brief": "Design a landing page for a coffee brand with hero section and contact form",
  "clientEmail": "client@example.com",
  "freelancerEmail": "freelancer@example.com",
  "totalAmount": 500, "currency": "USD" }'
# then fund -> submit -> verify -> release using the returned ids
```

## Layout

```
src/
  server.ts            Fastify bootstrap
  routes.ts            HTTP JSON API + webhook intake + static page
  types.ts             Domain types
  store.ts             JSON-file data store (scaffold-grade)
  paypal/client.ts     PayPal REST client: OAuth2, orders (AUTHORIZE),
                       authorize, capture (full/partial), refund, payouts,
                       webhook verification; deterministic mock mode
  settings.ts          Runtime secrets file (env-beats-file precedence,
                       0600, status view that never exposes values)
  ai/prompts.ts        The exact drafter + verifier prompts (JSON contracts)
  ai/client.ts         OpenAI-compatible chat client (env-only config)
  ai/drafter.ts        Brief -> milestones + weighted criteria (validated)
  ai/verifier.ts       Deliverable -> per-criterion verdicts + release fraction
  ai/stubs.ts          Deterministic fallback drafter + verifier (offline)
  services/escrow.ts   Domain flow + ledger writes
public/index.html      Demo UI: client/freelancer views + AG Grid ledger
```

## Stack

Node.js ≥ 22 (TypeScript runs via Node's native type stripping), Fastify 5,
built-in `fetch` for all PayPal calls, JSON-file store, AG Grid Community
(CDN) in the demo UI.

## License

MIT — see [LICENSE](LICENSE).
