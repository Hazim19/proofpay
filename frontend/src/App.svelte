<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Contract, Health, LedgerEvent } from "./lib/types.ts";
  import { api, fetchHealth, setJsonSink } from "./lib/api.ts";
  import { moneyFig, sumEvents } from "./lib/format.ts";
  import ContractCard from "./components/ContractCard.svelte";
  import LedgerGrid from "./components/LedgerGrid.svelte";
  import ActionButton from "./components/ActionButton.svelte";

  let role = $state<"client" | "freelancer">("client");
  let health = $state<Pick<Health, "paypalMode" | "paypalEnv" | "aiMode" | "aiModel"> | null>(null);
  let contracts = $state<Contract[]>([]);
  let events = $state<LedgerEvent[]>([]);
  let lastJson = $state("{}");
  let notice = $state<{ text: string; error: boolean } | null>(null);
  let busyKey = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  let brief = $state(
    "Design a landing page for a coffee brand, including hero section, product grid and contact form. Deliver complete final files in web format with a short summary of how to use them.",
  );
  let clientEmail = $state("client@example.com");
  let freelancerEmail = $state("freelancer@example.com");
  /* Amount is edited as text (§12 rule 6: GOV.UK inputmode pattern) and
     validated as text; the API payload still sends Number(amountText),
     exactly as before. */
  let amountText = $state("500");
  let deliverable = $state(
    "Final landing page files in complete web format. The design covers the coffee brand brief: hero section, product grid, contact form. Summary and notes on how to use the files are included.",
  );

  setJsonSink((json) => {
    lastJson = JSON.stringify(json, null, 2);
  });

  const fundedFig = $derived(
    moneyFig(sumEvents(events, ["funding_authorized", "milestone_funded"]), "USD"),
  );
  const paidFig = $derived(moneyFig(sumEvents(events, ["payout_sent"]), "USD"));
  const refundedFig = $derived(moneyFig(sumEvents(events, ["refunded"]), "USD"));
  const issueNo = $derived(String(Math.max(contracts.length, 0)).padStart(2, "0"));

  async function refresh() {
    try {
      health = await fetchHealth();
      const data = await api<{ contracts: Contract[] }>("/api/contracts");
      contracts = data.contracts || [];
      const ev = await api<{ events: LedgerEvent[] }>("/api/events");
      events = ev.events || [];
      loadError = null;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  async function run(key: string, fn: () => Promise<void>) {
    if (busyKey) return;
    busyKey = key;
    try {
      await fn();
    } finally {
      busyKey = null;
    }
  }

  /* ------------------------------------------------ form UX (§12) ----
     Client-side validation mirrors the server's real rules (brief
     non-empty, totalAmount > 0) plus a permissive "valid-ish" email
     shape, so the UI never blocks a submission the server would accept.
     Errors never clear typed input; a field's error clears as the user
     fixes that field (recheck runs on input only for fields already in
     error — nothing is flagged while typing a fresh field). */
  type CreateField = "brief" | "amount" | "clientEmail" | "freelancerEmail";
  const FIELD_ORDER: CreateField[] = ["brief", "amount", "clientEmail", "freelancerEmail"];
  const FIELD_EL: Record<CreateField, string> = {
    brief: "brief",
    amount: "totalAmount",
    clientEmail: "clientEmail",
    freelancerEmail: "freelancerEmail",
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let formErrors = $state<Partial<Record<CreateField, string>>>({});
  const errorList = $derived(
    FIELD_ORDER.filter((f) => formErrors[f]).map((f) => ({
      key: f,
      el: FIELD_EL[f],
      msg: formErrors[f] as string,
    })),
  );
  let deliverableError = $state<string | null>(null);

  function checkField(f: CreateField): string | undefined {
    switch (f) {
      case "brief":
        return brief.trim()
          ? undefined
          : "The brief is empty — describe the job, its deliverables and how success is judged.";
      case "amount": {
        const t = amountText.trim();
        if (!t) return "Enter the total amount for the contract.";
        const n = Number(t);
        if (!Number.isFinite(n))
          return "The amount must be a number — for example 500 or 1250.50.";
        if (n <= 0)
          return "The amount must be more than zero — escrow cannot hold nothing.";
        return undefined;
      }
      case "clientEmail": {
        const t = clientEmail.trim();
        if (!t) return "Enter the client's email address.";
        return EMAIL_RE.test(t)
          ? undefined
          : "This does not look like an email address — check it for an @ and a domain, like sb-buyer@personal.example.com.";
      }
      case "freelancerEmail": {
        const t = freelancerEmail.trim();
        if (!t) return "Enter the freelancer's email address.";
        return EMAIL_RE.test(t)
          ? undefined
          : "This does not look like an email address — check it for an @ and a domain, like sb-seller@personal.example.com.";
      }
    }
  }

  function recheck(f: CreateField) {
    if (!(f in formErrors)) return;
    const msg = checkField(f);
    const nextErr = { ...formErrors };
    if (msg) nextErr[f] = msg;
    else delete nextErr[f];
    formErrors = nextErr;
  }

  async function validateCreate(): Promise<boolean> {
    const errs: Partial<Record<CreateField, string>> = {};
    for (const f of FIELD_ORDER) {
      const m = checkField(f);
      if (m) errs[f] = m;
    }
    formErrors = errs;
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return true;
    await tick();
    document.getElementById(FIELD_EL[first])?.focus();
    return false;
  }

  async function createContract() {
    if (busyKey) return;
    if (!(await validateCreate())) return;
    run("create", async () => {
      await api("/api/contracts", {
        brief,
        clientEmail,
        freelancerEmail,
        totalAmount: Number(amountText),
        currency: "USD",
      });
      await refresh();
    });
  }

  /** Live mode returns an approvalUrl: redirect to PayPal Checkout
      (PayPal sends the browser back to /fund/return afterwards). Mock
      mode funds instantly and the page simply refreshes. */
  function fundMilestone(contractId: string, milestoneId: string) {
    run(`${contractId}:${milestoneId}:fund`, async () => {
      const json = await api<{ milestone?: { approvalUrl?: string } }>(
        `/api/contracts/${contractId}/milestones/${milestoneId}/fund`,
        {},
      );
      const m = json.milestone;
      if (m?.approvalUrl && health?.paypalMode === "live") {
        window.location.href = m.approvalUrl;
        return;
      }
      await refresh();
    });
  }

  function act(contractId: string, milestoneId: string, action: string) {
    run(`${contractId}:${milestoneId}:${action}`, async () => {
      await api(`/api/contracts/${contractId}/milestones/${milestoneId}/${action}`, {});
      await refresh();
    });
  }

  /* The deliverable textarea lives in the freelancer panel above; the
     per-milestone submit button lives in MilestoneCard. An empty panel
     is caught here, before the API call (server rule: content required),
     and the error is shown at the field itself (§12 rules 7 & 9). */
  async function submitWork(contractId: string, milestoneId: string) {
    if (busyKey) return;
    if (!deliverable.trim()) {
      deliverableError =
        "The delivery panel is empty — paste the work, or a link to it, and say where the evidence for each criterion is.";
      await tick();
      const el = document.getElementById("deliverable");
      el?.scrollIntoView({ block: "center" });
      el?.focus();
      return;
    }
    deliverableError = null;
    run(`${contractId}:${milestoneId}:submit`, async () => {
      await api(`/api/contracts/${contractId}/milestones/${milestoneId}/submit`, {
        kind: "text",
        content: deliverable,
      });
      await refresh();
    });
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("funded")) {
      notice = {
        text:
          "Funding confirmed: milestone " +
          params.get("funded") +
          " is funded — the client’s payment is authorized and held in escrow.",
        error: false,
      };
    } else if (params.get("funding_error")) {
      notice = {
        text: "Funding could not be confirmed: " + params.get("funding_error"),
        error: true,
      };
    } else if (params.get("funding_cancelled")) {
      notice = {
        text: "Funding was cancelled in PayPal Checkout. No money was held.",
        error: true,
      };
    }
    refresh();
  });
</script>

<div class="page" id="top">
  <div class="mast-top">
    <div class="sc">Escrow &amp; Settlement Register</div>
    <div class="sc mast-mid">Funds held by PayPal · Released on evidence</div>
    <div class="sc">Vol. I — No. {issueNo}</div>
  </div>

  <div class="masthead">
    <h1>Proof<span class="pay">Pay</span></h1>
    <p class="tagline">
      Escrow that pays on <b>evidence</b>, not trust. The client funds a milestone;
      the freelancer delivers; the work is examined, criterion by criterion,
      before a single dollar moves.
    </p>
  </div>

  <div class="status-line">
    Rail — <b>PayPal {health ? `${health.paypalMode} (${health.paypalEnv})` : "…"}</b>
    · Verifier — <b>AI {health ? health.aiMode + (health.aiModel ? " · " + health.aiModel : "") : "…"}</b>
    · All sums are sandbox test money
  </div>
  <div class="rule-double"></div>

  <div class="acting-row">
    <div class="acting">
      <span class="sc">Acting as</span>
      <div class="switch" role="group" aria-label="Choose your role">
        <button
          id="roleClient"
          class:active={role === "client"}
          aria-pressed={role === "client"}
          onclick={() => (role = "client")}
        >
          The Client
        </button>
        <button
          id="roleFreelancer"
          class:active={role === "freelancer"}
          aria-pressed={role === "freelancer"}
          onclick={() => (role = "freelancer")}
        >
          The Freelancer
        </button>
      </div>
    </div>
    <nav class="regnav">
      <a href="#sectionHow">How it proceeds</a>
      <a href="#entryForm">New instrument</a>
      <a href="#sectionContracts">Contracts</a>
      <a href="#sectionLedger">Ledger</a>
    </nav>
  </div>

  <p class="role-note">
    {#if role === "client"}
      You are acting as <b>the client</b>: you fund milestones and release payment.
    {:else}
      You are acting as <b>the freelancer</b>: you submit deliverables against funded milestones.
    {/if}
  </p>

  {#if notice}
    <div class="notice" class:error={notice.error}>{notice.text}</div>
  {/if}
  {#if loadError}
    <div class="notice error">Could not load demo data: {loadError}</div>
  {/if}

  <div class="ledger-kpi">
    <div>
      <div class="lab">Contracts on the books</div>
      <div class="fig">{contracts.length}</div>
      <div class="note">live escrow instruments</div>
    </div>
    <div>
      <div class="lab">Authorised &amp; held</div>
      <div class="fig"><small>{fundedFig.cur}</small> {fundedFig.num}</div>
      <div class="note">funded through PayPal</div>
    </div>
    <div>
      <div class="lab">Paid to freelancers</div>
      <div class="fig"><small>{paidFig.cur}</small> {paidFig.num}</div>
      <div class="note">released after examination</div>
    </div>
    <div>
      <div class="lab">Returned to clients</div>
      <div class="fig"><small>{refundedFig.cur}</small> {refundedFig.num}</div>
      <div class="note">the unearned share, refunded</div>
    </div>
  </div>

  <div class="steps" id="sectionHow">
    <div>
      <div class="rn">№ 1</div>
      <h3>The brief becomes an instrument</h3>
      <p>
        The client describes the job. The contract is drawn up with milestones and
        weighted, measurable criteria of acceptance — agreed before any money is committed.
      </p>
    </div>
    <div>
      <div class="rn">№ 2</div>
      <h3>The money is held, not sent</h3>
      <p>
        The client approves the sum at PayPal checkout. It is authorised and held
        in escrow — in neither party's pocket while the work is done.
      </p>
    </div>
    <div>
      <div class="rn">№ 3</div>
      <h3>Examination, then settlement</h3>
      <p>
        The delivery is checked against every criterion, with the evidence cited.
        The earned share is paid out; the remainder returns to the client.
      </p>
    </div>
  </div>

  <div id="entryForm">
    {#if role === "client"}
      <section id="clientPanel">
        <div class="sec-head">
          <div class="sc">New instrument — drawn up by the client</div>
          <div class="sc f">Drafted by AI from the brief</div>
        </div>
        <p class="hint">Write a brief; the AI turns it into a contract with milestones and weighted criteria of acceptance.</p>

        {#if errorList.length}
          <div class="err-summary" role="alert">
            <div class="es-head">There is a problem — the instrument cannot be drawn up yet</div>
            <ul>
              {#each errorList as e (e.key)}
                <li>
                  <a
                    href="#{e.el}"
                    onclick={(ev) => {
                      ev.preventDefault();
                      document.getElementById(e.el)?.focus();
                    }}>{e.msg}</a
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <p class="req-line">
          All entries are required — each is marked <span class="reqmark" aria-hidden="true">*</span>; nothing in this form is optional.
        </p>

        <div class="fgroup">
          <div class="fg-head">The job</div>
          <div class="field" class:invalid={!!formErrors.brief}>
            <label for="brief">Job brief <span class="reqmark" aria-hidden="true">*</span><span class="vh">(required)</span></label>
            <p class="fhint" id="brief-hint">
              Say what is to be delivered, in what format, by when, and how success will be judged — the AI drafts the milestones and the acceptance criteria from this text. For example: “Design a landing page for a coffee brand — hero section, product grid and contact form — delivered as complete final files in web format, with a short summary of how to use them.”
            </p>
            {#if formErrors.brief}
              <p class="ferr" id="brief-error"><span class="vh">Error: </span>{formErrors.brief}</p>
            {/if}
            <textarea
              id="brief"
              rows="6"
              bind:value={brief}
              oninput={() => recheck("brief")}
              aria-invalid={!!formErrors.brief}
              aria-describedby="brief-hint{formErrors.brief ? ' brief-error' : ''}"
            ></textarea>
          </div>
          <div class="field" class:invalid={!!formErrors.amount}>
            <label for="totalAmount">Total amount <span class="reqmark" aria-hidden="true">*</span><span class="vh">(required)</span></label>
            <p class="fhint" id="amount-hint">
              The total for the whole contract, in US dollars — the AI splits it across the milestones it drafts. This is sandbox test money; no real funds move.
            </p>
            {#if formErrors.amount}
              <p class="ferr" id="amount-error"><span class="vh">Error: </span>{formErrors.amount}</p>
            {/if}
            <div class="amount-field" class:invalid={!!formErrors.amount}>
              <span class="cur" aria-hidden="true">USD</span>
              <input
                id="totalAmount"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                bind:value={amountText}
                oninput={() => recheck("amount")}
                aria-invalid={!!formErrors.amount}
                aria-describedby="amount-hint{formErrors.amount ? ' amount-error' : ''}"
              />
            </div>
          </div>
        </div>

        <div class="fgroup">
          <div class="fg-head">The parties</div>
          <div class="field" class:invalid={!!formErrors.clientEmail}>
            <label for="clientEmail">Client email <span class="reqmark" aria-hidden="true">*</span><span class="vh">(required)</span></label>
            <p class="fhint" id="clientEmail-hint">
              The client's PayPal sandbox address. Funding is authorised from this account at PayPal checkout, and the settlement is recorded against it. For the demo, use a sandbox buyer address (sb-…@personal.example.com).
            </p>
            {#if formErrors.clientEmail}
              <p class="ferr" id="clientEmail-error"><span class="vh">Error: </span>{formErrors.clientEmail}</p>
            {/if}
            <input
              id="clientEmail"
              class="w-email"
              type="email"
              autocomplete="email"
              bind:value={clientEmail}
              oninput={() => recheck("clientEmail")}
              aria-invalid={!!formErrors.clientEmail}
              aria-describedby="clientEmail-hint{formErrors.clientEmail ? ' clientEmail-error' : ''}"
            />
          </div>
          <div class="field" class:invalid={!!formErrors.freelancerEmail}>
            <label for="freelancerEmail">Freelancer email <span class="reqmark" aria-hidden="true">*</span><span class="vh">(required)</span></label>
            <p class="fhint" id="freelancerEmail-hint">
              The freelancer's PayPal sandbox address. After a verdict, the earned share is paid out to this address — it belongs to the other party, so the browser will not autofill it for you.
            </p>
            {#if formErrors.freelancerEmail}
              <p class="ferr" id="freelancerEmail-error"><span class="vh">Error: </span>{formErrors.freelancerEmail}</p>
            {/if}
            <input
              id="freelancerEmail"
              class="w-email"
              type="email"
              autocomplete="off"
              bind:value={freelancerEmail}
              oninput={() => recheck("freelancerEmail")}
              aria-invalid={!!formErrors.freelancerEmail}
              aria-describedby="freelancerEmail-hint{formErrors.freelancerEmail ? ' freelancerEmail-error' : ''}"
            />
          </div>
        </div>

        <ActionButton anyBusy={busyKey !== null} working={busyKey === "create"} workingLabel="Drawing up" onclick={createContract}>
          Draw up the contract from this brief
        </ActionButton>
      </section>
    {:else}
      <section id="freelancerPanel">
        <div class="sec-head">
          <div class="sc">Delivery — submitted by the freelancer</div>
          <div class="sc f">Against a funded milestone</div>
        </div>
        <p class="hint">Pick a funded milestone below, then paste the delivery here and submit it from the milestone row.</p>
        <div class="field" class:invalid={!!deliverableError}>
          <label for="deliverable">Deliverable content (text or link) <span class="reqmark" aria-hidden="true">*</span><span class="vh">(required)</span></label>
          <p class="fhint" id="deliverable-hint">
            Paste the delivered work — the text itself, a link to the files, or a description of them — and say, criterion by criterion, where the evidence for each criterion is. The examiner reads exactly this text and checks it against the criteria recorded in the milestone below.
          </p>
          {#if deliverableError}
            <p class="ferr" id="deliverable-error"><span class="vh">Error: </span>{deliverableError}</p>
          {/if}
          <textarea
            id="deliverable"
            rows="5"
            bind:value={deliverable}
            oninput={() => {
              if (deliverableError && deliverable.trim()) deliverableError = null;
            }}
            aria-invalid={!!deliverableError}
            aria-describedby="deliverable-hint{deliverableError ? ' deliverable-error' : ''}"
          ></textarea>
        </div>
      </section>
    {/if}
  </div>

  <section id="sectionContracts">
    <div class="sec-head">
      <div class="sc">The Register — contracts &amp; milestones</div>
      <div class="sc f">{contracts.length} instruments on the books</div>
    </div>
    <p class="hint">Every contract below is real data from this live demo. Verification verdicts cite the evidence the AI relied on.</p>
    <div id="contracts">
      {#if !contracts.length}
        <p class="hint">No contracts yet — the register is empty.</p>
      {/if}
      {#each contracts as contract (contract.id)}
        <ContractCard
          {contract}
          {role}
          {busyKey}
          onAction={act}
          onFund={fundMilestone}
          onSubmit={submitWork}
        />
      {/each}
    </div>
  </section>

  <section id="sectionLedger">
    <div class="sec-head">
      <div class="sc">Ledger — evidence trail</div>
      <div class="sc f">{events.length} entries recorded</div>
    </div>
    <p class="hint">Every step, with its PayPal transaction ID. If a dispute ever happens, this trail already exists.</p>
    <LedgerGrid {events} />
  </section>

  <details class="appendix">
    <summary>Open the folio appendix — last API response (JSON), kept for the developer</summary>
    <pre>{lastJson}</pre>
  </details>

  <div class="foot">
    <div class="sc">ProofPay — built for the PayPal AI Hackathon</div>
    <div class="sc">Every entry in this register cites its evidence</div>
  </div>
</div>
