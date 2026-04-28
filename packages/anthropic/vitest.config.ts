import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
      "@adjudicate/runtime": fileURLToPath(
        new URL("../runtime/src/index.ts", import.meta.url),
      ),
      "@adjudicate/pack-payments-pix": fileURLToPath(
        new URL("../pack-payments-pix/src/index.ts", import.meta.url),
      ),
    },
  },
});
