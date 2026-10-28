<script lang="ts">
  import type { Milestone } from "../lib/types.ts";
  import { LIFECYCLE, stepperStates } from "../lib/format.ts";

  let { milestone }: { milestone: Milestone } = $props();
  const states = $derived(stepperStates(milestone));
</script>

<div class="stepper" aria-label="Milestone lifecycle">
  {#each LIFECYCLE as label, i}
    {#if i > 0}
      <div class="s-line" class:filled={states[i - 1] === "done"}></div>
    {/if}
    <div class="s-step {states[i]}">
      <div class="s-dot">
        {states[i] === "done" ? "✓" : states[i] === "fail" ? "✕" : i + 1}
      </div>
      <div class="s-label">{label}</div>
    </div>
  {/each}
</div>

<style>
  .stepper {
    display: flex;
    align-items: flex-start;
    margin: 14px 0 4px;
  }
  .s-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 52px;
  }
  .s-dot {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11.5px;
    font-weight: 600;
    background: #eaecf0;
    color: var(--muted);
    border: 1px solid var(--line);
  }
  .s-step.done .s-dot {
    background: var(--green-bg);
    color: var(--green);
    border-color: #a6f4c5;
  }
  .s-step.current .s-dot {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-bg);
  }
  .s-step.fail .s-dot {
    background: var(--red-bg);
    color: var(--red);
    border-color: #fecdca;
  }
  .s-label {
    font-size: 11px;
    color: var(--secondary);
    font-weight: 500;
  }
  .s-step.current .s-label {
    color: var(--ink);
    font-weight: 600;
  }
  .s-step.fail .s-label {
    color: var(--red);
    font-weight: 600;
  }
  .s-line {
    flex: 1;
    height: 2px;
    background: var(--line);
    margin-top: 12px;
    border-radius: 2px;
  }
  .s-line.filled {
    background: #a6f4c5;
  }
</style>
