# @adjudicate/conformance

## 1.0.0

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

- 36e7e76: # v0.6 — adapter-core extraction + OpenAI + Tier 2 analyzer

  Second-phase architectural advancement pass. The kernel API stays frozen; the provider integration surface, the analyzer, and the Pack ecosystem primitives all gained substance.

  ## `@adjudicate/adapter-core` (new) — ADR-113

  Extracted the provider-neutral orchestration into its own package. Contains the tool-use loop, the bridge (`classifyIncomingToolUse` + `buildEnvelopeFromToolUse`), the Decision translator, persistence shims (`createInMemoryDeferStore`, `createInMemoryConfirmationStore`), and the error taxonomy (`AdapterError`, `AdapterErrorCode`).

  Provider adapters now implement a `ProviderBridge<H>` against their SDK and re-export `createAdjudicatedAgent` from adapter-core. Adding a third provider is a < 200-line PR.

  History `H` is opaque to the loop — the bridge is the only thing in the codebase that knows the SDK-specific conversation-history shape. Every invariant the v0.5 loop preserved (replay determinism, fail-closed semantics, REWRITE executes the rewritten envelope, DEFER hash-verification, REQUEST_CONFIRMATION blob tamper detection) flows through unchanged.

  ## `@adjudicate/openai` (new)

  Reference OpenAI Chat Completions integration. Thin SDK shim over adapter-core. Accepts any object satisfying `OpenAIChatLikeClient` — the official `openai` SDK satisfies it structurally, mocks satisfy it, Azure OpenAI wrappers satisfy it. No hard `openai` dependency.

  Cross-provider parity verified by `tests/integration-pix.test.ts` — the same canned PIX-Pack conversation reaches the same six Decision kinds with the same audit-record counts and no `withBasisAudit` drift events.

  ## `@adjudicate/anthropic` — breaking surface change
  - The package is now a thin shim over adapter-core. The public API (`createAdjudicatedAgent`, `createAnthropicPromptRenderer`, persistence shims, error taxonomy) is preserved by re-exports from adapter-core.
  - `AgentEvent.tool_result.payload` is now the provider-neutral `ToolResultBlock` shape (`{ toolUseId, content, isError? }`) instead of the Anthropic-specific `ToolResultBlockParam` (`{ type: "tool_result", tool_use_id, content, is_error? }`). The loop maps to the SDK shape only at the bridge boundary.
  - `AnthropicAdapterError` / `AnthropicAdapterErrorCode` are kept as deprecated aliases for `AdapterError` / `AdapterErrorCode`; both will be removed in v2.0.

  ## `@adjudicate/analyze` — Tier 2 AST analyzer

  New `AJD-201 RewriteScopeAstAnalyzer` walks the actual source AST to verify a REWRITE guard's declared `mutatesPayloadFields` matches what the rewritten envelope's payload literal touches. Catches:
  - **Undeclared mutations** (error): a field is assigned in the rewrite but not declared.
  - **Stale declarations** (warning): a declared field is never touched by any rewrite.
  - **Unsafe spreads** (note): `{ ...payload }` without explicit overrides — static scope analysis cannot reason; surface to the operator.

  Diagnostics carry `sourceLocation: { file, line, column }` so editors and GitHub Code Scanning can deep-link. Opt-in via `analyzePolicy({ sourceFiles })`.

  ## `@adjudicate/conformance` — `validatePackManifest` primitive

  Standalone validator for the `package.json` `adjudicate` field per `docs/pack-ecosystem/registry-foundations.md`. Returns either `{ ok: true, manifest }` with a typed view, or `{ ok: false, errors }` with operator-readable violations. Consumed by the CLI, the future registry indexer, and adopter install hooks.

  `crossCheckPackVsManifest` cross-checks the live Pack against its declared manifest — catches drift between what the manifest claims (`intents`, `signals`) and what the Pack actually declares.

  ## `@adjudicate/core`
  - `KERNEL_REFUSAL_CODES` now includes `guard_panic`. The conformance harness's `KERNEL_INTERNAL_REFUSAL_CODES` overlay is removed; one less place for refusal-code drift to hide.
  - `assertPackConformance` vs `runConformance` split documented prominently in the module header — the boot-time / runtime / CI split is no longer ill-documented.
  - `explainRecord` gained `mergeExplanationRegistries(...)` for Pack-authors composing locale registries.
  - `DecisionExplanation` gained `supersession` field — when an AuditRecord v3+ carries `supersedes`, the explanation renders it as a single-sentence narration. Default templates cover `confirmation_resolved`, `defer_resumed`, `rewrite_executed`, `replay`.

  ## Numbers
  - 928 tests passing (up from 876), 1 skipped, 0 failing.
  - 52 net new tests: 24 adapter-core, 12 openai, 10 analyze (Tier 2), 10 core (explain extensions), 20 conformance (manifest), minus 24 anthropic tests that moved into adapter-core.
  - 1 new ADR (ADR-113).
  - 1 new package (`@adjudicate/adapter-core`).
  - 1 new provider adapter (`@adjudicate/openai`).

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
