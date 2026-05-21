# V1 Freeze Matrix

> Authoritative contract map for v1.0 release-candidate certification.
> Generated 2026-05-20 against `claude/unruffled-bassi-305034` at HEAD
> commit `bddf704` (v0.7 — operational hardening + ecosystem trust).
> Companion to [`api-surface.md`](./api-surface.md) and
> [`semver.md`](./semver.md); supersedes them where they disagree.

This document is the freeze-boundary audit for v1.0. Every exported
identifier, every wire-format shape, every semantic-convention key,
every CLI command, and every Pack manifest field has been classified
into one of seven stability tiers. After v1.0 ships, this matrix is the
single source of truth that the release-engineering pipeline (API
surface diff, prepublish invariant check, generated freeze report)
consults to decide whether a diff is patch, minor, major — or
blocked.

---

## Stability tiers

| Tier | Symbol | Semver behaviour | Adopter posture |
|---|---|---|---|
| `frozen` | F | Removal/rename is MAJOR; signature changes follow [`semver.md`](./semver.md). | Build against this; expect it to be load-bearing for the v1 line. |
| `experimental` | E | Removal/rename is MINOR through the v1 line. Marked `@experimental` in JSDoc. | Adopt with awareness; pin patch range. |
| `unstable` | U | Pre-stabilisation surface. Removal/rename is MINOR. | Avoid in production unless you control the upgrade cadence. |
| `internal-only` | I | Not part of any published contract. Subject to change with no notice. | Do not import; reach only through documented public entrypoints. |
| `deprecation-target` | D | Lifecycle-tracked in [`deprecations.md`](./deprecations.md); slated for removal at a scheduled MAJOR. | Migrate before the calendar removal target. |
| `evidence-gated` | G | Frozen contour, but ships behind an opt-in toggle that defaults off pending operational evidence (see [`V0.7-AUDIT-REPORT.md`](../architecture/V0.7-AUDIT-REPORT.md) §"Operational evidence required before v1.0"). | Wire it in shadow first; bring it live behind your own gate. |
| `removed` | X | Identifier has been deleted in a prior MAJOR. Listed for migration discoverability. | Replace before upgrade. |

The matrix uses these symbols as a column header to keep rows scannable.

---

## Output fields per surface

For each public surface we record:

- **Symbol** — name as exported (or wire-field name).
- **Tier** — one of the seven above.
- **Owner pkg** — package whose `src/index.ts` (or a declared subpath
  barrel) re-exports the symbol.
- **Replay impact** — `none | basis-only | decision` indicating how a
  change would classify against `@adjudicate/audit/replay-classify`.
- **Migration impact** — `none | additive | codemod | hand-edit`.
- **Semver sensitivity** — `low | medium | high` summarising blast
  radius.
- **Extension policy** — how this surface evolves: `closed | additive |
  open`.
- **Breaking-change tolerance** — `none | scheduled | by-evidence`.
- **Freeze rationale** — one sentence justifying the tier choice.

---

## §1 — `@adjudicate/core` (root barrel)

### §1.1 Wire-bearing types

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `IntentEnvelope` | F | core | decision | hand-edit | high | closed | none | Load-bearing wire format; field add is MAJOR. JSON Schema at `docs/specs/intent-envelope-v2.schema.json` pins it. |
| `IntentEnvelopeVersion` | F | core | decision | hand-edit | high | closed | none | The `const 2` literal anchors version-gated branches across kernel + audit-postgres. |
| `INTENT_ENVELOPE_VERSION` | F | core | decision | hand-edit | high | closed | none | Mirrors the type-level constant for runtime checks; bump is a MAJOR with replay-shim. |
| `IntentActor` | F | core | decision | hand-edit | high | closed | none | Principal enum (`llm | user | system`) is closed; new principal is MAJOR. |
| `Taint` | F | core | decision | hand-edit | high | closed | none | Lattice `SYSTEM > TRUSTED > UNTRUSTED` is load-bearing for guard ordering. |
| `Decision` (union) | F | core | decision | hand-edit | high | closed | none | Six-outcome closed algebra. ADR-104 forbids metadata bag / confidence field. |
| `DecisionKind` (union) | F | core | decision | hand-edit | high | closed | none | Same as above; exists for consumers who only need the discriminator. |
| `Refusal` / `RefusalKind` | F | core | basis-only | additive | medium | closed | scheduled | Closed enum; new refusal kinds go through a MAJOR. |
| `Supersession` / `SupersessionReason` | F | core | basis-only | additive | medium | closed | scheduled | v3+ field; readers must branch on `record.version`. |
| `AuditRecord` | F | core | none | additive | high | additive | none | Schema is additive across minor versions per ADR-111; readers loop on `version`. |
| `AuditPlanSnapshot` | F | core | none | additive | medium | additive | none | v2+ optional; `planFingerprint` SHA-256 is RFC 8785 JCS. |
| `AuditRecordVersion` (union `1 | 2 | 3 | 4`) | F | core | none | additive | medium | additive | scheduled | Widening to `5` is MINOR; narrowing is MAJOR. |
| `AUDIT_RECORD_VERSION` | F | core | none | additive | medium | additive | scheduled | Mirrors the type-level constant. |

### §1.2 Wire-bearing helpers

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `buildEnvelope` | F | core | decision | hand-edit | high | closed | none | The single entrypoint that computes `intentHash`. |
| `isIntentEnvelope` / `hasUnknownEnvelopeVersion` | F | core | none | none | medium | closed | none | Branch points used by the kernel's first-guard schema check. |
| `buildAuditRecord` / `verifyAuditRecord` | F | core | none | additive | high | closed | none | Canonical record builder + tamper-detection verifier; signature seam stays additive. |
| `replayEnvelopeFromAudit` | F | core | none | none | medium | closed | none | Pre-T8 → T8 nonce fallback is the only intentional foot-gun mitigation; do not relax. |
| `sha256Canonical` | F | core | decision | hand-edit | high | closed | none | RFC 8785 JCS over `(version, kind, payload, nonce, actor, taint)` — pinned by cross-runtime vectors. |
| `decisionExecute` / `decisionRefuse` / `decisionEscalate` / `decisionRequestConfirmation` / `decisionDefer` / `decisionRewrite` | F | core | decision | hand-edit | high | closed | none | Closed constructors mirror the closed enum. |

