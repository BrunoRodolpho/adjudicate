# Public API Surface

> The inventory of which exports each `@adjudicate/*` package owes
> adopters. Anything listed here is governed by [`semver.md`](./semver.md);
> anything not listed is internal and may change without notice.

The split between "public" and "internal" is the load-bearing line for
release engineering — when we cut a release, this document is the
checklist that decides whether the diff is patch, minor, or major.

Package versions are not pinned in this doc (they drift per-package; see
each `package.json`). This file tracks *which symbols* are public, not
their version numbers.

---

## How to read this document

Each section is one package. Within a package:

- **Public surface** — exports that adopters can depend on across minor
  bumps. Removal is a MAJOR.
- **Internal surface** — files that are reachable through the package's
  built `dist/` but are NOT part of the contract. Adopters who reach into
  these (e.g., `@adjudicate/core/dist/kernel/runtime-context.js`) get no
  semver promise.
- **Subpaths** — additional entrypoints exposed via `package.json#exports`.
  Each subpath has the same public/internal split as the root.

The convention across the repo: only identifiers re-exported from a
package's `src/index.ts` (and from each declared subpath barrel) are
public. Everything else is internal.

This document lists the *headline* symbols per package, not every
identifier. The authoritative inventory is each package's barrel
(`src/index.ts` and declared subpath barrels); the audit checks below
keep this prose in sync with those barrels.

---

## `@adjudicate/core`

**Subpaths:**

- `.` (root) — the headline types + helpers.
- `./kernel` — `adjudicate()`, `PolicyBundle`, guard/combinator/metrics
  helpers.
- `./llm` — `CapabilityPlanner`, `ToolClassification`, `PromptRenderer`.

> **Note on the root barrel.** `core/src/index.ts` does
> `export * from "./kernel/index.js"` and `export * from "./llm/index.js"`,
> so *every* kernel and llm symbol is ALSO importable from the root
> entrypoint. The root / `./kernel` / `./llm` split below is an
> organizational convention for finer-grained, tree-shakeable imports —
> it is **not** enforced by the build. Treat a symbol as public if it
> appears in any of these three barrels.

**Public surface (root):**

- Types: `IntentEnvelope`, `Decision`, `Refusal`, `RefusalKind`, `Taint`,
  `AuditRecord`, `AuditSink`, `BasisCode`, `DecisionBasis`,
  `LedgerHit`, `LedgerRecordOutcome`, `Pack`, `InstalledPack`,
  `Supersession`, `SupersessionReason`, `AuditPlanSnapshot`.
- Constants: `BASIS_CODES`, `KERNEL_REFUSAL_CODES`, `AUDIT_RECORD_VERSION`.
- Helpers: `buildEnvelope`, `buildAuditRecord`, `replayEnvelopeFromAudit`,
  `canonicalJson`, `sha256Canonical` (both re-exported from
  `@adjudicate/canonical` — see that section), `refuse`,
  `decisionExecute`, `decisionRefuse`, `decisionEscalate`,
  `decisionRequestConfirmation`, `decisionRewrite`, `decisionDefer`,
  `noopAuditSink`, `installPack`, `assertPackConformance`,
  `withBasisAudit`, `classify` (replay), `localizeDecision` + the explain
  helpers.
- Post-v1 additive (items 1 & 2): `SideEffectClass`, `DEFAULT_SIDE_EFFECT_FLOOR`
  (side-effect taint-floor vocabulary); `ExecutorContract`, `OutputShape`,
  `StructuralMismatch`, `validateOutputShape` (structural post-EXECUTE output
  validation). Optional `PackV0.sideEffects` / `PackV0.executorContract` registry
  fields — outside the hashed envelope and outside ConfigSeal.

**Public surface (`./kernel`):**

- Entry points: `adjudicate`, `adjudicateAndAudit`, `adjudicateWithTrace`,
  `adjudicateWithDeadline`, `adjudicateAndLearn`.
- Policy + guards: `PolicyBundle`, `Guard`, `GuardMetadata`,
  `GuardDescription`, `nameGuard`, `withMetadata`, `readGuardMetadata`.
- Combinators: `allOf`, `constant`, `firstMatch`.
- Description / stats: `describePolicyBundle`, `GuardFireStats`.
- Metrics: `MetricsSink`, `setMetricsSink`, `createConsoleMetricsSink`,
  plus the `record*` helpers (`recordLedgerOp`, `recordDecision`,
  `recordRefusal`, `recordSinkFailure`, `recordResourceLimit`) — all in
  `kernel/metrics.ts`.
