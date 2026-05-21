# @adjudicate/cli

## 0.1.0

### Minor Changes

- d8c11b7: Phase 6.2 — `adjudicate simulate` command + state rehydration convention.

  ## `@adjudicate/cli` — new `simulate` subcommand

  Run a single envelope against a Pack's policy and render the resulting Decision + per-guard evaluation trace.

  ```sh
  adjudicate simulate --pack @adjudicate/pack-payments-pix --scenario refund-medium.json
  adjudicate simulate --pack ./packs/my-pack/src/index.ts --intent intent.json --state state.json --format json
  ```

  - `--pack <module>` accepts any Node import specifier: npm package name (workspace symlinks work) or relative/absolute path (converted to `file://`).
  - `--scenario <file>` reads a bundled JSON with `intent` + `state` + optional `expected`.
  - `--intent <file> --state <file>` reads them separately — useful when many fixtures share state.
  - `--format text|json` selects output. Text is a minimal line-oriented placeholder; the full ANSI-boxed renderer lands in Phase 6.3.
  - When the scenario carries `expected.kind` and the decision doesn't match, exit code is 2. Otherwise exit 0.

  Scenario schema is Zod-validated; malformed JSON or unknown enum values produce a structured `ScenarioParseError` with a bullet list of issues + the source path.

  New programmatic exports from `@adjudicate/cli`:
  - `runSimulate`, `SimulateOptions`
  - `loadScenario`, `loadIntentAndState`, `ScenarioParseError`, `Scenario`, `IntentInput`
  - `loadPackFromModule`, `findPackExport`, `isLikelyPack` (shared with `pack lint`)
  - `renderSimulation`, `SimulationOutput`, `SimulationFormat`

  Internal refactor: the Pack-discovery helpers (`findPackExport`, `isLikelyPack`) moved from `pack-lint.ts` into a new `lib/pack-loader.ts` so `simulate` and `lint` share one definition of "what counts as a Pack export."

  New dependency: `zod ^4.3.6` for scenario validation.

  ## `@adjudicate/core` — `PackV0.rehydrateState`

  PackV0 gains an optional `rehydrateState?: (raw: unknown) => State`. Tools that source state from JSON (CLI `simulate`, future Console scenario builder, future audit-replay payload restoration) call this to convert from a serializable representation (typically `JSON.parse` output) back into the runtime state shape — needed when state contains `Map`/`Set`/`Date`/etc. that don't survive `JSON.stringify` round-tripping.

  Optional and backward-compatible — Packs with state that's already plain JSON (records, arrays, primitives) omit it.

  ## `@adjudicate/pack-payments-pix` — `rehydratePixState`

  Exports a new `rehydratePixState(raw)` function (also wired as `paymentsPixPack.rehydrateState`) that converts `{ charges: { [id]: PixCharge } }` from JSON into `PixState` with the runtime `Map<string, PixCharge>`. Idempotent on already-rehydrated input.

  ## `@adjudicate/pack-identity-kyc` — `rehydrateKycState`

  Exports a new `rehydrateKycState(raw)` function (wired as `IdentityKycPack.rehydrateState`) that converts `{ sessions: { [id]: KycSession } }` into the runtime `Map<string, KycSession>` shape.

  ## Verification
  - 8 new `simulate` integration tests cover all six PIX outcomes (EXECUTE, REQUEST_CONFIRMATION, ESCALATE, DEFER, REWRITE) plus KYC DEFER and the system-only-kind taint refusal.
  - 10 new scenario-schema tests cover valid input, structured Zod errors, missing fields, extra keys, and malformed JSON.
  - All existing tests remain green: core 253/253, PIX 28/28, KYC 14/14, primitives 13/13.