### §1.3 Basis-code vocabulary

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `BASIS_CODES` | F | core | basis-only | additive | medium | additive | scheduled | New codes within an existing category are MINOR per `semver.md`; category-level changes are MAJOR. |
| `BasisCategory` (union) | F | core | basis-only | additive | medium | closed | scheduled | Eleven categories; new category is MAJOR. |
| `DecisionBasis<C>` / `BasisCode<C>` | F | core | basis-only | additive | medium | additive | scheduled | Distributive typing pins per-category narrowness. |
| `basis(category, code, detail)` / `isKnownBasisCode` | F | core | basis-only | additive | low | additive | scheduled | Compile-time vocab enforcer + runtime drift detector. |
| `BASIS_CODES.deadline.EXCEEDED` (legacy duplicate) | D | core | basis-only | codemod | low | closed | scheduled | Documented as kept for back-compat; prefer `deadline.EXCEEDED` outside kernel-internal path. Removal target: v3.0 (post-v1 deprecation horizon). |

### §1.4 Pack contract

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `PackV0` | F | core | none | hand-edit | high | additive | none | The Pack ecosystem's load-bearing shape; new optional fields are MINOR. |
| `PackHandler` | F | core | none | hand-edit | medium | closed | none | Side-effect callback signature; tightening is MAJOR. |
| `InstalledPack` / `InstallPackOptions` | F | core | none | additive | medium | additive | scheduled | Wrap helper for `installPack`. |
| `installPack` | F | core | none | additive | medium | additive | scheduled | Composes withBasisAudit + freeze; signature is the bind point for Pack registries. |
| `assertPackConformance` / `PackConformanceError` | F | core | none | additive | medium | additive | scheduled | Eager invariant check; matches `runConformance` from conformance pkg. |
| `withBasisAudit` | F | core | basis-only | additive | medium | additive | scheduled | Audit instrumentation wrapper; intentionally idempotent. |
| `AssertPackConformanceOptions` | F | core | none | additive | low | additive | scheduled | Options struct; new optional keys are MINOR. |

### §1.5 Replay classification

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `classify(...)` (replay-classify) | F | core | none | additive | high | closed | none | The judge of `IDENTICAL | BASIS_ONLY | DECISION_CHANGED`; loadbearing for semver decisions. |

### §1.6 Explanation registry

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `explainRecord` / `mergeExplanationRegistries` / `DEFAULT_EXPLANATION_REGISTRY` / `ExplanationRegistry` / `DecisionExplanation` | F | core | none | additive | low | open | scheduled | Adopter-extensible; new entries via merge are MINOR. |

### §1.7 Sink + ledger types (re-exports)

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `AuditSink` (interface) | F | core | none | additive | high | additive | none | Single-method contract is intentionally minimal; new optional callbacks would be additive. |
| `Ledger` / `LedgerHit` / `LedgerRecordInput` / `LedgerRecordOutcome` | F | core | none | additive | high | additive | scheduled | Pinned by Redis + memory implementations + replay. |
| `noopAuditSink` | F | core | none | none | low | closed | none | Inline trivial. |

### §1.8 Refusal-message localization

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `RefusalMessages` (interface) / `englishRefusalMessages` / `resolveRefusalMessage` / `localizeDecision` | F | core | none | additive | low | open | scheduled | Adopter-supplied locale tables; English defaults stay frozen. |

---

## §2 — `@adjudicate/core/kernel`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `adjudicate` | F | core/kernel | decision | hand-edit | high | closed | none | The pure kernel. Determinism is the load-bearing invariant. |
| `adjudicateAndAudit` | F | core/kernel | decision | hand-edit | high | additive | none | Ledger + audit + clock wrapping; options struct accepts additive fields. |
| `adjudicateWithTrace` | F | core/kernel | decision | additive | high | closed | none | Returns per-phase trace records; vital for analyzer + learning sink. |
| `adjudicateAndLearn` | F | core/kernel | none | additive | medium | additive | scheduled | LearningSink dispatcher; new optional fields permitted. |
| `adjudicateWithDeadline` / `AdjudicateWithDeadlineOptions` | F | core/kernel | decision | additive | medium | additive | scheduled | Deadline race producing `deadline.EXCEEDED`. |
| `PolicyBundle` / `Guard` / `GuardMetadata` / `GuardDescription` | F | core/kernel | decision | hand-edit | high | closed | none | The Pack-authoring contract; widening would re-engineer every Pack. |
| `TaintPolicy` | F | core | decision | hand-edit | high | closed | none | Per-kind minimum-taint declaration; new methods are MAJOR. |
| `withMetadata` / `readGuardMetadata` / `GuardMetadataSymbol` | F | core/kernel | none | additive | medium | additive | scheduled | Metadata attachment shape; symbol identity is part of the contract. |
| `nameGuard` | D | core/kernel | none | codemod | low | closed | scheduled | Pre-v0.5 metadata facade; codemod `nameGuardToWithMetadata` ships in `@adjudicate/migrate`. Removal target: v2.0. |
| `allOf` / `firstMatch` / `constant` | F | core/kernel | decision | additive | medium | closed | none | Guard combinators. |
| `describePolicyBundle` / `PolicyBundleDescriptor` / `GuardDescriptor` / `PolicyPhase` / `PolicyPhaseDescriptor` | F | core/kernel | none | additive | low | additive | scheduled | Read-only descriptor surface for analyzer + console. |
| `GuardFireStats` / `GuardFireBucket` / `GuardFireStatsOptions` / `GuardFireStatsQuery` / `GuardFireStatsStore` / `GuardPhase` | F | core/kernel | none | additive | low | additive | scheduled | Observability counter store; in-memory default ships. |
| `MetricsSink` / `setMetricsSink` / `createConsoleMetricsSink` | F | core/kernel | none | additive | low | additive | scheduled | Metrics dispatch slot; opt-in. |
| `LearningSink` / `setLearningSink` / `createConsoleLearningSink` / `recordOutcome` / `LearningEvent` / `flattenBasis` / `matchedGuardIdFromTrace` / `matchedGuardPhaseFromTrace` / `hasLearningSink` / `_resetLearningSink` | F | core/kernel | none | additive | low | additive | scheduled | Learning telemetry slot; `_reset` prefixed helpers exist solely for tests and stay public. |
| `InMemoryOutcomeSink` / `recordRetrospectiveOutcome` / `setOutcomeSink` / `hasOutcomeSink` / `_resetOutcomeSink` / `ObservedOutcome` / `OutcomeSink` / `RetrospectiveOutcome` | F | core/kernel | none | additive | low | additive | scheduled | Reconciliation hook; pairs with `@adjudicate/audit-postgres` outcomes-store. |
| `createKernelIdentity` / `KernelIdentity` | F | core/kernel | none | additive | low | additive | scheduled | Records `(id, version)` on every adjudication. |
| `RuntimeContext` / `createRuntimeContext` / `getDefaultRuntimeContext` / `_resetDefaultRuntimeContext` / `CreateRuntimeContextOptions` / `RuntimeEnforceConfig` / `KillSwitchControl` / `RuntimeKillSwitchState` / `LearningSinkSlot` / `MetricsSinkSlot` / `ShadowTelemetrySinkSlot` | F | core/kernel | decision | hand-edit | high | closed | none | Multi-tenant context; kill-switch + shadow + enforce-config slots are load-bearing. |
| `checkRateLimit` / `createInMemoryRateLimitStore` / `createRateLimitGuard` / `RateLimitStore` / `RateLimitGuardOptions` / `RateLimitResult` / `CheckRateLimitArgs` | F | core/kernel | decision | additive | medium | additive | scheduled | Token-bucket primitive; pure functions over a store interface. |
| `shadow.*` (re-exports from `./shadow.js`) | F | core/kernel | none | additive | medium | additive | scheduled | Shadow-mode rollout (`Decision`-comparison telemetry, no enforcement). |
| `metrics.*` (re-exports from `./metrics.js`) | F | core/kernel | none | additive | low | additive | scheduled | Counter primitives consumed by sinks. |
| `enforce-config.*` (re-exports from `./enforce-config.js`) | F | core/kernel | decision | additive | medium | additive | scheduled | Per-(intentKind, predicate) enforcement levels (`shadow | dryrun | enforce`). |

