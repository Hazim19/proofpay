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
          width: 175,
          cellRenderer: (p: { value?: string }) =>
            `<span class="ev ${EV_CLASS[p.value ?? ""] || ""}">${esc(p.value)}</span>`,
        },
        { field: "contractId", headerName: "Contract", width: 135 },
        { field: "milestoneId", headerName: "Milestone", width: 155 },
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
  .ledger-grid {
    height: 420px;
    width: 100%;
    --ag-font-family: "Inter", system-ui, sans-serif;
    --ag-font-size: 13px;
    --ag-border-color: var(--line-soft);
    --ag-row-border-color: var(--line-soft);
    --ag-header-background-color: #f9fafb;
    --ag-cell-horizontal-padding: 14px;
  }
  .ledger-grid :global(.ev) {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f2f4f7;
    color: var(--secondary);
    white-space: nowrap;
  }
  .ledger-grid :global(.ev.money) {
    background: var(--green-bg);
    color: var(--green);
  }
  .ledger-grid :global(.ev.ai) {
    background: var(--violet-bg);
    color: var(--violet);
  }
  .ledger-grid :global(.ev.fund) {
    background: var(--blue-bg);
    color: var(--blue);
  }
</style>
