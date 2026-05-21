# Public API Surface

> The inventory of which exports each `@adjudicate/*` package owes
> adopters. Anything listed here is governed by [`semver.md`](./semver.md);
> anything not listed is internal and may change without notice.

The split between "public" and "internal" is the load-bearing line for
release engineering — when we cut a release, this document is the
checklist that decides whether the diff is patch, minor, or major.

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

---

## `@adjudicate/core`

**Subpaths:**

- `.` (root) — the headline types + helpers
- `./kernel` — `adjudicate()`, `PolicyBundle`, guard helpers
- `./llm` — `CapabilityPlanner`, `ToolClassification`, `PromptRenderer`

**Public surface (root):**

- Types: `IntentEnvelope`, `Decision`, `Refusal`, `RefusalKind`, `Taint`,
  `AuditRecord`, `AuditSink`, `BasisCode`, `DecisionBasis`,
  `LedgerHit`, `LedgerRecordOutcome`, `Pack`, `InstalledPack`,
  `Supersession`, `SupersessionReason`, `AuditPlanSnapshot`.
- Constants: `BASIS_CODES`, `KERNEL_REFUSAL_CODES`, `AUDIT_RECORD_VERSION`.
- Helpers: `buildEnvelope`, `buildAuditRecord`, `replayEnvelopeFromAudit`,
  `sha256Canonical`, `refuse`, `decisionExecute`, `decisionRefuse`,
  `decisionEscalate`, `decisionRequestConfirmation`, `decisionRewrite`,
  `decisionDefer`, `noopAuditSink`, `installPack`,
  `assertPackConformance`, `withBasisAudit`, `classify` (replay), explain
  helpers.

**Public surface (`./kernel`):**

- `adjudicate`, `adjudicateAndAudit`, `adjudicateWithTrace`,
  `adjudicateAndLearn`.
- `PolicyBundle`, `Guard`, `TaintPolicy`, `GuardMetadata`, `nameGuard`,
  `withMetadata`, `readGuardMetadata`.
- `MetricsSink`, `LearningSink`, `setMetricsSink`, `setLearningSink`,
  `recordOutcome`, `createConsoleMetricsSink`, `createConsoleLearningSink`.
- `RuntimeContext`, `KernelIdentity`.

**Public surface (`./llm`):**

- `CapabilityPlanner`, `Plan`, `ToolClassification`, `READ_ONLY_TOOLS`,
  `MUTATING_TOOLS`, `PromptRenderer`.

**Internal (do not depend on):**

- Anything under `src/kernel/runtime-context.ts` not re-exported via the
  kernel barrel.
- The `replay-classify` internals beyond the `classify` entry point.
- The `pack-conformance` internals beyond `assertPackConformance` and
  `PackConformanceError`.

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

- `runAnalyze`, `AnalysisReport`, `AnalysisFinding`, `Severity`.
- Renderer entry points (`renderText`, `renderJson`, `renderSarif`).
- Tier 1 analyzer registry (read-only; adopters cannot register their
  own analyzers in v0.x).

**Internal:** analyzer implementations, AST shapes for the Pack registry.

---

## `@adjudicate/cli`

**Public surface:**

- The `adjudicate` CLI binary and its commands: `pack init`, `pack lint`,
  `doctor`, `simulate`, `analyze`.
- CLI exit codes (documented in the CLI README).

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

## `@adjudicate/anthropic` (integration adapter)

**Public surface:**

- The adapter that exposes adjudicate's intent-and-decision flow through
  Anthropic's tool-use protocol. Specific exports are listed in the
  package README.
- "L2 rework callouts" are documented in the package README and are
  flagged as places the API may shift when L2 stabilizes.

---

## `@adjudicate/pack-*` (domain Packs)

**Public surface (per Pack):**

- The Pack's policy bundle (`Pack.policy`) and any documented helper
  factories (e.g., `createPixPendingDeferGuard`).
- The intent kinds the Pack accepts and the state shape it reads.

**Internal:** guard implementations, intent kind type unions when not
re-exported.

Packs follow the same semver rules as the framework. Adopters who depend
on `@adjudicate/pack-payments-pix@0.4.x` can update to `0.4.y` without
code changes; `0.5.0` may break.

---

## `@adjudicate/observability` (new in v0.4)

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

## `@adjudicate/migrate` (new in v0.4)

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
   (added alongside this document) snapshots the headline declarations.
   The snapshot is intentionally noisy on breaks — a refactor that
   churns the snapshot is a signal to update the surface inventory
   here too.

If you ship a change and either check would flip without an
accompanying update to this file, the release is blocked until the
inventory matches reality.