---

## §3 — `@adjudicate/core/llm`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `CapabilityPlanner` / `Plan` | F | core/llm | decision | hand-edit | high | closed | none | The plan-emitter Pack-authoring contract. |
| `staticPlanner` | F | core/llm | decision | additive | medium | closed | scheduled | Convenience factory; widening signature is MINOR. |
| `PromptRenderer` / `RenderedPrompt` / `SupervisorModifiers` / `ToolSchema` | F | core/llm | none | additive | medium | additive | scheduled | Provider adapters depend on these shapes; `ToolSchema` is JSON-shape, vendor-neutral. |
| `ToolClassification` / `READ_ONLY_TOOLS` / `MUTATING_TOOLS` / `filterReadOnly` / `isMutating` / `isReadOnly` | F | core/llm | none | additive | medium | closed | none | Per-tool category enum; widening would break safePlan invariants. |
| `assertPlanReadOnly` / `assertPlanSubsetOfPack` / `safePlan` / `PlanConformanceError` | F | core/llm | decision | additive | medium | additive | scheduled | Plan-vs-Pack enforcement contract. |

---

## §4 — `@adjudicate/primitives`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `createThresholdGuard` / `ThresholdGuardOptions` / `ThresholdComparator` | F | primitives | decision | additive | medium | closed | scheduled | Used in PIX Pack; signature stable since v0.4. |
| `createStateDeferGuard` / `StateDeferGuardOptions` | F | primitives | decision | additive | medium | closed | scheduled | Used in KYC + PIX; signal-driven DEFER pattern. |
| `createSystemTaintPolicy` / `SystemTaintPolicyOptions` | F | primitives | decision | additive | medium | closed | scheduled | Locks system-only kinds to SYSTEM taint floor. |
| `createConfirmGuard` / `ConfirmGuardOptions` | E | primitives | decision | hand-edit | medium | closed | by-evidence | Only one Pack consumes; per ADR-108 awaits Pack #4–#6 feedback. Tier becomes `F` post-v1 if no redesign lands. |
| `createEscalateGuard` / `EscalateGuardOptions` | E | primitives | decision | hand-edit | medium | closed | by-evidence | Same lineage as ConfirmGuard; ESCALATE route field may gain options. |
| `createIdempotencyGuard` / `IdempotencyGuardOptions` | E | primitives | decision | hand-edit | medium | closed | by-evidence | Domain-level dedup; intersects with ledger semantics — awaits Pack #4 evidence. |
| `createRewriteGuard` / `RewriteGuardOptions` | E | primitives | decision | hand-edit | medium | closed | by-evidence | Tier 2 analyzer (`AJD-201`) keeps `mutatesPayloadFields` honest; freeze full surface after analyzer expands. |

---

## §5 — `@adjudicate/runtime`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `parkDeferredIntent` / `ParkDeferredIntentArgs` / `ParkDeferredIntentResult` / `ParkRedis` / `ParkLogger` | F | runtime | decision | additive | high | additive | scheduled | Persistence handshake for DEFER; tampering with `parkedAt` hash is the threat model. |
| `resumeDeferredIntent` / `ResumeDeferredIntentArgs` / `DeferResumeResult` / `DeferRedis` / `DeferLogger` / `ParkVerificationResult` / `ParkedEnvelope` | F | runtime | decision | additive | high | additive | scheduled | Resume contract; `verifyParkedHash` option defaults flip-tracked below. |
| `deferResumeHash` / `verifyParkedEnvelopeHash` | F | runtime | decision | additive | high | closed | none | Hash-derivation helpers; deterministic. |
| `DEFAULT_MAX_RESUME_CYCLES` / `DEFAULT_DEFER_QUOTA_PER_SESSION` / `DEFER_PENDING_TTL_GRACE_SECONDS` / `deferParkKey` / `deferCounterKey` / `decrementDeferCounter` / `CounterRedis` | F | runtime | decision | additive | medium | additive | scheduled | Numeric defaults — change is MAJOR if observable. |
| `deadlinePromise` / `DEADLINE_HIT` | F | runtime | none | additive | low | closed | none | Deadline race primitive. |
| `verifyParkedHash: "warn"` default value | G | runtime | decision | additive | medium | additive | by-evidence | Pre-v1 plan: flip default to `"strict"`. Gated on at least one adopter wiring evidence per [`V0.7-AUDIT-REPORT.md`](../architecture/V0.7-AUDIT-REPORT.md). |

