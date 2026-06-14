import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Adjutant operator-app component-test harness. jsdom + React Testing Library;
 * the `@/*` alias mirrors tsconfig so component imports resolve. Tests mock
 * their data hooks, so no tRPC/network is touched.
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
