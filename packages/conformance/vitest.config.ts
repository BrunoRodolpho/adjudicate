import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests reference packages via their npm names so they read the way an
// adopter's tests would. Vitest can't resolve those at runtime against
// source (no dist/ generated yet during a fresh test run), so we alias
// them to source. Most-specific aliases first — order matters.
export default defineConfig({
  resolve: {
    alias: {
      "@adjudicate/core/kernel": fileURLToPath(
        new URL("../core/src/kernel/index.ts", import.meta.url),
      ),
      "@adjudicate/core/llm": fileURLToPath(
        new URL("../core/src/llm/index.ts", import.meta.url),
      ),
      "@adjudicate/core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
    },
  },
});