---

## §6 — `@adjudicate/audit`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `AuditSink` (re-export) / `AuditSinkError` / `multiSink` / `multiSinkLossy` / `multiSinkStrict` / `bufferedSink` / `BufferedSinkOptions` | F | audit | none | additive | high | additive | scheduled | Sink composition is a known-stable surface. |
| `persistentBufferedSink` / `createInMemorySpillStorage` / `PersistentBufferedSinkOptions` / `PersistentBufferedSpillReason` / `PersistentSpillStorage` | F | audit | none | additive | medium | additive | scheduled | Pluggable spill storage interface. |
| `createConsoleSink` / `ConsoleSinkOptions` / `createNatsSink` / `NatsPublisher` / `NatsSinkOptions` | F | audit | none | additive | medium | additive | scheduled | Reference sinks; NATS shape is structurally typed. |
| `createMemoryLedger` / `createRedisLedger` / `CreateRedisLedgerOptions` / `RedisLedgerClient` | F | audit | none | additive | high | additive | scheduled | The `RedisLedgerClient` minimal interface is the contract every Redis-backed feature reuses. |
| `replay` / `classify` / `Adjudicator` / `ReplayMismatch` / `ReplayMismatchKind` / `ReplayBasisDelta` / `ReplayReport` | F | audit | none | additive | high | additive | scheduled | Decision + basis-flat-set diffing; central to semver enforcement. |
| `replayWithIntegrity` / `isReplayIntegrityClean` / `IntegrityFailure` / `ReplayIntegrityReport` | F | audit | none | additive | medium | additive | scheduled | Audit-hash + envelope-hash tamper-axis. |
| `explainReplayReport` / `ExplainReplayOptions` / `ReplayExplainFormat` | F | audit | none | additive | low | additive | scheduled | Output formats `ci-line | summary | operator` are closed. |
| `isLedgerEnabled` / `isLedgerEnforced` | F | audit | none | additive | low | closed | scheduled | Env-flag readers; shipping behaviour is deterministic. |
| `startDistributedKillSwitch` / `DistributedKillSwitchHandle` / `DistributedKillSwitchOptions` | F | audit | decision | additive | high | additive | scheduled | v1 polling helper retained; the convergence guarantee stays `pollMs * 2`. |
| `startDistributedKillSwitchPubSub` / `DistributedKillSwitchPubSubHandle` / `DistributedKillSwitchPubSubOptions` / `RedisPubSubClient` | G | audit | decision | additive | high | additive | by-evidence | Sub-100 ms holds in lab. Per ADR-114 we want at least one adopter latency-profile before freezing the option-defaults; surface itself is `frozen` modulo defaults. |
| `createInMemoryAuditEventBus` / `createRedisAuditEventBus` / `bridgeAuditSinkToBus` / `AuditEventBus` / `AuditEventHandler` / `RedisAuditEventBusOptions` / `BridgeAuditSinkToBusOptions` / `BridgeBusFailure` | G | audit | none | additive | medium | additive | by-evidence | Same evidence gate as kill-switch v2: needs an adopter wiring it under WebSocket fan-out at scale. Functional surface frozen; default-channel and reconnect-backoff knobs may shift after evidence. |
| `createRedisEmergencyStateStore` / `CreateRedisEmergencyStateStoreOptions` / `EmergencyHistoryLog` | F | audit | none | additive | medium | additive | scheduled | Implements admin-sdk's `EmergencyStateStore` against the same Redis schema the kill-switch uses. |

---

## §7 — `@adjudicate/audit-postgres`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `createPostgresSink` / `PostgresSinkOptions` / `PostgresWriter` / `recordToRow` / `partitionMonthOf` / `IntentAuditRow` | F | audit-postgres | none | additive | high | additive | scheduled | Row shape pinned by replay reader; column additions are MINOR via migration. |
| `readAuditWindow` / `rowToRecord` / `AuditQueryFn` / `AuditQueryFnWindow` | F | audit-postgres | none | additive | high | additive | scheduled | Replay reader contract. |
| `legacyV1ToV2` | F | audit-postgres | basis-only | additive | medium | closed | scheduled | The v1→v2 envelope shim used by historical replay. |
| `createPostgresAuditStore` / `buildWhereClauses` / `encodeCursor` / `decodeCursor` / `CreatePostgresAuditStoreDeps` | F | audit-postgres | none | additive | medium | additive | scheduled | admin-sdk's AuditStore impl over the schema. |
| `governanceEventToRow` / `rowToGovernanceEvent` / `GovernanceEventRow` | F | audit-postgres | none | additive | low | additive | scheduled | Mirror row schema for `governance_events`. |
| `createPostgresGovernanceLog` / `governanceInsertParams` / `INSERT_GOVERNANCE_EVENT_SQL` / `PostgresGovernanceLog` / `CreatePostgresGovernanceLogDeps` | F | audit-postgres | none | additive | medium | additive | scheduled | SQL constants exported intentionally so adopters who run their own pool can prepare statements. |
| `PostgresGovernanceWriter` / `PostgresReader` | F | audit-postgres | none | additive | medium | additive | scheduled | Writer + reader interfaces accepted by the SDK adapters. |
| `UPSERT_GUARD_STAT_SQL` / `createPostgresGuardFireStatsStore` / `GuardStatsWriter` / `CreatePostgresGuardFireStatsStoreDeps` | F | audit-postgres | none | additive | low | additive | scheduled | Guard-fire counters mirror the in-memory store. |
| `INSERT_OUTCOME_SQL` / `createPostgresOutcomeLookup` / `createPostgresOutcomeSink` / `loadOutcomesWindow` / `OutcomesWriter` / `CreatePostgresOutcomeSinkDeps` | F | audit-postgres | none | additive | low | additive | scheduled | Retrospective-outcome durable store. |
| Migration files (`packages/audit-postgres/migrations/*.sql`) | F | audit-postgres | none | additive | high | additive | scheduled | Forward-only migrations; every new audit-record field gets its own migration. |

---

