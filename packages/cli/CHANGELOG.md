# @adjudicate/cli

## 0.3.1

### Patch Changes

- Updated dependencies [b94372b]
  - @adjudicate/analyze@0.4.0

## 0.3.0

### Minor Changes

- 60daeef: feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

  feat(cli): add `adjudicate pack bom <path>`.

  feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.

- b642424: feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

  feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

  feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.

### Patch Changes

- Updated dependencies [60daeef]
- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
  - @adjudicate/conformance@2.0.0
  - @adjudicate/core@1.3.0
  - @adjudicate/red-team@0.2.0
  - @adjudicate/analyze@0.3.0

## 0.2.0

### Minor Changes

- e9fc3ad: # v0.5 — Foundation hardening, L2 expansion, analyzer, observability, console UX, 7 new CLI commands

  5 milestones (M1 → UX cut), 876 tests passing (was 748; +128), zero regressions. Status and remaining work tracked in `PROJECT_STATUS_AND_NEXT_STEPS.md`.

  ## Kernel hardening (M1)

  **Guard exception isolation (ADR-106).** `_adjudicateImpl` now wraps every guard invocation in `try/catch`. A throwing guard becomes a `SECURITY` REFUSE with `kernel.GUARD_PANIC` basis — never propagates to the adopter. New `BASIS_CODES.kernel` category. 9 property tests.

  **Resume-hash verification.** `verifyParkedEnvelopeHash` re-derives `intentHash` via `sha256Canonical` and asserts byte-equality on resume. `verifyHash: "strict" | "warn" | "off"` option on `resumeDeferredIntent` and the Anthropic adapter (default `"warn"`). The adapter now parks full envelope fields at DEFER time. Tampered park blobs are detected and fail-closed.

  **Portuguese externalization (ADR-107).** Kernel inline pt-BR strings replaced with English defaults. New `RefusalMessages` interface + `localizeDecision(decision, messages)` helper exported from `@adjudicate/core`. New `@adjudicate/locales-pt-BR` package supplies opt-in pt-BR strings.

  ## L2 primitives expansion (M2 / ADR-108)

  Four new factories in `@adjudicate/primitives`:
  - `createRewriteGuard` — REWRITE factory with `mutatesPayloadFields` metadata
  - `createConfirmGuard` — REQUEST_CONFIRMATION via threshold + prompt
  - `createEscalateGuard` — ESCALATE via threshold + route + reason
  - `createIdempotencyGuard` — domain-level idempotency check

  All carry `GuardMetadata` per ADR-105. Existing Pack guards are unchanged.

  ## Static analyzer (M2 / ADR-109)

  New `@adjudicate/analyze` package shipping Tier 1 metadata-driven analyzers:
  - AJD-101 MissingMetadataAnalyzer
  - AJD-102 SignalConsistencyAnalyzer (caught a real bug — PIX missing `Pack.signals`)
  - AJD-103 BasisCodeConsistencyAnalyzer
  - AJD-104 RewriteScopeAnalyzer
  - AJD-105 TaintPolicyAnalyzer
  - AJD-106 DefaultPolarityAnalyzer

  text / JSON / SARIF 2.1.0 output. CLI: `adjudicate analyze --pack <m> [--format] [--strict]`.

  PIX + deployments Packs now declare `Pack.signals` per AJD-102.

  ## AuditRecord v4 (M3 / ADR-111)

  Additive fields:
  - `policyVersion` — Pack.version at adjudication time
  - `kernelVersion` — `@adjudicate/core` package version
  - `auditHash` — `sha256` over `canonical(record \ {auditHash, signature})`
  - `signature` — pluggable KMS signature seam (v0.6+)

  `verifyAuditRecord(record)` exported for tamper detection. `AUDIT_RECORD_VERSION = 4`. v3 readers tolerate v4 (additive only). New `audit-postgres` migration `008-add-v4-fields.sql` adds 4 nullable columns + 2 indexes. admin-sdk Zod schema accepts v4.

  ## Shipped packages
  - `@adjudicate/conformance` (ADR-110) — `runConformance(pack)` ships 6 invariant checks (AC-001..AC-006) adopters call from CI. Deterministic via seeded LCG.
  - `@adjudicate/observability` (ADR-112) — OTLP-shaped `MetricsSink`, `LearningSink`, `AuditSpanExporter` + stable `SEMCONV` constants. Pluggable `Exporter` interface.
  - `@adjudicate/migrate` (ADR-112) — ts-morph codemod runner + first codemod (`nameGuard` → `withMetadata`).
  - `@adjudicate/locales-pt-BR` (ADR-107) — Brazilian Portuguese refusal-message mapping.

  ## Console UX (T-080..T-086)
  - **Live tail** (2s polling fallback; WebSocket bridge post-v0.6) via `<LiveTailToggle>` in TopBar
  - **WhyNotPanel** on decision detail page — explains which other Decisions were NOT reached and why
  - **Lineage explorer** at `/decisions/[hash]/lineage` — supersession chain as depth-limited tree
  - **DriftPanel** on Dashboard — counts `guard_panic` / `rewrite_taint_regression` / `defer_signal_drift` / `basis_code_drift`
  - **SLOPanel** on Dashboard — p50/p95/p99 per intent kind with utilization vs SLO budget
  - **ReplayDialog** extended for single-field payload edit + side-by-side decision diff
  - **FailureBanners** (Postgres lag, DLQ, drift) at the top of every page

  ## CLI commands (T-091, T-108..T-113)

  Seven new commands (5 + 7 = 12 total):
  - `adjudicate reap` — Idle-DeferStore Redis scanner
  - `adjudicate visualize` — Standalone HTML force-graph of a Pack's PolicyBundle (SVG-only)
  - `adjudicate repl` — Interactive intent → decision shell
  - `adjudicate replay` — Re-adjudicate stored AuditRecords + mismatch classification
  - `adjudicate export` — Audit records to JSON / CSV (Parquet deferred to v0.6)
  - `adjudicate scenarios generate` — Seeded LCG-based scenario fixture generation
  - `adjudicate dev` — Docker Compose harness (Redis + Postgres) for local dev

  ## Pack templates (T-034..T-036)

  `adjudicate pack init <name> --template <basic|payment|approval|kyc|deployment>` — 4 new domain-specific scaffolds covering payment / approval / kyc / deployment shapes. Each ships realistic guards using L2 primitives, taint policy, scenarios, and a conformance test.

  ## ADRs (7 new — ADR-106 through ADR-112)
  - ADR-106 — Guard exception isolation
  - ADR-107 — RefusalMessages externalization
  - ADR-108 — Primitives expansion
  - ADR-109 — Analyzer architecture + diagnostic catalog
  - ADR-110 — Conformance package
  - ADR-111 — AuditRecord v4 additive fields + verifyAuditRecord
  - ADR-112 — Observability + migrate packages

  ## Documentation (~7,000 lines, 19 new files)
  - `docs/perf/v0.2-baseline.md` — p50/p99 microbenchmarks (>200× SLO headroom on all paths)
  - `docs/release/{semver,api-surface,deprecations}.md`
  - `docs/pack-ecosystem/{quality-scoring,registry-foundations,signing-design}.md`
  - `docs/architecture/hosted/{control-data-plane,rbac-and-tenant-isolation,deployment-topology}.md`
  - `docs/security/{threat-model,security-review-checklist}.md`
  - `docs/compliance/{soc2-mapping,shared-responsibility}.md`
  - `PROJECT_STATUS_AND_NEXT_STEPS.md` — status snapshot + remaining work

  ## CI workflows (deliverable; not yet exercised)
  - `.github/workflows/ci.yml` — lint + typecheck + test
  - `.github/workflows/release.yml` — CycloneDX SBOM + Sigstore signing + npm provenance (workflow_dispatch)
  - `.github/workflows/security-codescan.yml` — pnpm audit on dep changes

  ## Non-negotiable invariants preserved
  - Kernel determinism: no `Date.now()`, no `Math.random()` in adjudication paths
  - LLM has zero mutation authority: every envelope still crosses `adjudicateAndAudit`
  - Decision algebra closed at 6 variants
  - Wire format frozen: IntentEnvelope v2, canonical-JSON hash, Decision shape unchanged
  - AuditRecord v4 is additive-only over v3
  - Fail-closed default preserved (REWRITE scope check telemetry-first; enforcement opt-in)
  - ADR-105 closed-vocabulary discipline applied to `BASIS_CODES.kernel`, `AJD-*`, `AC-*`, `SEMCONV.*`

