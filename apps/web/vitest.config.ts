import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Playground test harness. The kernel-runner is pure server-side logic (it runs
 * the real kernel), so a node environment suffices — no jsdom/React needed. This
 * is apps/web's first automated coverage; it pins the live playground behaviour
 * (e.g. the PII demo's redaction patterns) rather than relying on manual checks.
 */
export default defineConfig({
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