- Learning: `LearningSink`, `setLearningSink`, `recordOutcome`,
  `createConsoleLearningSink`, `adjudicateAndLearn`.
- Outcomes: `recordRetrospectiveOutcome`, `setOutcomeSink`,
  `InMemoryOutcomeSink`, `OutcomeSink`, `RetrospectiveOutcome`.
- Rate limit: `createRateLimitGuard`, `checkRateLimit`,
  `createInMemoryRateLimitStore`, `RateLimitStore`, `RateLimitResult`.
- Runtime context: `createRuntimeContext`, `getDefaultRuntimeContext`,
  `RuntimeContext`.
- Identity: `createKernelIdentity`, `KernelIdentity`.
- Shadow-mode rollout (`shadow.js`) and enforce-config (`enforce-config.js`)
  are re-exported wholesale via the barrel (`export *`).

**Public surface (`./llm`):**

- Planner: `staticPlanner`, `CapabilityPlanner`, `Plan`.
- Renderer: `PromptRenderer`, `RenderedPrompt`, `SupervisorModifiers`,
  `ToolSchema`.
- Tool classification: `filterReadOnly`, `isMutating`, `isReadOnly`,
  `ToolClassification`.
- Plan conformance: `assertPlanReadOnly`, `assertPlanSubsetOfPack`,
  `PlanConformanceError`, `safePlan`.

**Internal (do not depend on):**

- Anything under `src/kernel/` and `src/llm/` not re-exported via the
  respective barrel.
- `replay-classify` internals beyond the `classify` entry point.
- `pack-conformance` internals beyond `assertPackConformance` and
  `PackConformanceError`.

---

## `@adjudicate/canonical`

The single source of truth for content-addressed hashing — canonical-JSON
(RFC 8785 / JCS) serialization + sha256 — shared by `@adjudicate/core` and
runtime adopters so no one forks a copy that can silently drift.

**Public surface:**

- `canonicalJson`, `sha256Canonical`.

`@adjudicate/core` re-exports both from its root barrel
(`packages/core/src/hash.ts`), so core's historical import path is
unchanged; the bytes are identical. Golden vectors live in this package
and are pinned by core's test suite.

---

## `@adjudicate/audit`

**Public surface:**

- `AuditSink` (re-exported from core), `AuditSinkError`, `multiSink`,
  `multiSinkLossy`, `multiSinkStrict`, `bufferedSink`,
  `persistentBufferedSink`.
- Sinks: `createConsoleSink`, `createNatsSink`.
- Ledger: `createRedisLedger`, `createMemoryLedger`, `Ledger`,
  `LedgerHit`, `LedgerRecordOutcome`.
- Replay: `replay`, `classify`, `Adjudicator`, `ReplayReport`,
  `ReplayMismatch`, `ReplayMismatchKind`, `ReplayBasisDelta`.
- Feature flags: `isLedgerEnabled`, `isLedgerEnforced`.
- Distributed kill switch: `startDistributedKillSwitch`.

**Internal:** the `redis-emergency-store` types are SDK-shaped; only the
ones re-exported via `index.ts` are public.

---

## `@adjudicate/audit-postgres`

**Public surface:**

- `createPostgresAuditSink`, `createPostgresOutcomeSink`,
  `loadAuditRecords`, replay reader, migration entry.
- All public types around the Postgres schema and the row-shape contract.

**Internal:** SQL strings, prepared statements, and migration internals.

---

## `@adjudicate/runtime`

**Public surface:**

- `resumeDeferredIntent`, `deadlinePromise`, `ParkedEnvelope`,
  `parkedEnvelopeQuota`.
- Deadline + signal helpers used by Pack authors.

**Internal:** orchestrator glue meant to be lifted out only via the
public helpers above.

---

## `@adjudicate/primitives`

**Public surface:**

- Guard factories: `createConfirmGuard`, `createEscalateGuard`,
  `createIdempotencyGuard`, `createRewriteGuard`,
  `createStateDeferGuard`, `createThresholdGuard`.
