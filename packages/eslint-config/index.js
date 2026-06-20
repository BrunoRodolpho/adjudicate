// @adjudicate/eslint-config — shared flat config for all @adjudicate/* packages.
//
// ESLint v9 flat-config shape. Consumers (root eslint.config.mjs, or any
// per-package config) just `import` and re-export this array.

import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import monotonicCeiling from "./monotonic-ceiling-rule.js";

// 061 · the custom @adjudicate plugin hosting the `monotonic-ceiling` rule
// (index §C / invariant #7). Registered below as `@adjudicate/monotonic-ceiling`.
const adjudicatePlugin = {
  rules: {
    "monotonic-ceiling": monotonicCeiling,
  },
};

export default tseslint.config(
  // Global ignores — apply before any rule blocks so they short-circuit.
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/vitest.config.ts",
      "**/eslint.config.{js,mjs,cjs}",
    ],
  },

  // Base recommended sets — eslint:recommended + typescript-eslint:recommended.
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Project rules — apply to TypeScript only.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      import: importPlugin,
      // 061: the @adjudicate plugin namespace hosting the monotonic-ceiling rule.
      "@adjudicate": adjudicatePlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // H11: a load-bearing `@ts-expect-error` must carry a description (the
      // WHY it is expected to error) and `@ts-ignore`/`@ts-nocheck` are banned
      // outright. This keeps change-control directives self-documenting; their
      // load-bearing-ness (a stale directive ⇒ TS2578) is enforced separately by
      // the per-package test-typecheck (`tsc -p tsconfig.test.json --noEmit`).
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 3,
        },
      ],
      // 061: monotonic-ceiling — forbid weakening a `decision` binding to EXECUTE
      // (friction-decreasing composition; index §C / invariant #7). The one
      // deterministic carve-out (confirmation-receipt) is allowlisted at its
      // call site with an eslint-disable-next-line directive.
      "@adjudicate/monotonic-ceiling": "error",
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
);
