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
      // Plan 1 / Theorem E (E-1), enforcement layer (c): ban `x as RenderedReply`
      // (and `x as any as RenderedReply` — the outermost `as` is still
      // RenderedReply). A cast is the only compile-time way to forge the opaque
      // branded carrier; banning it forces every customer-facing string through a
      // @adjudicate/core minter, and the runtime WeakSet gate in `unwrapRendered`
      // catches anything that slips past. The minter module itself
      // (`rendered-reply.ts`) is exempted in a dedicated block below — it is the
      // sole legitimate constructor.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression[typeAnnotation.typeName.name='RenderedReply']",
          message:
            "Forging a RenderedReply via `as` is banned (Theorem E, sole-emitter). Produce customer-facing text with a @adjudicate/core minter (mintRenderedReply / mint{Cron,Receipt,Otp,Broadcast,Fallback}Reply / wrapLegacyResponderText) and unwrap it at the egress sink with unwrapRendered.",
        },
        // Plan 1 / inv.17, enforcement layer (c): ban `x as CanonicalClaim` (and
        // the nested `x as any as CanonicalClaim` — the outermost `as` is still
        // CanonicalClaim). A cast is the only compile-time way to forge the opaque
        // renderer-input carrier; banning it forces every renderable proposition
        // through the kernel mint (runClaimsKernel), and the runtime WeakSet gate in
        // `unwrapCanonical` catches anything that slips past. The mint module itself
        // (`claim-definition`'s sibling `canonical-claim.ts`) is exempted below.
        {
          selector:
            "TSAsExpression[typeAnnotation.typeName.name='CanonicalClaim']",
          message:
            "Forging a CanonicalClaim via `as` is banned (inv.17, kernel-minted renderer input). A canonical claim is minted ONLY by runClaimsKernel on the VALIDATED+consistent renderable set, and read at the renderer boundary with unwrapCanonical.",
        },
      ],
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

  // Plan 1 / Theorem E (E-1): the RenderedReply minter module is the SOLE
  // legitimate constructor of the opaque carrier — it necessarily uses an
  // internal `as unknown as RenderedReply` to brand the frozen object. Exempt it
  // from the `as RenderedReply` ban (enforcement layer (c)); no other module may
  // cast. This block follows the rules block so it overrides for this file only.
  //
  // F5: the exemption is pinned to the CANONICAL path of the genuine minter
  // (`packages/core/src/rendered-reply.ts`), not the basename `**/rendered-reply.ts`.
  // This shared config is consumed downstream (@claustrum/*, @ibatexas/*); a
  // basename glob would silently exempt ANY same-named file in a consumer repo,
  // re-opening the forge vector the ban exists to close.
  {
    files: ["packages/core/src/rendered-reply.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  // Plan 1 / inv.17: the CanonicalClaim mint module is the SOLE legitimate
  // constructor of the opaque renderer-input carrier — it necessarily uses an
  // internal `as unknown as CanonicalClaim` to brand the frozen object. Exempt it
  // from the `as CanonicalClaim` ban (enforcement layer (c)); no other module may
  // cast. Pinned to the CANONICAL path (not a basename glob) so this shared config,
  // consumed downstream (@claustrum/*, @ibatexas/*), cannot silently exempt a
  // same-named file in a consumer repo and re-open the forge vector.
  {
    files: ["packages/core/src/claims/canonical-claim.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
);