## §8 — `@adjudicate/admin-sdk`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| Zod schemas re-exported from `./schemas/*` (`IntentEnvelopeSchema`, `AuditRecordSchema`, `DecisionSchema`, `RefusalSchema`, `BasisCategorySchema`, `DecisionBasisSchema`, `SupersessionSchema`, `AuditPlanSnapshotSchema`, `AuditQuerySchema`, `AuditQueryResultSchema`, `EmergencyStateSchema`, `EmergencyStatusSchema`, `EmergencyHistoryQuerySchema`, `EmergencyUpdateInputSchema`, `GovernanceEventSchema`, `ActorSchema`, `OutcomeBucketSchema`, `OutcomeDistributionQuerySchema`, `OutcomeDistributionResultSchema`, `GuardFireBucketSchema`, `GuardFireStatsQuerySchema`, `GuardFireStatsResultSchema`, `GuardPhaseSchema`, `GuardDescriptionSchema`, `GuardDescriptorSchema`, `GuardMetadataSchema`, `PolicyBundleDescriptorSchema`, `PolicyPhaseDescriptorSchema`, `PolicyPhaseSchema`, `DecisionAccuracyQuerySchema`, `DecisionAccuracyResultSchema`, `ObservedOutcomeSchema`) | F | admin-sdk | none | additive | high | additive | scheduled | Zod-validated read AQI; schemas are the wire contract for tRPC consumers. |
| `createInMemoryAuditStore` / `AuditStore` / `InMemoryAuditStoreOptions` | F | admin-sdk | none | additive | medium | additive | scheduled | The read-side AuditStore interface. |
| `createInMemoryEmergencyStateStore` / `EmergencyStateStore` / `EmergencyUpdateRequest` / `EmergencyUpdateResult` / `InMemoryEmergencyStateStoreOptions` | F | admin-sdk | decision | additive | high | additive | scheduled | Drives kill-switch toggles + audit; the `EmergencyStateStore` interface is shared with audit's Redis impl. |
| `trpc` router (`@adjudicate/admin-sdk/trpc`) | F | admin-sdk | none | additive | medium | additive | scheduled | Optional subpath; per-procedure surface tracked alongside changesets. |
| Next adapter (`@adjudicate/admin-sdk/adapters/next`) | F | admin-sdk | none | additive | low | additive | scheduled | Optional subpath; the integration shape is consumed by `apps/console`. |
| `createTrpcAuthAdapter` / auth surface | E | admin-sdk | none | additive | medium | additive | by-evidence | Auth helpers stay `experimental` until at least one adopter wires non-Console identity; the procedure-level RBAC keys may shift. |

---

## §9 — `@adjudicate/adapter-core`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `createAdjudicatedAgent` / `AdjudicatedAgent` / `AdjudicatedAgentOptions` / `AgentTurnResult` / `AgentEvent` / `AgentOutcome` / `AssistantTurn` / `SendInput` / `ResumeArgs` / `ConfirmArgs` / `ToolUseRequest` / `ToolResultBlock` / `AdopterExecutor` / `AgentLogger` | F | adapter-core | none | additive | high | additive | scheduled | The provider-neutral loop's public surface; new providers depend on the bridge contract being stable. |
| `ProviderBridge<H>` / `ProviderRequest` | F | adapter-core | none | additive | high | closed | none | Three-method contract (`emptyHistory`, `appendUserMessage`, `send`, `appendToolResults`); widening breaks vendor neutrality. |
| `buildEnvelopeFromToolUse` / `classifyIncomingToolUse` / `intentKindToApiName` / `BuildEnvelopeFromToolUseArgs` / `ToolUseClassification` | F | adapter-core | decision | additive | medium | closed | scheduled | Bridge helpers used by every provider adapter. |
| `translateDecision` / `makeOutOfPlanToolResult` / `DecisionTranslation` / `DecisionTranslationContext` / `LoopAction` | F | adapter-core | decision | additive | medium | closed | scheduled | Decision→loop action translator; closed enum on `LoopAction`. |
| `createInMemoryConfirmationStore` / `createInMemoryDeferStore` / `ConfirmationStore` / `PendingConfirmation` | F | adapter-core | decision | additive | medium | additive | scheduled | Test/quickstart persistence shims. |
| `createRedisConfirmationStore` / `CreateRedisConfirmationStoreOptions` / `ConfirmationRedisClient` | F | adapter-core | decision | additive | medium | additive | scheduled | Restart-durable token storage; v0.7 addition. |
| `noopTraceSink` / `createInMemoryTraceSink` / `TraceSink` / `AdapterTraceEvent` / `AdapterTracePhase` / `AdapterPauseReason` | F | adapter-core | none | additive | low | additive | scheduled | Lifecycle-event surface; v0.7. |
| `AdapterError` / `AdapterErrorCode` | F | adapter-core | none | additive | medium | closed | scheduled | Error taxonomy; new codes are MINOR. |

---

## §10 — `@adjudicate/anthropic`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `createAdjudicatedAgent` (Anthropic re-export) | F | anthropic | none | additive | high | additive | scheduled | Thin shim over adapter-core; signature mirrors adapter-core's. |
| `MessageParam`-shaped history type | F | anthropic | none | additive | medium | additive | scheduled | Provider-specific history `H`; opaque to loop. |
| Legacy `AnthropicAdapterError` / `AnthropicAdapterErrorCode` | D | anthropic | none | codemod | low | closed | scheduled | Aliases of `AdapterError` / `AdapterErrorCode`; removal target v2.0. |

---

## §11 — `@adjudicate/openai`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `createAdjudicatedAgent` (OpenAI re-export) | F | openai | none | additive | high | additive | scheduled | Mirrors Anthropic shape; structural `OpenAIChatLikeClient` decouples from `openai` SDK pin. |
| `OpenAIChatLikeClient` (structural interface) | F | openai | none | additive | medium | closed | scheduled | The minimum method set the loop calls; widening the structural shape is MAJOR. |

---

