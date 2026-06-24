# @adjudicate/openai

## 0.3.3

### Patch Changes

- Updated dependencies [58cad7a]
- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [a9be0ad]
- Updated dependencies [e8698b1]
- Updated dependencies [6121a7a]
- Updated dependencies [c0d1b93]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [cb8d608]
- Updated dependencies [41a295e]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [f7fa8d5]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
  - @adjudicate/audit@4.0.0
  - @adjudicate/core@1.5.0
  - @adjudicate/runtime@0.3.0
  - @adjudicate/adapter-core@0.4.0

## 0.3.2

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/adapter-core@0.3.2
  - @adjudicate/audit@3.0.0
  - @adjudicate/runtime@0.2.2

## 0.3.1

### Patch Changes

- @adjudicate/audit@3.0.0
- @adjudicate/adapter-core@0.3.1

## 0.3.0

### Minor Changes

- fdc0344: Adversarial-audit remediation (464db38→804af8f review):
  - **audit-postgres (release-blocker):** migration `010-add-v5-metadata.sql` widens
    the `record_version` CHECK to `IN (1,2,3,4,5)` and adds the nullable
    `metadata_jsonb` column. Core stamps `record_version=5` unconditionally, so
    against a DB migrated through 009 every audit insert previously failed Postgres 23514. The sink now persists and recovers `metadata` losslessly.
  - **primitives:** `createTokenBudgetGuard` now fails **closed** on a non-finite
    over-budget meter — `+Infinity` ≥ any budget crosses (REFUSE) instead of
    passing through. NaN/negative remain non-crossing.
  - **conformance:** `generateAiBom` array comparators are now total-order (equal
    keys → 0), so the `bomDigest` is reproducible for inputs with duplicate keys.
  - **anthropic / openai:** the provider adapters now declare and forward the
    agent-loop seams `onTokenUsage`, `memoryStore`, `enrichContext`,
    `deriveMemoryWriteback`, `configSeal`, and `traceSink` — previously these were
    unreachable through the bridges (token budget, memory, and config-seal were
    effectively dead via the published adapters).
  - **pack-deployments-approval:** total-order tie-break for the model/prompt gate;
    README documents three release-gate limitations (opt-in regression score,
    carbon clamp has no data-residency allow-list, model/prompt gate fires on first
    deploy).
  - **core:** documents and pins the v5 metadata cross-version verification contract
    (a pre-v5 verifier would falsely flag a metadata-bearing record as tampered).

- 1e0058b: feat(primitives): add `createTokenBudgetGuard` — pure guard that REFUSE/DEFERs on per-session/per-tenant token budgets, reading the counter from adopter state S (ADR-120).

  feat(adapter-core): `AssistantTurn.usage` + `onTokenUsage` hook surface provider token usage per turn (the adopter folds it into state S).

  feat(anthropic,openai): map provider token usage onto `AssistantTurn.usage`.

  feat(admin-sdk): add `governance.tokenBudget` for the console Token Budget panel.

### Patch Changes

- Updated dependencies [58655cb]
- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/adapter-core@0.3.0
  - @adjudicate/core@1.3.0
  - @adjudicate/audit@3.0.0
  - @adjudicate/runtime@0.2.1

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

### Patch Changes

- Updated dependencies [9e65871]
- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/audit@2.0.0
  - @adjudicate/core@1.2.0
  - @adjudicate/runtime@0.2.0
  - @adjudicate/adapter-core@0.2.0
