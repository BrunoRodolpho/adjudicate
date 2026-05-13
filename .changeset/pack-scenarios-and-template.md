---
"@adjudicate/pack-payments-pix": minor
"@adjudicate/pack-identity-kyc": minor
"@adjudicate/cli": patch
---

Phase 6.5 — Sample scenarios for PIX + KYC, scenario-conformance tests, and `pack init` template extension.

## `@adjudicate/pack-payments-pix` — `scenarios/` directory

Six declarative JSON scenarios covering every Decision outcome:

| File | Outcome | Tests |
|---|---|---|
| `01-refund-execute.json` | EXECUTE | small refund (1000 centavos) on confirmed charge |
| `02-refund-request-confirmation.json` | REQUEST_CONFIRMATION | medium refund (60000) crosses confirm threshold |
| `03-refund-escalate.json` | ESCALATE | large refund (150000) crosses supervisor threshold |
| `04-refund-rewrite-overshoot.json` | REWRITE | refund > charge amount is clamped down |
| `05-charge-create-defer.json` | DEFER | charge.create parks awaiting webhook |
| `06-refund-refuse-not-found.json` | REFUSE | refund against nonexistent charge |

`tests/scenarios.test.ts` programmatically asserts every scenario produces its `expected.kind` — runs in CI alongside the existing `pnpm test`. No CLI dep needed; the test uses `@adjudicate/core` + the Pack's exported `rehydratePixState`.

New `test:scenarios` script + `@adjudicate/cli` devDep enables manual verification: `pnpm build && pnpm --filter @adjudicate/pack-payments-pix test:scenarios` renders the diff summary with color-coded results.

## `@adjudicate/pack-identity-kyc` — `scenarios/` directory

Six scenarios covering the async lifecycle + AML branch + system-only-kind taint defense:

| File | Outcome | Tests |
|---|---|---|
| `01-kyc-start-defer.json` | DEFER | `kyc.start` always defers for documents |
| `02-kyc-upload-defer.json` | DEFER | `kyc.document.upload` defers for vendor |
| `03-vendor-execute-high-score.json` | EXECUTE | callback CLEAR + score ≥ 90 |
| `04-vendor-refuse-low-score.json` | REFUSE | callback CLEAR + score < 50 |
| `05-vendor-escalate-aml-flag.json` | ESCALATE | callback FLAGGED |
| `06-vendor-taint-refuse.json` | REFUSE | UNTRUSTED actor on system-only kind |

Same conventions as PIX: `tests/scenarios.test.ts` for CI, `test:scenarios` script for dev convenience.

## `@adjudicate/cli` — pack-init template scenarios

The `adjudicate pack init <name>` template now scaffolds:

- `scenarios/example-execute.json` — minimal sample exercising the default policy.
- `package.json` with `test:scenarios` script wired to `adjudicate simulate --pack ./dist/index.js --scenarios ./scenarios`.
- `@adjudicate/cli` declared as devDep so the script resolves locally.
- `files: ["dist", "scenarios", "README.md"]` so published Packs ship scenarios alongside the built code.

The post-init message in `pack init` now includes the scenario-test hint:
```
Next steps:
  cd <pack-dir>
  pnpm install                                       # picks up the new package
  pnpm test                                          # runs conformance tests
  pnpm build && pnpm test:scenarios                  # runs ./scenarios/*.json against the policy
  adjudicate pack lint                               # validates against the kernel
```

## Why two test mechanisms

Each Pack now has *both*:
1. `tests/scenarios.test.ts` — runs in vitest, no external bin needed, runs on every `pnpm test`.
2. `test:scenarios` script — invokes the CLI, gives the same color-coded summary table adopters see.

The vitest one is the CI gate (auto-runs, no extra wiring). The CLI script is for adopters — when a policy change flips outcomes, they get the readable diff output, not a vitest assertion error.

## Verification

- PIX scenarios: 6/6 produce their expected outcomes
- KYC scenarios: 6/6 produce their expected outcomes
- PIX tests: 29 (28 prior + 1 new scenarios test)
- KYC tests: 15 (14 prior + 1 new scenarios test)
- CLI: 48/50 unchanged (2 pre-existing pack-init template-path failures persist)
- All affected packages lint clean

Manual smoke test confirmed: `pnpm --filter @adjudicate/pack-payments-pix test:scenarios` and the KYC equivalent both render the six-row summary table with `6 matched` and exit 0.
