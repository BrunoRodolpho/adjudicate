# @adjudicate/adapter-core

## 0.2.0

### Minor Changes

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

- Updated dependencies [9e65871]
- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/audit@2.0.0
  - @adjudicate/core@1.2.0
  - @adjudicate/runtime@0.2.0
