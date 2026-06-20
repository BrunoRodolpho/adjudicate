---
"@adjudicate/core": patch
"@adjudicate/eslint-config": patch
---

fix(core): u7 — type-check the load-bearing `@ts-expect-error` change-control directives in CI (H11). Test-fidelity only — NO runtime/`src` change; the pure `adjudicate()` path, closed 6-outcome `Decision` algebra, `state→taint→auth→business` guard order, and `intentHash`/`auditHash` recipe are UNTOUCHED.

**H11 (MED) — the 083/084 orthogonality `@ts-expect-error` directives were inert AND stale.** `core/tsconfig.json` has `include: ["src"]` and the package `lint`/`build` only ever compiled `src`, so the load-bearing directives in `core/tests/install.test.ts` (the assertions that `InstallPackOptions` carries NO change-control / canary / rollout key — 083 §publish-segregation, 084 §staged-rollout) were never type-checked by CI. Worse, as written each smuggled key sat in a single object literal that was `as InstallPackOptions`-cast — and an `as` cast defeats excess-property checking, so every one of those `@ts-expect-error` directives was already STALE (would report `TS2578: Unused '@ts-expect-error' directive` the instant it was compiled). The directives suppressed nothing.

FIX (test-fidelity):

- **`core/tsconfig.test.json` (new):** extends `tsconfig.json`, `noEmit: true`, scoped to `src` + the change-control test file (`tests/install.test.ts`) so those directives are actually compiled. Scope is deliberately narrow — NOT the whole `tests/` tree, which contains many intentional negative-typing patterns (deliberately-invalid envelope versions, internal casts) that run fine under vitest but do not strictly type-check and are out of scope here.
- **`core/package.json` `lint`:** now runs `tsc --noEmit && tsc -p tsconfig.test.json --noEmit && eslint "src/**/*.ts"` — the test-typecheck is a hard CI gate.
- **`core/tests/install.test.ts`:** the 083 and 084 load-bearing assertions were restructured from one multi-key `as`-cast literal into per-key, separately-typed `InstallPackOptions` literals (one excess key each, so excess-property checking fires per key and each `@ts-expect-error` is genuinely load-bearing). The runtime defensive-ignore call (`installPack` ignores ambient props) is preserved.
- **`@adjudicate/eslint-config`:** added `@typescript-eslint/ban-ts-comment` (`ts-expect-error: allow-with-description`, `ts-ignore`/`ts-nocheck` banned) so every directive must self-document its WHY; verified non-breaking across the whole monorepo lint (no `@ts-*` directive exists in any `src/`).

Non-vacuity proven: pointing one load-bearing directive at a REAL `InstallPackOptions` key makes the new `tsc -p tsconfig.test.json --noEmit` fail with `TS2578` (exit 2); restoring returns it to green (exit 0). `@adjudicate/admin-sdk` was evaluated but its sole change-control directive (`trpc-router.test.ts`) shares a file with unrelated pre-existing tRPC-internal negative-typing casts, so a test-typecheck there is not straightforward and was left out of scope; it still benefits from the shared `ban-ts-comment` rule.
