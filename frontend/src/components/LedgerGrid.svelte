<script lang="ts">
  import { onMount } from "svelte";
  import type { LedgerEvent } from "../lib/types.ts";
  import { EV_CLASS, detailText, esc } from "../lib/format.ts";

  let { events }: { events: LedgerEvent[] } = $props();

  let gridEl: HTMLDivElement | undefined = $state();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gridApi: any = null;

  onMount(() => {
    // AG Grid is loaded as a classic script tag (same CDN + version as the
    // previous page) so it is a window global by the time this runs.
    const agGrid = (window as unknown as { agGrid?: any }).agGrid;
    if (!agGrid || !gridEl) return;
    gridApi = agGrid.createGrid(gridEl, {
      columnDefs: [
        {
          field: "ts",
          headerName: "Time",
          width: 185,
          valueFormatter: (p: { value?: string }) =>
            p.value ? String(p.value).replace("T", " ").slice(0, 19) : "",
        },
        {
          field: "type",
          headerName: "Event",
          width: 185,
          cellRenderer: (p: { value?: string }) =>
            `<span class="ev ${EV_CLASS[p.value ?? ""] || ""}">${esc(p.value)}</span>`,
        },
        { field: "contractId", headerName: "Contract", width: 140 },
        { field: "milestoneId", headerName: "Milestone", width: 160 },
        {
          field: "detail",
          headerName: "Detail",
          flex: 1,
          valueFormatter: (p: { value?: Record<string, unknown> }) =>
            detailText(p.value),
        },
      ],
      rowData: [...events].reverse(),
    });
    return () => {
      gridApi?.destroy?.();
      gridApi = null;
    };
  });

  $effect(() => {
    const rows = [...events].reverse();
    if (gridApi) gridApi.setGridOption("rowData", rows);
  });
</script>

<div bind:this={gridEl} class="ag-theme-quartz ledger-grid"></div>

<style>
  /* AG Grid (sponsor requirement) dressed as a page of the register:
     paper ground, ruled rows, mono type, small-caps column heads,
     no quartz chrome, no blue. */
  .ledger-grid {
    height: 420px;
    width: 100%;
    margin-top: 14px;
    border-top: 2px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    --ag-font-family: var(--mono);
    --ag-font-size: 12.5px;
    --ag-background-color: var(--paper);
    --ag-foreground-color: var(--ink);
    --ag-header-background-color: var(--paper);
    --ag-header-foreground-color: var(--faint);
    --ag-border-color: var(--rule);
    --ag-row-border-color: var(--rule);
    --ag-odd-row-background-color: var(--paper);
    --ag-row-hover-color: rgba(30, 86, 49, 0.08);
    --ag-selected-row-background-color: rgba(30, 86, 49, 0.08);
    --ag-cell-horizontal-padding: 14px;
    --ag-header-height: 40px;
    --ag-row-height: 37px;
  }
  .ledger-grid :global(.ag-root-wrapper) {
    border: none;
    background: var(--paper);
  }
  .ledger-grid :global(.ag-header) {
    border-bottom: 1px solid var(--ink);
  }
  .ledger-grid :global(.ag-header-cell-label) {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11px;
    font-weight: 500;
  }
  .ledger-grid :global(.ag-cell) {
    display: flex;
    align-items: center;
  }
  .ledger-grid :global(.ev) {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
  }
  .ledger-grid :global(.ev.money) {
    color: var(--green);
  }
  .ledger-grid :global(.ev.ai) {
    color: var(--stamp);
  }
  .ledger-grid :global(.ev.fund) {
    color: var(--ink);
  }
</style>
