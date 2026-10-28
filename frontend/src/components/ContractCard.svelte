<script lang="ts">
  import type { Contract } from "../lib/types.ts";
  import { longDate, money } from "../lib/format.ts";
  import MilestoneCard from "./MilestoneCard.svelte";

  let {
    contract,
    role,
    busyKey,
    onAction,
    onFund,
    onSubmit,
  }: {
    contract: Contract;
    role: "client" | "freelancer";
    busyKey: string | null;
    onAction: (contractId: string, milestoneId: string, action: string) => void;
    onFund: (contractId: string, milestoneId: string) => void;
    onSubmit: (contractId: string, milestoneId: string) => void;
  } = $props();

  const total = $derived(
    contract.milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0),
  );
  const cur = $derived(
    contract.currency || contract.milestones[0]?.currency || "USD",
  );
  const settledCount = $derived(
    contract.milestones.filter((m) => m.status === "released").length,
  );
  const settledText = $derived(
    settledCount > 0
      ? `${settledCount} of ${contract.milestones.length} milestones settled`
      : "No milestone settled yet",
  );
</script>

<article class="instrument" id="contract-{contract.id}">
  <div class="sec-head inst-head">
    <div class="sc">Instrument № {contract.id} — entered in the register {longDate(contract.createdAt)}</div>
    <div class="sc" class:r={settledCount > 0} class:f={settledCount === 0}>{settledText}</div>
  </div>

  <h3 class="inst-title">{contract.title}</h3>

  <div class="parties">
    <div>
      <div class="who">The Client</div>
      <div class="addr mono">{contract.clientEmail}</div>
    </div>
    <div>
      <div class="who">The Freelancer</div>
      <div class="addr mono">{contract.freelancerEmail}</div>
    </div>
  </div>

  <div class="amount-row">
    <div class="lab">Total consideration under this instrument</div>
    <div class="amt">{money(total, cur)}</div>
  </div>

  {#each contract.milestones as milestone, i (milestone.id)}
    <MilestoneCard {contract} {milestone} index={i} {role} {busyKey} {onAction} {onFund} {onSubmit} />
  {/each}
</article>

<style>
  .instrument {
    margin-top: 8px;
  }
  .inst-head {
    margin-top: 48px;
  }
  .inst-title {
    font-family: var(--serif-display);
    font-weight: 800;
    font-size: 36px;
    line-height: 1.15;
    margin: 22px 0 0;
    max-width: 900px;
  }
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 24px;
    border-top: 1px solid var(--rule);
  }
  .parties > div {
    padding: 14px 26px 12px 0;
    min-width: 0;
  }
  .parties > div + div {
    border-left: 1px solid var(--rule);
    padding-left: 26px;
  }
  .parties .who {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 11.5px;
    color: var(--faint);
  }
  .parties .addr {
    font-size: 14.5px;
    color: var(--ink-soft);
    margin-top: 5px;
    word-break: break-all;
  }
  .amount-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 20px;
    margin-top: 6px;
    border-top: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule-dark);
    padding: 14px 0 12px;
  }
  .amount-row .lab {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 12px;
    color: var(--faint);
  }
  .amount-row .amt {
    font-family: var(--serif-display);
    font-weight: 800;
    font-size: 38px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (max-width: 720px) {
    .inst-title {
      font-size: 28px;
    }
    .parties {
      grid-template-columns: 1fr;
    }
    .parties > div + div {
      border-left: none;
      padding-left: 0;
    }
    .amount-row .amt {
      font-size: 30px;
    }
  }
</style>