## §12 — `@adjudicate/conformance`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `runConformance` / `ConformanceCheck` / `ConformanceOptions` / `ConformanceReport` / `ConformanceResult` / `DEFAULT_CHECKS` | F | conformance | none | additive | high | additive | scheduled | Adopter-callable invariant harness. |
| Individual checks (`untrustedNeverExecutesCheck`, `replayDeterminismCheck`, `intentHashDeterministicCheck`, `basisVocabularyPurityCheck`, `guardOrderingCheck`, `defaultPolarityCheck`) | F | conformance | none | additive | medium | additive | scheduled | Per-AC export so adopters assemble partial sets. |
| `validatePackManifest` / `crossCheckPackVsManifest` / `PackManifest` / `PackManifestContract` / `PackManifestPackageJson` / `PackManifestQualityTier` / `PackManifestValidation` | F | conformance | none | additive | high | additive | scheduled | npm-convention manifest validator; rev is published-time only. |
| `computePackFingerprint` / `signPackFingerprint` / `verifyPackSignature` / `verifyPackTrust` / `PackFingerprintInput` / `PackSignature` / `PackSignatureAlgorithm` / `PackSignatureVerification` / `PackTrustReport` / `TrustPolicy` / `VerifyPackTrustOptions` | F | conformance | none | additive | high | additive | scheduled | Pack trust primitives (ADR-115); algorithm enum is closed at `ed25519 | rsa-pss-sha256`. |

---

## §13 — `@adjudicate/observability`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `Exporter` / `ExportedEvent` / `ExportedEventKind` / `createInMemoryExporter` / `noopExporter` / `InMemoryExporter` | F | observability | none | additive | medium | additive | scheduled | The single in-process funnel; pluggable transports. |
| `SEMCONV` / `SemconvKey` / `SemconvAttribute` | F | observability | none | additive | high | additive | scheduled | Stable attribute names across minor versions per semver doc. New keys are MINOR; renames are MAJOR. |
| `createOtlpMetricsSink` / `OtlpMetricsSinkOptions` / `createOtlpLearningSink` / `OtlpLearningSinkOptions` / `createOtlpAuditSpanExporter` / `OtlpAuditSpanExporterOptions` | F | observability | none | additive | medium | additive | scheduled | Sink wrappers; in-process transport injection point. |

---

## §14 — `@adjudicate/analyze`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `analyzePolicy` / `AnalyzePolicyArgs` / `Analyzer` / `Tier2Analyzer` / `AnalysisReport` / `Diagnostic` / `DiagnosticCode` / `DiagnosticSeverity` / `SourceLocation` / `AnalyzeOptions` | F | analyze | none | additive | medium | additive | scheduled | Diagnostic catalogue is `AJD-1NN` for Tier 1, `AJD-2NN` for Tier 2; growth via new codes is MINOR. |
| `DEFAULT_ANALYZERS` / individual Tier 1 analyzers (`missingMetadataAnalyzer`, `signalConsistencyAnalyzer`, `basisCodeConsistencyAnalyzer`, `rewriteScopeAnalyzer`, `taintPolicyAnalyzer`, `defaultPolarityAnalyzer`) | F | analyze | none | additive | medium | additive | scheduled | Listed by ID; adopters who pin a default set can disable individual analyzers. |
| `DEFAULT_TIER2_ANALYZERS` / `rewriteScopeAstAnalyzer` / `loadSourceFiles` | F | analyze | none | additive | medium | additive | scheduled | AST analyzer surface; opt-in via `sourceFiles:`. |
| `renderText` / `renderJson` / `renderSarif` | F | analyze | none | additive | low | additive | scheduled | SARIF 2.1.0 is locked. |

---

## §15 — `@adjudicate/migrate`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `runCodemod` / `listCodemods` / `CodemodDescriptor` / `CodemodReport` / `CodemodChange` / `CodemodOptions` | F | migrate | none | additive | medium | additive | scheduled | The codemod runner contract; new codemods registered additively. |
| `nameGuardToWithMetadata` | F | migrate | none | none | low | closed | scheduled | The first shipped codemod. |
| `adjudicate-migrate` CLI binary | F | migrate | none | additive | medium | additive | scheduled | Separate binary so non-CLI adopters can run codemods directly. |

---

## §16 — `@adjudicate/locales-pt-BR`

| Symbol | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| pt-BR `RefusalMessages` map | F | locales-pt-BR | none | additive | low | additive | scheduled | Translation table; additions are MINOR. |

---

## §17 — `@adjudicate/cli`

| Subcommand | Tier | Owner pkg | Replay impact | Migration | Semver | Extension | Tol. | Freeze rationale |
|---|---|---|---|---|---|---|---|---|
| `adjudicate pack init` | F | cli | none | none | low | additive | scheduled | Template scaffolding; new templates are MINOR. |
| `adjudicate pack lint` | F | cli | none | additive | medium | closed | scheduled | Wraps analyzer + conformance harness. |
| `adjudicate pack verify` | F | cli | none | additive | medium | additive | scheduled | Trust primitives wired through; modes `none | best_effort | require_fingerprint | require_signature`. |
| `adjudicate analyze` | F | cli | none | additive | medium | additive | scheduled | Tier 1 + Tier 2 analyzer entry. |
| `adjudicate simulate` | F | cli | basis-only | additive | medium | additive | scheduled | Scenario runner used by Pack test plans. |
| `adjudicate replay` | F | cli | basis-only | additive | medium | additive | scheduled | Wraps `replay()` / `replayWithIntegrity()`. |
| `adjudicate export` | F | cli | none | additive | low | additive | scheduled | JSONL → JSON/CSV; parquet still deferred. |
| `adjudicate visualize` | F | cli | none | additive | low | additive | scheduled | Mermaid emitter consuming the policy descriptor. |
| `adjudicate doctor` | F | cli | none | additive | low | additive | scheduled | Environment sanity checks. |
| `adjudicate dev` | F | cli | none | additive | low | additive | scheduled | Docker-compose harness for Redis + Postgres. |
| `adjudicate reap` | F | cli | none | additive | low | additive | scheduled | Reaps expired park/confirm keys. |
| `adjudicate repl` | F | cli | none | additive | low | additive | scheduled | Interactive evaluator. |
| `adjudicate scenarios generate` | F | cli | none | additive | low | additive | scheduled | Property-style scenario emitter. |
| Exit codes (per command, documented in CLI README) | F | cli | none | additive | low | closed | scheduled | Stable so CI gates can branch on them. |
| Programmatic imports from `@adjudicate/cli` | I | cli | n/a | n/a | n/a | n/a | n/a | The CLI is the contract; do not import its modules. |

---

## §18 — Wire-format shapes

