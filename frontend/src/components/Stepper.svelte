<script lang="ts">
  import type { Milestone } from "../lib/types.ts";
  import { LIFECYCLE, stepperStates } from "../lib/format.ts";

  let { milestone }: { milestone: Milestone } = $props();
  const states = $derived(stepperStates(milestone));
</script>

<div class="stage-line" aria-label="Milestone lifecycle">
  {#each LIFECYCLE as label, i}
    <div class="stage {states[i]}">
      <div class="stage-rule"></div>
      <div class="stage-label">
        {states[i] === "done" ? "✓ " : states[i] === "fail" ? "✕ " : ""}{label}
      </div>
    </div>
  {/each}
</div>

<style>
  .stage-line {
    display: flex;
    gap: 10px;
    margin: 16px 0 4px;
  }
  .stage {
    flex: 1;
    min-width: 0;
  }
  .stage-rule {
    border-top: 1px solid var(--rule);
  }
  .stage.done .stage-rule {
    border-top: 2px solid var(--green);
  }
  .stage.current .stage-rule {
    border-top: 2px solid var(--ink);
  }
  .stage.fail .stage-rule {
    border-top: 2px solid var(--red);
  }
  .stage-label {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10.5px;
    color: var(--faint);
    margin-top: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stage.done .stage-label {
    color: var(--green);
  }
  .stage.current .stage-label {
    color: var(--paper);
    background: var(--ink);
    font-weight: 600;
    display: inline-block;
    padding: 2px 8px 3px;
    margin-top: 4px;
  }
  .stage.fail .stage-label {
    color: var(--red);
    font-weight: 600;
  }
</style>
