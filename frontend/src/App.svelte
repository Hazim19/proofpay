<script lang="ts">
  import { onMount } from "svelte";
  import type { Contract, Health, LedgerEvent } from "./lib/types.ts";
  import { api, fetchHealth, setJsonSink } from "./lib/api.ts";
  import { moneyFig, sumEvents } from "./lib/format.ts";
  import ContractCard from "./components/ContractCard.svelte";
  import LedgerGrid from "./components/LedgerGrid.svelte";

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
  let totalAmount = $state(500);
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

  function createContract() {
    run("create", async () => {
      await api("/api/contracts", {
        brief,
        clientEmail,
        freelancerEmail,
        totalAmount: Number(totalAmount),
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

  function submitWork(contractId: string, milestoneId: string) {
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
          onclick={() => (role = "client")}
        >
          The Client
        </button>
        <button
          id="roleFreelancer"
          class:active={role === "freelancer"}
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
        <label for="brief">Job brief</label>
        <textarea id="brief" rows="3" bind:value={brief}></textarea>
        <label for="clientEmail">Client email</label>
        <input id="clientEmail" bind:value={clientEmail} />
        <label for="freelancerEmail">Freelancer email</label>
        <input id="freelancerEmail" bind:value={freelancerEmail} />
        <label for="totalAmount">Total amount (USD)</label>
        <input id="totalAmount" type="number" min="1" bind:value={totalAmount} />
        <button class="action" disabled={busyKey !== null} onclick={createContract}>
          {busyKey === "create" ? "Working…" : "Draw up the contract"}
        </button>
      </section>
    {:else}
      <section id="freelancerPanel">
        <div class="sec-head">
          <div class="sc">Delivery — submitted by the freelancer</div>
          <div class="sc f">Against a funded milestone</div>
        </div>
        <p class="hint">Pick a funded milestone below, then paste the delivery here and submit it from the milestone row.</p>
        <label for="deliverable">Deliverable content (text or link)</label>
        <textarea id="deliverable" rows="4" bind:value={deliverable}></textarea>
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
    <summary>Appendix — last API response (JSON), kept for the developer</summary>
    <pre>{lastJson}</pre>
  </details>

  <div class="foot">
    <div class="sc">ProofPay — built for the PayPal AI Hackathon</div>
    <div class="sc">Every entry in this register cites its evidence</div>
  </div>
</div>
