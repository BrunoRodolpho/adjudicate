import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Adjudicant observer-app test harness. jsdom + React Testing Library; the
 * `@/*` alias mirrors tsconfig so component imports resolve. Component tests
 * mock their data hooks (no tRPC/network is touched). The route-shape test
 * imports the built `@adjudicate/admin-sdk` to assert the read-only router is
 * mounted (write-isolation), so node deps resolve through the workspace.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
