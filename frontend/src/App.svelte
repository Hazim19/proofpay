<script lang="ts">
  import { onMount } from "svelte";
  import type { Contract, Health, LedgerEvent } from "./lib/types.ts";
  import { api, fetchHealth, setJsonSink } from "./lib/api.ts";
  import { money, sumEvents } from "./lib/format.ts";
  import HeroScene from "./components/HeroScene.svelte";
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

  const statFunded = $derived(
    money(sumEvents(events, ["funding_authorized", "milestone_funded"]), "USD"),
  );
  const statPaidOut = $derived(money(sumEvents(events, ["payout_sent"]), "USD"));
  const statRefunded = $derived(money(sumEvents(events, ["refunded"]), "USD"));

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

<div class="shell">
  <aside class="side">
    <div class="side-brand">
      <div class="logo">✓</div>
      <div>
        <div class="name">ProofPay</div>
        <div class="sub">AI-verified milestone escrow</div>
      </div>
    </div>
    <nav>
      <div class="nav-k">Workspace</div>
      <a href="#top" class="active"><span class="ic">▦</span>Overview</a>
      <a href="#clientPanel"><span class="ic">＋</span>New contract</a>
      <a href="#sectionContracts"><span class="ic">▤</span>Contracts</a>
      <a href="#sectionLedger"><span class="ic">≣</span>Ledger</a>
      <div class="nav-k">Learn</div>
      <a href="#sectionHow"><span class="ic">?</span>How it works</a>
    </nav>
    <div class="side-foot">
      <span class="pill">
        <span class="dot" class:on={health?.paypalMode === "live"}></span>
        PayPal: {health ? `${health.paypalMode} (${health.paypalEnv})` : "…"}
      </span>
      <span class="pill">
        <span class="dot" class:on={health?.aiMode === "live"}></span>
        AI: {health ? health.aiMode + (health.aiModel ? " · " + health.aiModel : "") : "…"}
      </span>
      <p class="side-note">Demo runs on the PayPal sandbox — all money shown is test money.</p>
    </div>
  </aside>

  <div class="main-wrap" id="top">
    <div class="main-in">
      <header class="hero">
        <HeroScene />
        <div class="hero-in">
          <div class="hero-text">
            <div class="hero-eyebrow">AI-verified milestone escrow</div>
            <h1>Escrow that pays on evidence, not trust.</h1>
            <p>
              The client funds a milestone through PayPal, the freelancer delivers,
              and AI verifies the work against the contract criteria before any
              money is released.
            </p>
          </div>
          <div class="seg" role="group" aria-label="Choose your role">
            <button class:active={role === "client"} onclick={() => (role = "client")}>
              I am the Client
            </button>
            <button class:active={role === "freelancer"} onclick={() => (role = "freelancer")}>
              I am the Freelancer
            </button>
          </div>
        </div>
      </header>

      {#if notice}
        <div class="notice" class:error={notice.error}>{notice.text}</div>
      {/if}
      {#if loadError}
        <div class="notice error">Could not load demo data: {loadError}</div>
      {/if}

      <div class="stats">
        <div class="stat">
          <div class="k">Contracts</div>
          <div class="v">{contracts.length}</div>
          <div class="s">live escrow contracts</div>
        </div>
        <div class="stat">
          <div class="k">Escrow funded</div>
          <div class="v">{statFunded}</div>
          <div class="s">authorised &amp; held via PayPal</div>
        </div>
        <div class="stat">
          <div class="k">Paid to freelancers</div>
          <div class="v">{statPaidOut}</div>
          <div class="s">released after AI verification</div>
        </div>
        <div class="stat">
          <div class="k">Refunded to clients</div>
          <div class="v">{statRefunded}</div>
          <div class="s">unearned share returned</div>
        </div>
      </div>

      <div class="how" id="sectionHow">
        <div class="h-card">
          <span class="n">1</span><b>Describe &amp; draft</b>
          <span>The client describes the job; AI drafts milestones with measurable, weighted acceptance criteria.</span>
        </div>
        <div class="h-card">
          <span class="n">2</span><b>Fund via PayPal</b>
          <span>The client approves in PayPal Checkout. The money is authorised and held — not sent.</span>
        </div>
        <div class="h-card">
          <span class="n">3</span><b>Verify &amp; release</b>
          <span>AI checks the delivery criterion by criterion with cited evidence. Payment follows the verdict: earned share out, the rest refunded.</span>
        </div>
      </div>

      {#if role === "client"}
        <section class="card" id="clientPanel">
          <h2>New contract (client)</h2>
          <p class="hint">Write a brief; the AI turns it into a contract with milestones and weighted criteria.</p>
          <label for="brief">Job brief</label>
          <textarea id="brief" rows="3" bind:value={brief}></textarea>
          <label for="clientEmail">Client email</label>
          <input id="clientEmail" bind:value={clientEmail} />
          <label for="freelancerEmail">Freelancer email</label>
          <input id="freelancerEmail" bind:value={freelancerEmail} />
          <label for="totalAmount">Total amount (USD)</label>
          <input id="totalAmount" type="number" min="1" bind:value={totalAmount} />
          <button class="action" disabled={busyKey !== null} onclick={createContract}>
            {busyKey === "create" ? "Working…" : "Create contract from brief"}
          </button>
        </section>
      {:else}
        <section class="card" id="freelancerPanel">
          <h2>Submit a deliverable (freelancer)</h2>
          <p class="hint">Pick a funded milestone below, then paste the delivery here and submit it from the milestone row.</p>
          <label for="deliverable">Deliverable content (text or link)</label>
          <textarea id="deliverable" rows="4" bind:value={deliverable}></textarea>
        </section>
      {/if}

      <section class="card" id="sectionContracts">
        <h2>Contracts &amp; milestones</h2>
        <p class="hint">Every contract below is real data from this live demo. Verification verdicts cite the evidence the AI relied on.</p>
        <div id="contracts">
          {#if !contracts.length}
            <p class="hint">No contracts yet.</p>
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

      <section class="card" id="sectionLedger">
        <h2>Ledger — evidence trail</h2>
        <p class="hint">Every step, with its PayPal transaction ID. If a dispute ever happens, this trail already exists.</p>
        <LedgerGrid {events} />
      </section>

      <details class="debug">
        <summary>Developer detail — last API response (JSON)</summary>
        <pre>{lastJson}</pre>
      </details>

      <footer>
        <span>ProofPay — built for the PayPal AI Hackathon.</span>
        <span>Funds held by PayPal · Both sides see the same evidence · Release follows the AI verdict</span>
      </footer>
    </div>
  </div>
</div>