- d8c11b7: Phase 6.4 — `adjudicate simulate --scenarios <dir>` diff mode.

  Walk a directory of `*.json` scenario fixtures, run each against the supplied Pack, and render a summary table comparing each `decision.kind` to the scenario's `expected.kind`.

  ```sh
  adjudicate simulate --pack @adjudicate/pack-payments-pix --scenarios ./scenarios
  adjudicate simulate --pack ./packs/my-pack/src/index.ts --scenarios ./scenarios --format json
  ```

  Sample text output:

  ```
  pack: pack-payments-pix

  ✓ 01-execute            EXECUTE               (expected EXECUTE)
  ✗ 02-escalate           ESCALATE              (expected REFUSE)
  ○ 03-advisory           REQUEST_CONFIRMATION  (no expected)
  ! 04-broken             ERROR                 Failed to parse JSON ...

  1 matched · 1 changed · 1 advisory · 1 error
  ```

  ## Per-scenario outcomes

  | Marker       | Status     | Meaning                                                   |
  | ------------ | ---------- | --------------------------------------------------------- |
  | `✓` (green)  | `match`    | `decision.kind === expected.kind`                         |
  | `✗` (red)    | `mismatch` | `decision.kind !== expected.kind`                         |
  | `○` (dim)    | `advisory` | Scenario has no `expected`; reported for visibility       |
  | `!` (yellow) | `error`    | Scenario failed to load (malformed JSON, schema error, …) |

  ## Exit code policy

  | Exit | When                                                                                                 |
  | ---- | ---------------------------------------------------------------------------------------------------- |
  | 0    | No mismatches, no errors                                                                             |
  | 2    | One or more mismatches (mismatch wins over errors — policy regression is the more actionable signal) |
  | 1    | One or more errors and zero mismatches                                                               |

  Mirrors the single-scenario mode's `exit 2 on expected mismatch` contract.

  ## File discovery
  - Top-level `*.json` files only (no recursion).
  - Hidden files (`.foo.json`) and non-JSON entries skipped silently.
  - Sorted alphabetically by basename for stable output across runs.

  ## JSON format

  ```json
  {
    "pack": { "id": "pack-payments-pix" },
    "summary": {
      "total": 4,
      "matched": 1,
      "changed": 1,
      "advisory": 1,
      "errors": 1
    },
    "results": [
      {
        "scenario": "01-execute",
        "status": "match",
        "decision": "EXECUTE",
        "expected": "EXECUTE"
      },
      {
        "scenario": "02-escalate",
        "status": "mismatch",
        "decision": "ESCALATE",
        "expected": "REFUSE"
      },
      {
        "scenario": "03-advisory",
        "status": "advisory",
        "decision": "REQUEST_CONFIRMATION"
      },
      { "scenario": "04-broken", "status": "error", "error": "..." }
    ]
  }
  ```

  Stable shape; safe to pipe into other tools or check into a snapshot file.

  ## Mode selection (mutually exclusive)

  The `simulate` command now accepts exactly one of three input modes:
  - `--scenarios <dir>` — diff mode (new in 6.4)
  - `--scenario <file>` — single bundled (6.2)
  - `--intent <file> --state <file>` — single from pair (6.2)

  Passing more than one (or none) produces a clear error and exits 1.

  ## New programmatic exports from `@adjudicate/cli`
  - `listScenarios(dir)` — directory walker (sorted, filtered, non-recursive)
  - `runDiff(pack, scenarioPaths)` — orchestration; returns `DiffReport`
  - `renderDiffText(report, pack)`, `renderDiffJson(report, pack)` — renderers
  - `computeExitCode(summary)` — exit-code policy in a single place
  - Types: `DiffReport`, `DiffSummary`, `ScenarioResult`, `ScenarioStatus`

  ## Verification

  10 new tests cover: walker correctness (sort/skip-hidden/skip-non-json/empty-dir), `runDiff` outcome classification (match/mismatch/advisory/error), exit-code policy (every combination), and end-to-end command integration (text + JSON output, exit-on-mismatch, mode-selection validation).

  All prior CLI tests pass (38 → 48). Core 253/253, PIX 28/28, KYC 14/14, primitives 13/13 unchanged.