- Taint factory: `createSystemTaintPolicy`.
- Option types: `ConfirmGuardOptions`, `EscalateGuardOptions`,
  `IdempotencyGuardOptions`, `RewriteGuardOptions`,
  `StateDeferGuardOptions`, `ThresholdComparator`,
  `ThresholdGuardOptions`, `SystemTaintPolicyOptions`.

**Internal:** the closures the factories return. Adopters compose them as
guards; they don't inspect their internals.

---

## `@adjudicate/analyze`

**Public surface:**

- `analyzePolicy` (the entry point), `AnalyzePolicyArgs`,
  `AnalysisReport`, `Analyzer`, `AnalyzeOptions`, `Diagnostic`,
  `DiagnosticCode`, `DiagnosticSeverity`, `SourceLocation`,
  `Tier2Analyzer`.
- Renderer entry points: `renderText`, `renderJson`, `renderSarif`.
- Manifest tooling: `describePack`, `describeInstalledPacks`,
  `computeManifestDigest`, `diffPolicyManifests` and their types.
- Analyzer registries (read-only — adopters cannot register their own):
  - `DEFAULT_ANALYZERS` (Tier 1, policy-shape checks).
  - `DEFAULT_TIER2_ANALYZERS` (AST-based; pair with `loadSourceFiles`).
  - `DEFAULT_TIER3_ANALYZERS` (`policyCoherenceAnalyzer` + a
    `PlannerProbe`-driven analyzer).

**Internal:** analyzer implementations, AST shapes for the Pack registry,
and `internal/walk.ts` beyond its exported `NameSource` / `Phase` types.

---

## `@adjudicate/conformance`

Public Pack conformance harness — runs the kernel's invariant suite
(taint protection, replay safety, intent-hash determinism,
basis-vocabulary purity, guard ordering, default polarity) against any
`PackV0`.

**Public surface:** the harness entry points exported from the package
root. Run it against a Pack in CI to assert kernel-level invariants hold.

---

## `@adjudicate/red-team`

Deterministic adversarial scenario generation (prompt-injection,
taint-escalation, tool-scope-violation) that asserts a Pack's
kernel-level defenses hold.

**Public surface:** the scenario generators and assertion harness exported
from the package root. Scenarios are deterministic so failures are
reproducible.

---

## `@adjudicate/drift`

Opt-in behavioral / statistical drift detection over the AuditEventBus —
running decision-distribution comparison with bounded cardinality. Never
touches the decision path.

**Public surface:** the detector + event-bus subscriber exported from the
package root.

---

## `@adjudicate/cli`

**Public surface:**

- The `adjudicate` CLI binary (`bin: adjudicate`). The commands and their
  exit codes are the contract; they are documented in the CLI README
  (`pack`, `analyze`, `doctor`, `simulate`, `replay`, `export`,
  `red-team`, and more).

**Internal:** every source module. The CLI is the contract; importing
from `@adjudicate/cli` programmatically is not supported.

---

## `@adjudicate/eslint-config`

**Public surface:**

- The flat-config preset(s) exported from the package root.
- Adopters who pin a version of this package get a stable rule set;
  bumping the minor may add new rules.

**Internal:** the underlying rule wiring.

---

## LLM adapters

The provider-neutral orchestration loop, decision translator, persistence
shims, and error taxonomy live in **`@adjudicate/adapter-core`**. Each
provider adapter implements a `ProviderBridge<H>` against its SDK and
re-exports a thin `createAdjudicatedAgent` that wires it into that loop.
Provider adapters MUST NOT bypass the loop — the kernel-side audit +
ledger guarantees only hold when every adjudication flows through it.

### `@adjudicate/adapter-core`

**Public surface:**

- `createAdjudicatedAgent` and the agent option / event / outcome types.
- Bridge contract: `ProviderBridge`, `ProviderRequest`, `ToolUseRequest`,
  `buildEnvelopeFromToolUse`, `classifyIncomingToolUse`,
  `intentKindToApiName`.
- Decision translation: `translateDecision`, `makeOutOfPlanToolResult`,
  `DecisionTranslation`, `LoopAction`.
- Persistence shims: in-memory + Redis confirmation / defer / memory /
  token-usage stores.
- Tracing: `noopTraceSink`, `createInMemoryTraceSink`, `TraceSink`.
- Errors: `AdapterError`, `AdapterErrorCode`.
- `createMemoryLedger` re-exported from `@adjudicate/audit` for
  zero-import-friction in tests / quickstarts (NOT for production).

