<script lang="ts">
  import type { Milestone } from "../lib/types.ts";
  import { longDate, money } from "../lib/format.ts";

  let { milestone, index }: { milestone: Milestone; index: number } = $props();
  const v = $derived(milestone.verification!);
  const pct = $derived(Math.round(v.releaseFraction * 100));
  const amount = $derived(Number(milestone.amount) || 0);
  const cur = $derived(milestone.currency || "USD");
  const released = $derived(milestone.status === "released");

  /* Settlement follows the verdict exactly. A failed examination moves
     nothing: the earned share is 0 and the whole sum stays held, pending
     revision — it is not silently refunded. */
  const toFreelancer = $derived(
    v.overall === "fail" ? 0 : v.releaseFraction * amount,
  );
  const refunded = $derived(
    v.overall === "fail" ? 0 : amount - toFreelancer,
  );
  const retained = $derived(amount - toFreelancer - refunded);

  const stampTop = $derived(
    v.overall === "pass"
      ? "AI Verified"
      : v.overall === "partial"
        ? "AI Verified · Partial"
        : "Not Verified",
  );
</script>

<div class="verdict">
  <div class="stamp-cell">
    <div class="stamp {v.overall}">
      <div class="s1">{stampTop}</div>
      <div class="s2">Release {pct}%</div>
      <div class="s3">
        Examined criterion by criterion<br />
        <span class="mono">verifier {v.verifier}</span><br />
        {longDate(v.checkedAt)}
      </div>
    </div>
  </div>

  <div class="settle">
    <h4>Settlement of Milestone {index + 1} — {money(amount, cur)} authorised &amp; held</h4>
    <div class="row total">
      <div class="k">
        {released ? "Paid" : "Payable"} to the freelancer
        <i>— the earned {pct}%</i>
      </div>
      <div class="v">{money(toFreelancer, cur)}</div>
    </div>
    <div class="row refund">
      <div class="k">
        {released ? "Returned" : "To be returned"} to the client
        <i>— the unearned {100 - pct}%</i>
      </div>
      <div class="v">{money(refunded, cur)}</div>
    </div>
    <div class="row">
      <div class="k">Retained in escrow</div>
      <div class="v">{money(retained, cur)}</div>
    </div>
    <p class="settle-note">
      Payment follows the verdict exactly: the share that was proven moves,
      the share that was not returns.
    </p>
  </div>
</div>

<style>
  .verdict {
    display: grid;
    grid-template-columns: 470px 1fr;
    gap: 64px;
    margin-top: 44px;
    border-top: 2px solid var(--ink);
    padding-top: 34px;
  }
  .stamp {
    --rot: -3.5deg;
    border: 3px double var(--stamp);
    color: var(--stamp);
    padding: 24px 28px 20px;
    transform: rotate(var(--rot));
    text-align: center;
    max-width: 440px;
    background: rgba(154, 59, 38, 0.03);
    /* Settle-in like a stamp being pressed, once, when the verdict
       first renders (§11 rule 9). */
    animation: stamp-press 0.35s cubic-bezier(0.2, 1.2, 0.35, 1) both;
  }
  @keyframes stamp-press {
    0% {
      transform: rotate(-10deg) scale(1.55);
      opacity: 0;
    }
    60% {
      transform: rotate(calc(var(--rot) - 1deg)) scale(0.97);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--rot)) scale(1);
      opacity: 1;
    }
  }
  .stamp.pass {
    border-color: var(--green);
    color: var(--green);
    background: rgba(30, 86, 49, 0.03);
  }
  .stamp.fail {
    border-color: var(--red);
    color: var(--red);
    background: rgba(179, 38, 30, 0.03);
  }
  .stamp .s1 {
    font-family: var(--mono);
    font-weight: 600;
    letter-spacing: 0.28em;
    font-size: 14.5px;
    text-transform: uppercase;
  }
  .stamp .s2 {
    font-family: var(--serif-display);
    font-weight: 900;
    font-size: 58px;
    line-height: 1.05;
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
  .stamp .s3 {
    font-family: var(--mono);
    font-size: 12.5px;
    letter-spacing: 0.1em;
    margin-top: 8px;
    line-height: 1.7;
  }
  .stamp .s3 .mono {
    letter-spacing: 0;
  }
  .settle h4 {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 12px;
    color: var(--faint);
    font-weight: 500;
    margin: 0 0 8px;
  }
  .settle .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 18px;
    padding: 13px 0 11px;
    border-bottom: 1px solid var(--rule);
  }
  .settle .row .k {
    font-size: 19px;
  }
  .settle .row .k i {
    color: var(--faint);
    font-size: 16px;
  }
  .settle .row .v {
    font-family: var(--mono);
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .settle .row.total {
    border-bottom: 2px solid var(--ink);
  }
  .settle .row.total .v {
    color: var(--green);
  }
  .settle .row.refund .v {
    color: var(--stamp);
  }
  .settle-note {
    margin: 14px 0 0;
    font-style: italic;
    color: var(--faint);
    font-size: 16px;
  }
  @media (max-width: 1020px) {
    .verdict {
      grid-template-columns: 1fr;
      gap: 30px;
    }
    .stamp {
      --rot: -2deg;
    }
  }
  /* Phones: stamp centred above the settlement ledger, sized so its
     rotation never reaches the screen edge (§13 rule 5). */
  @media (max-width: 720px) {
    .stamp-cell {
      display: flex;
      justify-content: center;
      padding: 6px 4px 2px;
    }
    .stamp {
      width: min(330px, 100%);
      padding: 20px 18px 16px;
    }
    .stamp .s2 {
      font-size: 42px;
    }
    .stamp .s1 {
      font-size: 12.5px;
      letter-spacing: 0.22em;
    }
    .settle .row .k {
      font-size: 17.5px;
    }
    .settle .row .v {
      font-size: 19px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
  }
</style>
