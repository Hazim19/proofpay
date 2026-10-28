<script lang="ts">
  import type { Contract, Milestone } from "../lib/types.ts";
  import { findingLabel, milestoneStateLabel, money } from "../lib/format.ts";
  import Stepper from "./Stepper.svelte";
  import VerdictPanel from "./VerdictPanel.svelte";

  let {
    contract,
    milestone,
    index,
    role,
    busyKey,
    onAction,
    onFund,
    onSubmit,
  }: {
    contract: Contract;
    milestone: Milestone;
    index: number;
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
        ["PayPal Order", m.paypalOrderId],
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
    <div class="t">Milestone {index + 1} — {m.title}</div>
    <div class="st {m.status}">{milestoneStateLabel(m)}</div>
    <div class="a">{money(m.amount, m.currency)}</div>
  </div>

  <Stepper {milestone} />

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

  <div class="exam-wrap">
  <table class="exam">
    <thead>
      <tr>
        <th>№</th>
        <th>Criterion of acceptance</th>
        <th>Weight</th>
        <th>Finding</th>
        <th>Evidence cited</th>
      </tr>
    </thead>
    <tbody>
      {#each m.criteria as cr, ci (cr.id)}
        {@const vc = vById.get(cr.id)}
        <tr>
          <td class="no">{ci + 1}.</td>
          <td class="crit"><div class="c">{cr.label}</div></td>
          <td class="wt">{Math.round(cr.weight * 100)}%</td>
          <td class="find">
            {#if vc}
              <span class="f-{vc.status}">{findingLabel(vc.status)}</span>
            {:else}
              <span class="f-none">—</span>
            {/if}
          </td>
          <td class="ev">{vc ? vc.reason : "Not yet examined."}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  </div>

  {#if m.deliverable}
    <div class="deliv">
      <span class="sc">Deliverable as submitted</span>
      <p>{m.deliverable.content}</p>
    </div>
  {/if}

  {#if m.verification}
    <VerdictPanel {milestone} index={index} />
  {/if}

  {#if ids.length}
    <div class="refs">
      {#each ids as [k, v]}
        <div><span>{k}</span><span>{v}</span></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .milestone {
    margin-top: 10px;
    padding-bottom: 26px;
  }
  .ms-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 18px;
    margin-top: 30px;
    border-top: 2px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    padding: 12px 0 10px;
  }
  .ms-head .t {
    font-family: var(--serif-display);
    font-weight: 700;
    font-size: 26px;
    line-height: 1.2;
  }
  .ms-head .st {
    font-family: var(--mono);
    font-size: 12.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
    white-space: nowrap;
  }
  .ms-head .st.released {
    color: var(--green);
  }
  .ms-head .st.failed {
    color: var(--red);
  }
  .ms-head .st.funded,
  .ms-head .st.submitted {
    color: var(--ink);
  }
  .ms-head .a {
    font-family: var(--serif-display);
    font-weight: 800;
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ms-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 16px;
  }
  .ms-actions:empty {
    display: none;
  }

  /* ------------------------------------------------ examination table */
  .exam-wrap {
    overflow-x: auto;
  }
  table.exam {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    margin-top: 8px;
  }
  table.exam th {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11px;
    color: var(--faint);
    text-align: left;
    padding: 14px 10px 8px;
    border-bottom: 1px solid var(--rule);
    font-weight: 500;
  }
  table.exam td {
    padding: 17px 10px 15px;
    border-bottom: 1px solid var(--rule);
    vertical-align: top;
  }
  td.no {
    font-family: var(--serif-display);
    font-style: italic;
    font-weight: 600;
    font-size: 20px;
    color: var(--faint);
    width: 52px;
  }
  td.crit {
    width: 400px;
  }
  td.crit .c {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
  }
  td.wt {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    width: 84px;
  }
  td.find {
    width: 150px;
  }
  .f-pass {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 13.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--green);
  }
  .f-partial {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 13.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--stamp);
  }
  .f-fail {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 13.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
  }
  .f-none {
    color: var(--faint);
  }
  td.ev {
    font-style: italic;
    font-size: 15.5px;
    color: #4a4234;
    line-height: 1.45;
  }

  /* ------------------------------------------------------ deliverable */
  .deliv {
    margin-top: 32px;
  }
  .deliv .sc {
    color: var(--faint);
    border-bottom: 1px solid var(--rule);
    display: block;
    padding-bottom: 7px;
  }
  .deliv p {
    margin: 14px 0 0;
    font-size: 17.5px;
    max-width: 1020px;
    color: #2c261d;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ---------------------------------------------------- PayPal register */
  .refs {
    margin-top: 44px;
    border-top: 1px solid var(--rule);
    padding-top: 16px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 44px;
  }
  .refs div {
    font-family: var(--mono);
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px dotted var(--rule);
    padding-bottom: 6px;
  }
  .refs div span:first-child {
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    padding-top: 2px;
    white-space: nowrap;
  }
  .refs div span:last-child {
    word-break: break-all;
    text-align: right;
  }
  @media (max-width: 1020px) {
    .refs {
      grid-template-columns: 1fr;
    }
    td.crit {
      width: auto;
    }
  }
  @media (max-width: 720px) {
    .ms-head {
      flex-wrap: wrap;
    }
  }
</style>
