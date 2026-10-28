<script lang="ts">
  import type { Contract, Milestone } from "../lib/types.ts";
  import { money, statusLabel } from "../lib/format.ts";
  import Stepper from "./Stepper.svelte";
  import VerdictPanel from "./VerdictPanel.svelte";

  let {
    contract,
    milestone,
    role,
    busyKey,
    onAction,
    onFund,
    onSubmit,
  }: {
    contract: Contract;
    milestone: Milestone;
    role: "client" | "freelancer";
    busyKey: string | null;
    onAction: (contractId: string, milestoneId: string, action: string) => void;
    onFund: (contractId: string, milestoneId: string) => void;
    onSubmit: (contractId: string, milestoneId: string) => void;
  } = $props();

  const m = $derived(milestone);
  const vById = $derived.by(() => {
    const map = new Map<string, NonNullable<Milestone["verification"]>["criteria"][number]>();
    for (const vc of m.verification?.criteria ?? []) map.set(vc.criterionId, vc);
    return map;
  });
  const ids = $derived(
    (
      [
        ["Order", m.paypalOrderId],
        ["Authorisation", m.paypalAuthorizationId],
        ["Capture", m.paypalCaptureId],
        ["Refund", m.paypalRefundId],
        ["Payout batch", m.paypalPayoutBatchId],
      ] as [string, string | undefined][]
    ).filter(([, v]) => v),
  );
  const key = $derived(`${contract.id}:${m.id}`);
  const busy = $derived(busyKey !== null);
  const myBusy = $derived(busyKey?.startsWith(key + ":") ?? false);
  const label = (base: string) => (myBusy ? "Working…" : base);
</script>

<div class="milestone" id="milestone-{m.id}">
  <div class="ms-head">
    <span class="ms-title">{m.title}</span>
    <span class="ms-amount">{money(m.amount, m.currency)}</span>
    <span class="badge {m.status}">{statusLabel(m.status)}</span>
  </div>

  {#if ids.length}
    <div class="ids">
      <span class="k">PayPal</span>
      {#each ids as [k, v]}
        <span class="mono chip-id">{k} {v}</span>
      {/each}
    </div>
  {/if}

  <Stepper {milestone} />

  <ul class="criteria">
    {#each m.criteria as cr}
      {@const vc = vById.get(cr.id)}
      <li>
        <span class="w">{Math.round(cr.weight * 100)}%</span>
        <div class="c-main">
          <span class="lbl">{cr.label}</span>
          {#if vc}<div class="reason">{vc.reason}</div>{/if}
        </div>
        {#if vc}<span class="verdict {vc.status}">{vc.status}</span>{/if}
      </li>
    {/each}
  </ul>

  {#if m.deliverable}
    <div class="deliverable">
      <div class="d-title">Deliverable submitted</div>
      <div class="d-body">{m.deliverable.content}</div>
    </div>
  {/if}

  {#if m.verification}
    <VerdictPanel {milestone} />
  {/if}

  <div class="ms-actions">
    {#if role === "client" && m.status === "draft"}
      <button class="action" disabled={busy} onclick={() => onFund(contract.id, m.id)}>
        {label("Fund (authorize via PayPal)")}
      </button>
    {/if}
    {#if role === "client" && m.status === "awaiting_approval"}
      <button class="action" disabled={busy} onclick={() => onAction(contract.id, m.id, "confirm-fund")}>
        {label("Confirm funding (after PayPal approval)")}
      </button>
    {/if}
    {#if role === "freelancer" && (m.status === "funded" || m.status === "failed")}
      <button class="action" disabled={busy} onclick={() => onSubmit(contract.id, m.id)}>
        {label("Submit deliverable")}
      </button>
    {/if}
    {#if m.status === "submitted"}
      <button class="action secondary" disabled={busy} onclick={() => onAction(contract.id, m.id, "verify")}>
        {label("Verify with AI")}
      </button>
    {/if}
    {#if role === "client" && m.verification && m.status !== "released"}
      <button class="action release" disabled={busy} onclick={() => onAction(contract.id, m.id, "release")}>
        {label("Release per verification")}
      </button>
    {/if}
  </div>
</div>

<style>
  .milestone {
    border: 1px solid var(--line-soft);
    border-radius: 16px;
    padding: 18px 20px;
    margin-top: 14px;
    background: #fdfdfe;
  }
  .ms-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ms-title {
    font-weight: 600;
    color: var(--ink);
    font-size: 15px;
  }
  .ms-amount {
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    margin-left: auto;
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: #f2f4f7;
    color: var(--secondary);
    border: 1px solid var(--line-soft);
    white-space: nowrap;
  }
  .badge.funded,
  .badge.submitted {
    background: var(--blue-bg);
    color: var(--blue);
    border-color: #b2ddff;
  }
  .badge.awaiting_approval {
    background: var(--amber-bg);
    color: var(--amber);
    border-color: #fedf89;
  }
  .badge.released {
    background: var(--green-bg);
    color: var(--green);
    border-color: #a6f4c5;
  }
  .badge.failed {
    background: var(--red-bg);
    color: var(--red);
    border-color: #fecdca;
  }
  .ids {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-top: 10px;
  }
  .ids .k {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .chip-id {
    background: #f2f4f7;
    border: 1px solid var(--line-soft);
    padding: 2px 8px;
    border-radius: 999px;
  }
  .criteria {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .criteria li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    background: #fff;
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .criteria .w {
    flex: none;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-bg);
    border-radius: 999px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .c-main {
    flex: 1;
    min-width: 0;
  }
  .criteria .lbl {
    color: var(--ink);
    font-size: 13.5px;
  }
  .criteria .reason {
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--secondary);
    line-height: 1.5;
  }
  .verdict {
    flex: none;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 999px;
  }
  .verdict.pass {
    background: var(--green-bg);
    color: var(--green);
  }
  .verdict.partial {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .verdict.fail {
    background: var(--red-bg);
    color: var(--red);
  }
  .deliverable {
    margin-top: 14px;
    background: #fffcf5;
    border: 1px solid #f5e6c4;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .d-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #b54708;
    margin-bottom: 6px;
  }
  .d-body {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--body);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ms-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .ms-actions:empty {
    display: none;
  }
</style>
