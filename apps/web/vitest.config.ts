import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Test harness for apps/web.
 *
 * The kernel-runner / transparency tests are pure server-side logic (they run
 * the real kernel), so a node environment suffices — no jsdom needed.
 *
 * The console-kit chart tests are also node-friendly: the SVG kit is
 * measurement-free and deterministic, so they render to a static HTML string
 * with react-dom/server and assert over markup (no DOM mount). For that JSX to
 * compile without a per-file `import React`, esbuild is told to use the
 * automatic JSX runtime (imports `react/jsx-runtime`, already a dependency).
 */
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