| Artifact | Tier | Spec | Replay impact | Migration | Freeze rationale |
|---|---|---|---|---|---|
| IntentEnvelope v2 JSON Schema | F | `docs/specs/intent-envelope-v2.schema.json` | decision | hand-edit | Wire format; bump is MAJOR, ships with schema + golden vectors. |
| Canonical JSON SHA-256 spec | F | `docs/specs/canonical-json-hash.md` | decision | hand-edit | Normative algorithm (RFC 8785 JCS); deviations are MAJOR. |
| Cross-runtime golden vectors | F | `docs/specs/canonical-hash-vectors.json` | decision | additive | New vectors additive; deletions are MAJOR. |
| Pack manifest schema (`package.json.adjudicate`) | F | `docs/pack-ecosystem/registry-foundations.md` | none | additive | Defined by `validatePackManifest`; new optional fields are MINOR, required-field add is MAJOR. |
| Audit-record canonical-hash recipe | F | `packages/core/src/audit.ts` (`buildAuditRecord`/`verifyAuditRecord`) | none | additive | Hash over `canonical(record \ { auditHash, signature })`. |
| Replay artifact (JSONL one-record-per-line) | F | (de-facto via `@adjudicate/audit`) | none | additive | Schema is `AuditRecord`; one row per line, append-only. |
| Postgres audit schema | F | `packages/audit-postgres/migrations/*.sql` | none | additive | Migration-tracked; columns additive only. |

---

## §19 — Semantic conventions (`SEMCONV`)

All keys live under `adjudicate.*` namespace. Renames are MAJOR; additions are MINOR.

| Attribute | Tier | Cardinality | Freeze rationale |
|---|---|---|---|
| `adjudicate.intent.kind` | F | bounded by Pack | Pack-controlled. |
| `adjudicate.decision.kind` | F | 6 | Closed enum. |
| `adjudicate.taint` | F | 3 | Closed enum. |
| `adjudicate.policy.version` | F | semver | Pack-controlled. |
| `adjudicate.pack.id` | F | bounded | Pack-controlled. |
| `adjudicate.latency.ms` | F | continuous | Numeric — never reported as a label. |
| `adjudicate.intent.hash` | F | unbounded | Trace-correlation only; do not aggregate. |
| `adjudicate.guard.id` | F | bounded by Pack | Pack-controlled. |
| `adjudicate.transition.source` | F | 4 (`pubsub | poll | boot | external`) | Closed; growth is MINOR. |
| `adjudicate.adapter.phase` | F | 6 | Closed. |
| `adjudicate.adapter.iteration` | F | bounded by `maxIterations` | Numeric bucket. |
| `adjudicate.adapter.outcome` | F | 5 | Mirrors `AgentOutcome.kind`. |
| `adjudicate.provider.id` | F | adopter-defined | Stays low-cardinality by adopter discipline. |
| `adjudicate.pause.phase` | F | 5 | Closed. |
| `adjudicate.defer.signal` | F | bounded by Pack | Pack-controlled. |
| `adjudicate.kill_switch.state` | F | 2 (`active | normal`) | Closed. |

---

## §20 — Replay artifacts

| Artifact | Tier | Replay impact | Freeze rationale |
|---|---|---|---|
| `ReplayMismatchKind` union (`decision_changed | basis_set_changed`) | F | basis-only | Closed; additions are MAJOR (new mismatch axis would shift semver enforcement). |
| `IntegrityFailure` union (`audit_hash_missing | audit_hash_mismatch | envelope_hash_mismatch`) | F | none | Closed; additions are MINOR. |
| `ReplayExplainFormat` (`ci-line | summary | operator`) | F | none | Closed; additions are MINOR. |
| `replayWithIntegrity` per-axis quadrant output | F | none | Pinned by `explainReplayReport` rendering. |

---

## §21 — Audit envelope fields

(Already enumerated in §1.1; this section lists wire-version compatibility constraints.)

| Field | Introduced in | Tier | Removal | Notes |
|---|---|---|---|---|
| `version`, `intentHash`, `envelope`, `decision`, `decision_basis`, `resourceVersion?`, `at`, `durationMs` | v1 | F | MAJOR | Original schema. |
| `plan?` | v2 | F | MAJOR | Optional; v1 readers ignore. |
| `supersedes?` | v3 | F | MAJOR | Optional; v1/v2 readers ignore. |
| `kernelIdentity?` | v3 | F | MAJOR | Optional; v1/v2 readers ignore. |
| `policyVersion?` | v4 | F | MAJOR | Optional; v1–v3 readers ignore. |
| `kernelVersion?` | v4 | F | MAJOR | Optional; v1–v3 readers ignore. |
| `auditHash?` | v4 | F | MAJOR | Optional; v1–v3 readers ignore. Replay-with-integrity reports `verified: null` for missing. |
| `signature?` | v4 | F | MAJOR | Optional; pluggable AuditSigner. |

---

## §22 — Provider-neutral contracts

The split between `@adjudicate/adapter-core` (provider-neutral) and the
per-provider packages (`@adjudicate/anthropic`, `@adjudicate/openai`) is
load-bearing for ecosystem portability. The matrix below codifies which
surfaces MUST stay vendor-free.

| Surface | Tier | Vendor-coupling rule |
|---|---|---|
| `adapter-core/loop.ts` | F | No SDK imports beyond `@adjudicate/*`. Test: `pnpm -F @adjudicate/adapter-core why @anthropic-ai/sdk` MUST be empty. |
| `ProviderBridge<H>` shape | F | Three methods only; never widens to include SDK-specific data. |
| `AssistantTurn` shape | F | `textBlocks` + `toolUses` is the entire shape. |
| `ToolUseRequest` / `ToolResultBlock` | F | Provider-neutral; SDK fields stay encapsulated in `H`. |
| History `H` opacity | F | Loop never inspects `H`. Tested by `tests/loop.test.ts` asserting `H = unknown` passes a smoke run. |

---

## §23 — Decision-related API

| Surface | Tier | Notes |
|---|---|---|
| `Decision` union (6 outcomes) | F | Closed algebra; new outcome is MAJOR and ships with replay-shim + analyzer update + Pack-author migration. |
| Decision-kind ordering of guards (`state → taint → auth → business`) | F | Documented in `docs/architecture/decisions.md` and pinned by invariant tests. Reorder is MAJOR. |
| Default-polarity convention (REFUSE) | F | Per the conformance harness's `defaultPolarityCheck`. |
| Fail-closed semantics (throwing guard → SECURITY REFUSE w/ `kernel.GUARD_PANIC`) | F | Pinned by ADR-106. |
| Synchronicity of `adjudicate()` | F | No clock, no I/O, no RNG. Tested by `tests/kernel/invariants/`. |