### `@adjudicate/anthropic`

Reference Anthropic Messages API integration.

**Public surface:** `createAdjudicatedAgent`, `createAnthropicBridge`,
`createAnthropicPromptRenderer`, `DEFAULT_ADJUDICATED_SYSTEM_PROMPT`, and
the agent types — plus adapter-core re-exports to keep adopter import
paths stable.

**Deprecated:** `AnthropicAdapterError` / `AnthropicAdapterErrorCode`
(use `AdapterError` / `AdapterErrorCode` from adapter-core; removed in
v2.0).

### `@adjudicate/openai`

Reference OpenAI Chat Completions integration — peer to `anthropic`.

**Public surface:** `createAdjudicatedAgent`, `createOpenAIBridge`,
`createOpenAIPromptRenderer`, `DEFAULT_OPENAI_ADJUDICATED_SYSTEM_PROMPT`,
the OpenAI-shaped client/message types, and the agent types — plus
adapter-core re-exports.

---

## `@adjudicate/approval-engine`

Reference human-approval orchestration for `REQUEST_CONFIRMATION` flows —
pluggable channels (webhook, Slack, Teams, email) plus a replay-safe
resume via adapter-core's `confirm()`.

**Public surface:** the engine factory, channel interface, and resume
helpers exported from the package root.

---

## `@adjudicate/admin-sdk`

Admin Query Interface (AQI) — Zod-validated, read-only audit query
handlers + a tRPC router. Adopter-deployed; framework-shipped contract.

**Subpaths:** `.` (query handlers + types), `./trpc` (router),
`./adapters/next` (Next.js adapter).

**Public surface:** the query handlers, their Zod schemas, the tRPC
router, and the Next.js adapter exported from the respective subpaths.

---

## `@adjudicate/locales-pt-BR`

Brazilian Portuguese (pt-BR) refusal messages for `@adjudicate/core`'s
`localizeDecision()` helper.

**Public surface:** the pt-BR message map exported from the package root.

---

## `@adjudicate/pack-*` (domain Packs)

Shipped Packs: `pack-payments-pix`, `pack-identity-kyc`,
`pack-incident-response`, `pack-access-governance`,
`pack-deployments-approval`.

**Public surface (per Pack):**

- The Pack's policy bundle (`Pack.policy`) and any documented helper
  factories (e.g., `createPixPendingDeferGuard`).
- The intent kinds the Pack accepts and the state shape it reads.

**Internal:** guard implementations, intent kind type unions when not
re-exported.

Packs follow the same semver rules as the framework. Adopters who pin a
Pack at `0.x.y` can update within `0.x` without code changes; the next
minor may break.

---

## `@adjudicate/observability`

**Public surface:**

- `Exporter`, `ExportedEvent`, `ExportedEventKind`, `InMemoryExporter`.
- `createInMemoryExporter`, `noopExporter`.
- `SEMCONV` constant (attribute names — see the semconv section of the
  README for the stability promise).
- `createOtlpMetricsSink`, `createOtlpLearningSink`,
  `createOtlpAuditSpanExporter` and their option types.

**Stability note:** `SEMCONV` attribute names are stable across minor
versions. New keys are additive; renames are MAJOR.

**Internal:** the OpenTelemetry SDK isn't pinned here. Adopters provide
their own exporter; the package exposes only the shape it expects.

---

## `@adjudicate/migrate`

**Public surface:**

- `runCodemod`, `listCodemods`, `CodemodDescriptor`, `CodemodReport`,
  `CodemodChange`, `CodemodOptions`.
- Individual codemods (currently `nameGuardToWithMetadata`).
- The `adjudicate-migrate` CLI binary.

**Internal:** the ts-morph workspace setup. Adopters interact through
the CLI or the descriptor surface; they don't poke at the AST visitors
directly.

---

## Auditing the surface

Two checks keep this document honest:

1. **The `pnpm pack` dry-run for each package** lists exactly the files
   shipped to the registry. Any export reachable through the published
   `dist/index.d.ts` must appear in this document.

2. **Type-level regression test in `@adjudicate/core/tests/api-surface.test.ts`**
   snapshots the headline declarations. The snapshot is intentionally
   noisy on breaks — a refactor that churns the snapshot is a signal to
   update the surface inventory here too.

If you ship a change and either check would flip without an
accompanying update to this file, the release is blocked until the
inventory matches reality.