- d8c11b7: Phase 6.3 — ANSI-boxed `simulate` text renderer + `nameGuard` helper.

  ## `@adjudicate/cli` — rounded-box text renderer

  The `simulate` command's default text output is now a fixed-width rounded-box layout with four sections: decision header, intent metadata, per-guard trace, and decision-specific detail (refusal / escalation / prompt / defer / rewrite).

  Sample:

  ```
  ╭─ DECISION: REQUEST_CONFIRMATION ─────────────────────────────────────────────╮
  │ Pack       pack-payments-pix                                                 │
  │ Kind       pix.charge.refund                                                 │
  │ Actor      llm/sess-1                                                        │
  │ Taint      UNTRUSTED                                                         │
  │ Nonce      n-1                                                               │
  │ Hash       460891c47222...                                                   │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Trace                                                                        │
  │   kill                                                                pass   │
  │   schema                                                              pass   │
  │   state[0]     escalateFailedConfirm                                  pass   │
  │   ...                                                                        │
  │   business[3]  requestConfirmForMediumRefund                          MATCH  │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Basis                                                                        │
  │   schema     / version_supported                                             │
  │   ...                                                                        │
  │   business   / rule_satisfied                                                │
  │                rule:      confirm_threshold_reached                          │
  │                threshold: 50000                                              │
  │                requested: 60000                                              │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Prompt                                                                       │
  │   You're about to refund R$ 600.00. Confirm?                                 │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

  - Width: terminal-adaptive, clamped to `[70, 120]`. Override via `RenderOptions.width` programmatically.
  - Color: chalk-styled, auto-disabled under `NO_COLOR=1` or non-TTY stdout.
  - Visual-width math is ANSI-escape-aware, so styled spans align correctly.
  - Long values (refusal `userFacing`, escalate `reason`, rewrite reason) word-wrap to the inner column.
  - `expected.kind` mismatch surfaces inline as `MISMATCH (got X)` in yellow.
  - Decision-specific detail blocks: `Refusal` (kind/code/user-facing/detail), `Escalation` (to/reason), `Prompt` (REQUEST_CONFIRMATION), `Defer` (signal/timeoutMs), `Rewrite` (reason/new kind/new hash). EXECUTE has no detail block — basis alone tells the story.

  `render(output, format, options?)` signature is unchanged on call sites; the new `options.width` is optional.

  ## `@adjudicate/core` — `nameGuard(name, guard)` helper

  Exported from `@adjudicate/core/kernel`. Attaches a stable `Function.name` to factory-built guards so they appear in `AdjudicationTraceEntry.guardName`:

  ```ts
  import { nameGuard } from "@adjudicate/core/kernel";
  import { createThresholdGuard } from "@adjudicate/primitives";

  const escalateLargeRefunds = nameGuard(
    "escalateLargeRefunds",
    createThresholdGuard({ ... }),
  );
  ```

  Guards declared as named consts (`const validateAmount: Guard = ...`) already get useful names via TS's variable-name inference — `nameGuard` is only needed when the guard comes back as an anonymous closure from a factory.

  Implementation: `Object.defineProperty(guard, "name", { value, configurable: true, writable: false })`. Idempotent (re-naming is allowed via `defineProperty`); preserves the guard's type identity (pass-through return).

  ## `@adjudicate/pack-payments-pix` — apply `nameGuard` to factory-built guards

  `escalateLargeRefunds`, `requestConfirmForMediumRefund`, `deferChargeCreate` now carry their names in trace output. Inline-arrow guards (`validateChargeAmount`, `clampRefundToOriginal`, `escalateFailedConfirm`, etc.) were already named via TS inference; no change there.

  ## `@adjudicate/pack-identity-kyc` — apply `nameGuard` to factory-built guards

  `requireDocumentUpload`, `waitForVerification`, `refuseLowScore`, `executeOnHighScore` now carry their names in trace output.

  ## Verification
  - 15 new renderer tests cover box framing, width clamping, section ordering, all six decision detail blocks, trace name/index formatting, expected/mismatch indicators, and JSON-format parseability.
  - All existing tests remain green: core 253/253, primitives 13/13, PIX 28/28, KYC 14/14, CLI scenario+simulate 18/18.
  - Manual smoke-test against PIX for all six outcomes confirms readable terminal output with correct alignment, colors, and decision-specific details.

### Patch Changes

- d8c11b7: Phase 6.6 — Documentation for `adjudicate simulate` and the scenarios convention.

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

- d8c11b7: Phase 6.5 — Sample scenarios for PIX + KYC, scenario-conformance tests, and `pack init` template extension.

  ## `@adjudicate/pack-payments-pix` — `scenarios/` directory

  Six declarative JSON scenarios covering every Decision outcome:

  | File                                  | Outcome              | Tests                                              |
  | ------------------------------------- | -------------------- | -------------------------------------------------- |
  | `01-refund-execute.json`              | EXECUTE              | small refund (1000 centavos) on confirmed charge   |
  | `02-refund-request-confirmation.json` | REQUEST_CONFIRMATION | medium refund (60000) crosses confirm threshold    |
  | `03-refund-escalate.json`             | ESCALATE             | large refund (150000) crosses supervisor threshold |
  | `04-refund-rewrite-overshoot.json`    | REWRITE              | refund > charge amount is clamped down             |
  | `05-charge-create-defer.json`         | DEFER                | charge.create parks awaiting webhook               |
  | `06-refund-refuse-not-found.json`     | REFUSE               | refund against nonexistent charge                  |

  `tests/scenarios.test.ts` programmatically asserts every scenario produces its `expected.kind` — runs in CI alongside the existing `pnpm test`. No CLI dep needed; the test uses `@adjudicate/core` + the Pack's exported `rehydratePixState`.

  New `test:scenarios` script + `@adjudicate/cli` devDep enables manual verification: `pnpm build && pnpm --filter @adjudicate/pack-payments-pix test:scenarios` renders the diff summary with color-coded results.

  ## `@adjudicate/pack-identity-kyc` — `scenarios/` directory

  Six scenarios covering the async lifecycle + AML branch + system-only-kind taint defense:

  | File                                | Outcome  | Tests                                   |
  | ----------------------------------- | -------- | --------------------------------------- |
  | `01-kyc-start-defer.json`           | DEFER    | `kyc.start` always defers for documents |
  | `02-kyc-upload-defer.json`          | DEFER    | `kyc.document.upload` defers for vendor |
  | `03-vendor-execute-high-score.json` | EXECUTE  | callback CLEAR + score ≥ 90             |
  | `04-vendor-refuse-low-score.json`   | REFUSE   | callback CLEAR + score < 50             |
  | `05-vendor-escalate-aml-flag.json`  | ESCALATE | callback FLAGGED                        |
  | `06-vendor-taint-refuse.json`       | REFUSE   | UNTRUSTED actor on system-only kind     |

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

  Each Pack now has _both_:
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

- Updated dependencies [d8c11b7]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [92858a0]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/core@1.0.0
