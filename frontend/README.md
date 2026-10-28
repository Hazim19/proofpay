# ProofPay frontend (Svelte, Direction A)

The demo UI is a plain Vite + Svelte 5 app (no SvelteKit — the Fastify
backend in `../src` stays the only server).

Design: **Direction A — "financial paperwork, elevated"**, per the approved
mockups in `../referensi-ui/mockups/arah-A-home.html` and
`arah-A-kontrak.html`. Warm paper, ink, Fraunces display serif, Newsreader
body, IBM Plex Mono for money and IDs; contracts are printed instruments,
criteria form an examination table, and the AI verdict is a rubber stamp
beside a settlement ledger. The earlier Three.js hero scene was retired
with the previous design.

## Build

```bash
npm install
npm run build   # regenerates ../public/index.html
```

The backend serves exactly two files from `../public` — `index.html` at
`/` and `connect.html` at `/connect` — both read into memory at startup,
so the build inlines the entire app (JS + CSS) into a single `index.html`
via `vite-plugin-singlefile`, with `emptyOutDir: false` so `connect.html`
is never touched. Restart the `proofpay` service after a build for the
new page to be served. AG Grid still loads from the jsdelivr CDN at
runtime (sponsor requirement), as do the font files (with strong serif
fallbacks when offline).

## Layout

- `src/App.svelte` — the register page (masthead, KPI ledger, steps,
  entry forms, contract register, ledger, appendix)
- `src/components/` — Stepper (lifecycle stage line), VerdictPanel
  (stamp + settlement), MilestoneCard (examination table), ContractCard
  (the instrument), LedgerGrid (AG Grid)
- `src/lib/` — API client, formatting/ledger helpers, shared types
  (mirrors `../src/types.ts`; keep them in sync)
