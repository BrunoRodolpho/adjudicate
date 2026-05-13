---
"@adjudicate/cli": patch
---

Phase 6.6 — Documentation for `adjudicate simulate` and the scenarios convention.

## What changed

### `packages/cli/README.md` — rewritten

Adds the `simulate` command section: three input modes (single bundled, intent+state pair, diff directory), Pack resolution semantics, text and JSON output formats, exit-code policy. Documents the scenario JSON format with a worked example, includes a real text-mode render, and the diff summary table with the four marker statuses (`✓ ✗ ○ !`).

Also updates the existing `pack init` description to reflect the new template — scenarios/ directory and `test:scenarios` script are now part of the scaffolded layout.

### `docs/guides/testing-your-policy.md` — new how-to guide

End-to-end walkthrough for Pack authors:
- Why scenarios complement programmatic tests (two surfaces, two audiences).
- Scenario file anatomy (intent + state + optional expected).
- Working example using `@adjudicate/pack-payments-pix/scenarios/`.
- Wiring scenarios into your own Pack: directory layout, `test:scenarios` script, vitest conformance test.
- The `rehydrateState` convention for state shapes that don't round-trip JSON.
- CI integration example.
- Three common authoring patterns (regression capture, threshold pinning, attack-defense documentation).
- Common gotchas (closed-enum fields, hash determinism, etc.).

### Top-level `README.md` — packages + docs updates

- Packages table extended with `@adjudicate/primitives`, `@adjudicate/admin-sdk`, `@adjudicate/cli`, `@adjudicate/pack-identity-kyc` — previously missing despite shipping.
- Maturity ladder L2 status updated from `emerging` to `shipped` (factory primitives `createThresholdGuard`, `createStateDeferGuard`, `createSystemTaintPolicy` extracted in Phase 5). L3 now mentions Pack #3 (`pack-identity-kyc`).
- "Heads-up on rework" paragraph removed (L2 has landed; the callout was stale).
- New entry in the Documentation section linking to the testing guide.

## Why this is a `@adjudicate/cli` patch

The CLI shipped its `simulate` surface across PRs 6.1–6.5 without README coverage. This PR closes that gap and is functionally a documentation-only patch — no code or contract changes. Bundled under the CLI package because the CLI README + simulate guide are the load-bearing additions; the top-README + maturity-ladder edits are factual maintenance on shipped state.

## Verification

- All cross-references resolve (verified via `test -e` on every linked path).
- Concepts §9 anchor still exists (`#9-architectural-direction-intended-evolution`).
- All package tests pass: core 253/253, primitives 13/13, PIX 29/29, KYC 15/15, CLI 48/50 (2 pre-existing pack-init failures unchanged).
- All affected packages lint clean.

## Known-stale forward-pointers (out of scope)

[`packages/anthropic/README.md`](packages/anthropic/README.md) still has an "L2 rework callouts" section that was written before L2 shipped. The forward-ref from the top README to that section was removed in this PR; the anthropic README itself is left for a separate doc pass (would be sensitive to anthropic-adapter API stability, not docs maintenance).
