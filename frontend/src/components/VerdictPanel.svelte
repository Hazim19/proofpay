<script lang="ts">
  import type { Milestone } from "../lib/types.ts";
  import { money } from "../lib/format.ts";

  let { milestone }: { milestone: Milestone } = $props();
  const v = $derived(milestone.verification!);
  const pct = $derived(Math.round(v.releaseFraction * 100));
  const amount = $derived(Number(milestone.amount) || 0);
  const toFreelancer = $derived(v.releaseFraction * amount);
  const refunded = $derived(amount - toFreelancer);
</script>

<div class="verdict-panel">
  <div>
    <div class="vp-kicker">AI verification · {v.overall}</div>
    <div class="vp-pct">{pct}<span>%</span></div>
    <div class="vp-sub">
      release fraction · verifier <span class="mono">{v.verifier}</span> · checked
      {String(v.checkedAt || "").slice(0, 10)}
    </div>
  </div>
  <div class="vp-right">
    <div class="vp-row">
      <span>To freelancer</span><b class="to-free">{money(toFreelancer, milestone.currency)}</b>
    </div>
    <div class="vp-row">
      <span>Refunded to client</span><b>{money(refunded, milestone.currency)}</b>
    </div>
    <div class="vp-bar"><div style="width:{pct}%"></div></div>
    <div class="vp-note">
      Of {money(amount, milestone.currency)} authorised and held. Payment follows
      the verdict exactly — earned share out, the rest back.
    </div>
  </div>
</div>

<style>
  .verdict-panel {
    margin-top: 14px;
    background: linear-gradient(120deg, #17103a, #241b52 55%, #101828);
    border-radius: 16px;
    padding: 18px 22px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 34px;
    align-items: center;
    color: #eae7ff;
  }
  .vp-kicker {
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #bdb4ff;
    font-weight: 600;
  }
  .vp-pct {
    font-size: 44px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .vp-pct span {
    font-size: 22px;
    color: #bdb4ff;
    font-weight: 600;
  }
  .vp-sub {
    font-size: 12px;
    color: #a79dff;
  }
  .vp-right {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 240px;
  }
  .vp-row {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
    color: #cfc9ff;
  }
  .vp-row b {
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .vp-row b.to-free {
    color: #6ce9a6;
  }
  .vp-bar {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    overflow: hidden;
  }
  .vp-bar div {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), #12b76a);
  }
  .vp-note {
    font-size: 12px;
    color: #a79dff;
    line-height: 1.45;
  }
  @media (max-width: 720px) {
    .verdict-panel {
      grid-template-columns: 1fr;
    }
  }
</style>