- 36e7e76: v0.7 — operational hardening + ecosystem trust. All additive; no kernel breaking changes.

  **Distributed kill switch v2.** `startDistributedKillSwitchPubSub` in `@adjudicate/audit` adds Redis pub/sub propagation on top of the existing polling helper. Sub-100 ms transitions when the subscriber is connected; polling retained as fallback for disconnects, restarts, and broker outages. See ADR-114.

  **Real-time audit event substrate.** `createInMemoryAuditEventBus`, `createRedisAuditEventBus`, and `bridgeAuditSinkToBus` in `@adjudicate/audit`. Operator consoles and live-tail views fan out without touching the durable sink contract.

  **Restart-durable confirmations.** `createRedisConfirmationStore` in `@adjudicate/adapter-core/persistence-redis`. REQUEST_CONFIRMATION tokens survive process restarts and rolling deploys.

  **Pack trust primitives.** `computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`, `verifyPackTrust` in `@adjudicate/conformance`. Pure functions, ed25519 + RSA-PSS, no hosted dependencies. See ADR-115.

  **`adjudicate pack verify` CLI.** Install-time + CI-gate wrapper around `verifyPackTrust`. Modes: `none | best_effort | require_fingerprint | require_signature`.

  **`replayWithIntegrity` + `explainReplayReport`.** `@adjudicate/audit` gains a verifier that runs decision-axis check AND envelope `intentHash` + AuditRecord `auditHash` tamper detection in one pass. `explainReplayReport` produces operator-readable narration in three formats (`ci-line | summary | operator`).

  **Cross-runtime golden vectors.** `docs/specs/canonical-hash-vectors.json` is the language-neutral consumer of the canonical-JSON SHA-256 spec. `packages/core/tests/cross-runtime-hash-vectors.test.ts` reads it and asserts the Node implementation matches; non-Node runtimes can do the same.

  **Adapter loop `TraceSink`.** `@adjudicate/adapter-core` exposes a low-cardinality lifecycle hook (`iteration_start | decision_emitted | paused | completed | max_iterations_exceeded`). Defaults to no-op; opt in via `traceSink:` on `createAdjudicatedAgent`.

  **Extended SEMCONV.** Eight new low-cardinality `adjudicate.*` attributes in `@adjudicate/observability` for adapter / provider / pause / kill-switch lifecycle. All additive; no renames.

  **Chaos test suites.** `packages/audit/tests/chaos-kill-switch.test.ts` and `chaos-replay.test.ts` exercise burst-of-malformed messages, disconnect/reconnect recovery, trip/clear storm convergence, multi-replica race (no split-brain), subscribe leak detection, and 100+ corrupted replay envelopes.

  **Test totals.** 1022 passing (was 924), 1 skipped (audit-postgres needs a live DB), 0 failing.

  See `docs/architecture/V0.7-AUDIT-REPORT.md` for the full v1.0 readiness review.

### Patch Changes

- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/core@1.2.0
  - @adjudicate/analyze@0.2.0
  - @adjudicate/conformance@1.0.0

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
