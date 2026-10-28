import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

// The backend (src/routes.ts) serves exactly two files from ../public:
// index.html at "/" and connect.html at "/connect", both read into memory
// at startup. So the whole Svelte app (JS + CSS + Three.js) is inlined
// into a single index.html, and emptyOutDir stays false so connect.html
// survives every build untouched.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    outDir: "../public",
    emptyOutDir: false,
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
