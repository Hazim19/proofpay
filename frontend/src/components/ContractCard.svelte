<script lang="ts">
  import type { Contract } from "../lib/types.ts";
  import { money } from "../lib/format.ts";
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
</script>

<div class="contract" id="contract-{contract.id}">
  <div class="contract-head">
    <div class="head-main">
      <span class="title">{contract.title}</span>
      <div class="meta">
        <span class="mono">{contract.id}</span> · client {contract.clientEmail} ·
        freelancer {contract.freelancerEmail}
      </div>
    </div>
    <div class="total-wrap">
      <div class="total">{money(total, cur)}</div>
      <div class="total-cap">total value</div>
    </div>
  </div>

  {#each contract.milestones as milestone (milestone.id)}
    <MilestoneCard {contract} {milestone} {role} {busyKey} {onAction} {onFund} {onSubmit} />
  {/each}
</div>

<style>
  .contract {
    border-top: 1px solid var(--line-soft);
    padding: 18px 0 6px;
  }
  .contract:first-of-type {
    border-top: none;
    padding-top: 6px;
  }
  .contract-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .head-main {
    min-width: 0;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .meta {
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--secondary);
    word-break: break-word;
  }
  .total-wrap {
    text-align: right;
    flex: none;
  }
  .total {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .total-cap {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
