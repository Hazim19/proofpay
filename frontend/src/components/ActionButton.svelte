<script lang="ts">
  import type { Snippet } from "svelte";

  /* One register-styled action block for the whole app, so every clickable
     carries the same signifiers (§11 of referensi-ui/REFERENSI_UI.md):
     solid ink / money-green block + "→" at rest, inversion on hover,
     press-shift on active, double-rule focus, ruled-hatch disabled,
     and a working label with animated ellipsis while its own call runs. */
  let {
    variant = "",
    anyBusy = false,
    working = false,
    workingLabel = "Working",
    onclick,
    children,
  }: {
    variant?: "" | "secondary" | "release";
    anyBusy?: boolean;
    working?: boolean;
    workingLabel?: string;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  class="action {variant}"
  class:working
  disabled={anyBusy}
  aria-busy={working}
  {onclick}
>
  {#if working}
    <span class="work">{workingLabel}<span class="ell" aria-hidden="true"></span></span>
  {:else}
    {@render children()}<span class="arr" aria-hidden="true">→</span>
  {/if}
</button>