---

## §24 — Version + package state (advisory)

The current workspace mixes pre-v1 (`0.1.0`) and v1-aspirational
(`1.0.0`) package versions:

| Package | Current pkg-json version | Recommended v1.0 tag |
|---|---|---|
| `@adjudicate/core` | `1.0.0` | `1.0.0` |
| `@adjudicate/audit` | `1.0.0` | `1.0.0` |
| `@adjudicate/audit-postgres` | `1.0.0` | `1.0.0` |
| `@adjudicate/admin-sdk` | `1.0.0` | `1.0.0` |
| `@adjudicate/adapter-core` | `0.1.0` | `1.0.0` |
| `@adjudicate/anthropic` | `0.1.0` | `1.0.0` |
| `@adjudicate/openai` | `0.1.0` | `1.0.0` |
| `@adjudicate/conformance` | `0.1.0` | `1.0.0` |
| `@adjudicate/observability` | `0.1.0` | `1.0.0` |
| `@adjudicate/analyze` | `0.1.0` | `1.0.0` |
| `@adjudicate/migrate` | `0.1.0` | `1.0.0` |
| `@adjudicate/primitives` | `0.1.0` | `1.0.0` (with `createConfirm/Escalate/Idempotency/RewriteGuard` flagged `@experimental`) |
| `@adjudicate/runtime` | `0.1.0` | `1.0.0` |
| `@adjudicate/cli` | `0.1.0` | `1.0.0` |
| `@adjudicate/locales-pt-BR` | `0.1.0` | `1.0.0` |
| `@adjudicate/pack-payments-pix` | `0.1.0` | `1.0.0` (lighthouse Pack at parity with framework) |
| `@adjudicate/pack-identity-kyc` | `0.1.0` | `1.0.0` |
| `@adjudicate/pack-deployments-approval` | `0.1.0` | `1.0.0` |
| `@adjudicate/eslint-config` | `0.0.1` | `1.0.0` |

Rationale: every package in §24 is frozen-tier; aligning version numbers
to `1.0.0` lets adopters pin `^1.0.0` without learning which packages
were promoted independently. The four already at `1.0.0` are a noop
during the cut; the others rev once via a single changeset.

---

## §25 — Identifiers proposed for relabeling pre-v1 cut

Two cleanups that should land with the v1.0 changeset:

1. **`nameGuard`** — currently exported from `@adjudicate/core/kernel`.
   Already `@deprecated since v0.5`; codemod ships. Move tier from
   `frozen` to `deprecation-target` officially in this matrix; removal
   target v2.0.

2. **`AnthropicAdapterError` / `AnthropicAdapterErrorCode`** —
   `@deprecated since v0.6` aliases. Tier `deprecation-target`; removal
   target v2.0. The actual `AdapterError` / `AdapterErrorCode` exports
   remain `frozen` in `@adjudicate/adapter-core`.

3. **`BASIS_CODES.deadline.EXCEEDED` duplicate** — currently exported
   from both the `deadline` and `kernel` categories (the JSDoc notes
   the back-compat history). Tier `deprecation-target` on the
   `kernel.DEADLINE_EXCEEDED` alias; removal target v2.0. Outside the
   kernel-internal path, adopters use `deadline.EXCEEDED`.

---

## §26 — Evidence-gated defaults flip plan

Two adopter-evidence items remain (per [`V0.7-AUDIT-REPORT.md`](../architecture/V0.7-AUDIT-REPORT.md)
§"Operational evidence required before v1.0"). The freeze matrix
treats them as evidence-gated rather than frozen-default:

| Subject | Current default | RC default | v1.0 default trigger |
|---|---|---|---|
| `verifyParkedHash` | `"warn"` | `"warn"` (unchanged) | Flip to `"strict"` once one adopter confirms no legacy blobs in production. Changeset prepared; ships as MINOR. |
| Kill-switch v2 `pollMs` (1000 ms) | 1000 | 1000 | Stays at 1000 unless adopter latency-profile shows pub/sub miss-rate >5%. |
| `AuditEventBus` default channel `audit.event.v1` | `"audit.event.v1"` | `"audit.event.v1"` | Channel name stays; reconnect-backoff is the knob in scope. |
| `maxIterations` on `createAdjudicatedAgent` | 8 | 8 | Holds; adopter override stays the escape valve. |

---

## §27 — Matrix change-management procedure

Any change to this matrix is a release-blocker until the corresponding
prepublish checks update:

1. New row → corresponding type-level snapshot in `packages/core/tests/api-surface.test.ts` (or per-package equivalent) added in the same PR.
2. Tier change (`E → F`, `F → D`, etc.) → CHANGELOG entry referencing the matrix row.
3. Removal (`F` or `E` → `X`) → only on a MAJOR; deprecations.md updated.
4. The freeze-matrix snapshot test (proposed in [Phase 5 plan](#phase-5)) runs in CI and fails if any public surface is undeclared here.

---

## §28 — Open freeze questions (for sign-off)

The following are explicit decisions remaining before the v1.0 changeset is cut:

1. **§4 ConfirmGuard/EscalateGuard/IdempotencyGuard/RewriteGuard** — promote to `frozen` at v1.0 or hold at `experimental` for v1.1? Recommendation: hold `experimental` until at least one external Pack consumes each, freeze proactively at v1.1 once that lands.
2. **§5 `verifyParkedHash` default** — flip `"warn"` → `"strict"` in v1.0 or v1.1? Recommendation: ship v1.0 with `"warn"` and a changelog note; flip in v1.1 once at least two adopters confirm clean profiles.
3. **§6 Distributed kill-switch v2** — promote from `evidence-gated` to `frozen` at v1.0 if production simulation evidence (Phase 2 of this RC effort) satisfies the latency SLO? Recommendation: yes — the surface is frozen; only the *option defaults* gate on evidence.
4. **§6 `AuditEventBus`** — same evidence-gate posture as kill-switch v2. Recommendation: promote at v1.0 if Phase 2 fan-out simulation passes.

All other surfaces are recommended `frozen` at v1.0 cut.
