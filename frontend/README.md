# ProofPay frontend (Svelte + Three.js)

The demo UI is a plain Vite + Svelte 5 app (no SvelteKit — the Fastify
backend in `../src` stays the only server). Three.js provides exactly one
visual moment: the animated "vault" scene in the hero header
(`src/components/HeroScene.svelte`), DPR-capped, paused off-screen/hidden,
static under `prefers-reduced-motion`, and removed if WebGL is missing.

## Build

```bash
npm install
npm run build   # regenerates ../public/index.html
```

The backend serves exactly two files from `../public` — `index.html` at
`/` and `connect.html` at `/connect` — both read into memory at startup,
so the build inlines the entire app (JS + CSS + Three.js) into a single
`index.html` via `vite-plugin-singlefile`, with `emptyOutDir: false` so
`connect.html` is never touched. Restart the `proofpay` service after a
build for the new page to be served. AG Grid still loads from the jsdelivr
CDN at runtime (sponsor requirement), as do Inter font files.

## Layout

- `src/App.svelte` — shell (dark sidebar, hero, stats, forms, sections)
- `src/components/` — Stepper, VerdictPanel, MilestoneCard, ContractCard,
  LedgerGrid (AG Grid), HeroScene (Three.js)
- `src/lib/` — API client, formatting/ledger helpers, shared types
  (mirrors `../src/types.ts`; keep them in sync)
