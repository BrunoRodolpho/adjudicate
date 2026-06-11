# @adjudicate/admin-sdk

## 2.2.0

### Minor Changes

- b94372b: Add the policy-manifest builder: `describePack`, `describeInstalledPacks`, `computeManifestDigest`, and `diffPolicyManifests`. The `PolicyManifest` is a JSON-serialisable superset of `describePolicyBundle` that captures, per Pack and per intent kind, the taint floor, the phase-ordered guard chain (with resolved names, structured descriptions, and opt-in source locations), basis codes, DEFER signals, tool bindings, and statically-inferred decision outcomes — plus a stable content `digest` for drift diffing. Powers the rule-provenance tree in the operator console. No `@adjudicate/core` changes (determinism fence untouched).

  `@adjudicate/admin-sdk` gains the matching `PolicyManifestSchema` wire schema (+ `PolicyManifestParsed`) and a `governance.policyManifest` tRPC procedure with an optional `AdminContext.policyManifest` field (feature-detected via `PRECONDITION_FAILED`, mirroring `describePolicy`). admin-sdk carries no `@adjudicate/analyze` dependency — the schema is re-declared permissively per the established pattern.

## 2.1.0

### Minor Changes

- 58655cb: feat(adapter-core): add MemoryStore (in-memory + redis) + `memoryStore`/`enrichContext`/`deriveMemoryWriteback` options — cross-session memory enriches the planner/renderer context UPSTREAM of the envelope; the kernel decision is unchanged (ADR-126).

  feat(admin-sdk): add `memory.bySession` for the console Session Memory panel.

- 1ea3ed4: admin-sdk AI-BOM Explorer surface (ADR-130). New read-only `pack.aiBomList` (returns one `AiBomSummary` per wired Pack — packId@version, model, healthTier/healthScore, conformance pass/passedCount/total, fingerprint, bomDigest, frameworks, generatedAt, `signed`) and `pack.aiBomById` (input `{ packId, packVersion? }` → the full `AiBom`; deterministic latest pick by semver-max with `bomDigest` tiebreak when version omitted). New schemas `AiBomSummarySchema`/`AiBomListResultSchema`/`AiBomByIdQuerySchema` and pinned element schemas `AiBomToolRefSchema`/`AiBomRagRefSchema` (+ inferred types), plus `toAiBomSummary`/`pickLatestAiBom` helpers. `AiBomSchema.tools`/`.rag` element shapes are tightened from permissive records to the pinned refs — additive validation within `bomVersion "1.0"` (the producer already only emits these fields; no wire-format change). New `AdminContext.aiBoms?: ReadonlyArray<AiBomParsed>`; the existing `aiBom?` field and `pack.aiBom` are unchanged, and both new procedures fall back to `[ctx.aiBom]` when only the legacy single BOM is wired. Like `pack.aiBom`, the new procedures require no actor (the BOM is non-sensitive) and never surface a signature value (only `signed: boolean`). No closed-enum widening, no kernel/wire/canonical-hash change. Powers the console `/ai-bom` Explorer page and the public web `/transparency/ai-bom` view.
- 60daeef: feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

  feat(cli): add `adjudicate pack bom <path>`.

  feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.

- 5c1460d: feat(approval-engine): add `createRedisApprovalRegistry` (+ `CreateRedisApprovalRegistryOptions`, `ApprovalRedisClient`) — a Redis-backed `ApprovalRegistry` implementing the same `put`/`get`/`list`/`markResolved` interface as the in-memory reference, for restart-durable approval projections. Stores ONLY the display projection (never the authoritative envelope blob — that stays in the single-use ConfirmationStore). `markResolved` is a guarded, idempotent read-modify-write; the residual GET+SET TOCTOU is a display-projection race only (the real single-use guarantee lives in `ConfirmationStore.take()` inside `agent.confirm()`). The adopter injects a minimal `set/get/del/keys` client — no hard dependency on a concrete Redis client. ADR-136.

  feat(admin-sdk): add read-only `approval.history` and `approval.chain` queries (+ `ApprovalHistoryQuery`/`ApprovalHistoryEntry`/`ApprovalHistoryResult` and `ApprovalChainQuery`/`ApprovalChainStepKind`/`ApprovalChainStep`/`ApprovalChainResult` schemas; optional `AdminContext.approvalPort.history`/`.chain`). `approval.history` projects resolved/expired approvals from the registry; `approval.chain` walks the FROZEN `AuditRecord.supersedes` lineage (confirmation_resolved / defer_resumed) into request → resolved → resumed. Both are actor-gated and `PRECONDITION_FAILED` when the optional port members are unwired (`approval.list`/`resolve` unchanged). `resolvedBy`/`actor` are CLAIMED (forgeable header until OIDC); the chain surfaces token PRESENCE only, never the value. ADR-136.

- 2892100: feat(approval-engine): new @adjudicate/approval-engine — reference human-approval orchestration for REQUEST_CONFIRMATION flows with pluggable channels (webhook, console-log) and a replay-safe resume via adapter-core confirm(); ApprovalRegistry projection separate from the single-use ConfirmationStore (ADR-122).

  feat(admin-sdk): add `approval.list` / `approval.resolve` for the console Approvals view.

- 71658f9: Behavioral Drift history surface (ADR-132). `@adjudicate/drift` gains `createDriftHistory({ capacity? })` — a bounded, deterministic snapshot-history accumulator. `record(snapshot, at)` appends a per-dimension TVD + alert-count roll-up of a `DriftSnapshot`, stamped with a CALLER-SUPPLIED `at` timestamp + a monotonic, eviction-stable `seq`; `view()` returns `{ capacity, count, dropped, entries }` (oldest → newest). It is a fixed-capacity ring buffer (default 100), oldest evicted first, with `dropped` exposing eviction so a dashboard never silently loses history. NO wall-clock and NO RNG on any path — the package never reads a clock; timestamps are supplied by the adopter (same clock-free posture as `DriftSnapshot`). New types `DriftHistory`/`DriftHistoryEntry`/`DriftHistoryDimensionEntry`/`DriftHistoryView`/`DriftHistoryOptions`.

  `@adjudicate/admin-sdk` gains the read-only `governance.driftHistory` query (input `{ limit }`, default 100, max 500 → windows the timeline to the last N retained points) returning `DriftHistoryResultSchema` (`{ schemaVersion: 1, capacity, count, dropped, entries }`, each entry `{ at, seq, totalObserved, maxTvd, alertCount, dimensions: { dimension, tvd, alertCount }[] }`). New schemas `DriftHistoryEntrySchema`/`DriftHistoryDimensionEntrySchema`/`DriftHistoryResultSchema`/`DriftHistoryQuerySchema` (+ inferred types) re-declare the `DriftHistoryView` shape as Zod with NO dependency on `@adjudicate/drift` — the same dependency-free posture `BehavioralDriftResultSchema` takes; `DriftDimensionNameSchema` is now also exported. New optional `AdminContext.driftHistory?: { query(input: DriftHistoryQuery): DriftHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `driftDetector`/`governance.behavioralDrift`. No actor required (read-only aggregates). The existing single-point `governance.behavioralDrift` + `BehavioralDriftResultSchema` and `AdminContext.driftDetector` are unchanged. No closed-enum widening (`DriftDimension`/`DriftSignalKind` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/drift` page (Active Drifts + Dimensions + Timeline + a labelled Operational sub-view) and the public web `/transparency/drift` status badge.

- 2ea6156: feat(drift): new @adjudicate/drift package — behavioral/statistical drift detection over the AuditEventBus (total-variation-distance, new-category, proportion-spike) with bounded cardinality and deterministic count-based windows (ADR-119).

  feat(admin-sdk): add `governance.behavioralDrift` returning a drift snapshot for the console Behavioral Drift panel.

- 0726b56: admin-sdk `governance.commandRisk` + `governance.commandRiskEvents` — command-risk aggregation surface (ADR-134, follows ADR-123). New `createCommandRiskStatsHandler` over the existing `AuditStore` folds command-risk dispositions into `(category × disposition)` buckets (max 9), reading both guard channels — `validation.command_blocked`→`refuse`, `validation.command_flag_stripped`/`command_sanitized`→`rewrite`, and `business.rule_satisfied`/`rule:"command_risk_confirm"`→`confirm`. New `createCommandRiskEventsHandler` returns the per-record drill-down (`intentHash`, `at`, `intentKind`, `decisionKind`, `category`, `disposition`) newest-first, with optional `category`/`disposition` filters, a `limit` (default 200, max 500) and a `truncated` flag; it requires an authenticated actor (record-level data). New schemas `CommandRiskQuerySchema`/`CommandRiskResultSchema`/`CommandRiskBucketSchema`/`CommandRiskCategorySchema`/`CommandRiskDispositionSchema` + `CommandRiskEventsQuerySchema`/`CommandRiskEventSchema`/`CommandRiskEventsResultSchema` (+ inferred types). The two enums are **closed** (category mirrors the kernel `CommandRiskCategory` minus `safe`; disposition is one-to-one with the three guard paths) and cannot widen without a governed kernel change. **Redaction by construction:** the guard threads the RAW command string (which may contain live secrets) into the audit detail, but neither handler reads it and no schema has a field that could carry it — the `.output()` Zod gate makes leaking command text or matched rule ids impossible. Powers the console Command Risk page and the public web command-risk transparency view (category distribution only). The guard, basis codes, and kernel are unchanged.
- 7545b17: feat(conformance): add Configuration Integrity Seal — sealPackConfig / verifyConfigSeal pin the introspectable config surface (declarative + guard metadata + probed taint minimums + basis codes) under a signature (ADR-121). Factored shared canonicalJson into its own module.

  feat(adapter-core): config-seal loop gate — verifies once per agent instance before the first adjudication; on mismatch refuses the turn (new `refused` AgentOutcome + `config_seal_violation` trace) and can engage the kill switch.

  feat(core): add `kill.SEAL_MISMATCH` basis code.

  feat(admin-sdk): add `governance.configSealStatus` for the console seal panel.

- fa94fcd: admin-sdk Configuration Integrity surface (ADR-131). New read-only `governance.configSealStatusAll` (returns `{ entries: PackConfigSealEntry[] }` — one entry per installed pack: `packId`, optional `packVersion`, the existing per-pack `ConfigSealReport` verbatim, and a derived structured `violations[]`) and `governance.killSwitchTimeline` (exposes the already-existing pure producer `analyzeKillSwitchTimeline` from `@adjudicate/audit` over tRPC — the analyzer runs adopter-side and the report is threaded as a read). New schemas `PackConfigSealEntrySchema`/`ConfigSealStatusAllResultSchema`, `SealViolationSchema`/`SealViolationKindSchema` (closed enum `digest_mismatch | signature_failed | signature_missing | policy_error`), and `KillSwitchTimelineReportSchema`/`KillSwitchStabilityClassSchema`/`KillSwitchEventSourceSchema` (structural re-declarations of `@adjudicate/audit`'s closed types — admin-sdk carries no dependency on that package), plus inferred types and the reference helper `deriveSealViolations(report)` that maps report fields to structured violations with the `kill.SEAL_MISMATCH` (`"seal_mismatch"`) linkage on digest mismatches. New optional `AdminContext.configSealReports?: ReadonlyArray<PackConfigSealEntryParsed>` and `AdminContext.killSwitchTimeline?: KillSwitchTimelineReportParsed`; both throw PRECONDITION_FAILED when absent (feature-detectable). The existing single-pack `governance.configSealStatus` + `ConfigSealReportSchema` and `AdminContext.configSealStatus` are unchanged. No actor required (read-only aggregates). No closed-enum widening, no kernel/wire/canonical-hash change. Powers the console `/integrity` page (active seals + violations + kill-switch stability timeline) and the public web `/transparency/integrity` badge.
- 464db38: feat(primitives): add `createDataClassificationGuard` (PII/PHI redaction & refusal). REWRITE masks matched payload fields (taint preserved); REFUSE blocks. Runtime sensitivity tier + redacted fields ride in `DecisionBasis.detail`.

  feat(core): widen `GuardDescription` with the additive `data_classification` variant; add `validation.PII_DETECTED/PII_REDACTED/PII_BLOCKED` basis codes (ADR-117).

  feat(analyze): AJD-104 also flags a `data_classification` REWRITE guard with empty `scannedFields`.

  feat(admin-sdk): add `governance.piiClassificationStats` — aggregates data-classification dispositions by (sensitivityLevel × disposition) for the console.

- 9f1e379: admin-sdk `governance.piiEvents` — event-level data-classification drill-down (ADR-129). New `createPiiEventsHandler` over the existing `AuditStore` returns individual PII disposition events (`intentHash`, `at`, `intentKind`, `decisionKind`, `sensitivityLevel`, `disposition`) newest-first, with optional `sensitivityLevel`/`disposition` filters, a `limit` (default 200, max 500) and a `truncated` flag. New schemas `PiiEventsQuerySchema`/`PiiEventSchema`/`PiiEventsResultSchema` (+ inferred types) reuse the existing `SensitivityLevel`/`PiiDisposition`/`DecisionKind` enums (no new/widened enums). The event row carries no redacted values or field paths — redaction by construction. Requires an authenticated actor (record-level data). Powers the console PII Events page and the public web transparency view; the existing aggregate `governance.piiClassificationStats`, the guard, and the kernel are unchanged.
- 1f091ef: feat(analyze): add Tier-3 PolicyCoherenceAnalyzer (AJD-301) — structural coherence checks (phantom/unreachable intent, system-taint contradiction, threshold-conflict note, planner-probe error) via pure pack inspection + planner probing; new `plannerProbes`/`tier3Analyzers` analyze options (ADR-125).

  feat(admin-sdk): add `governance.policyCoherence` for the console Policy Coherence panel.

- 75e85df: Red-team run-history surface (ADR-133). `@adjudicate/red-team` gains three additive, PURE helpers: `digestRedTeamReport(report)` — a deterministic "0x…" CONTENT digest (canonical-JSON sha256 via `@adjudicate/canonical`) over a report's meaningful fields (pack id, per-result name+vector+status sorted, summary counts), EXCLUDING any timestamp, so two identical-policy runs collide to one digest regardless of when they ran; `runRedTeamAcrossPacks(packs, opts)` — runs the full suite (all three vectors) against many packs in input order; and `createInMemoryRedTeamHistoryStore({ capacity? })` — a bounded, deterministic run-history store. `record(report, at)` appends one immutable `RedTeamRunRecord = { digest, at, packId, summary }`, stamped with a CALLER-SUPPLIED `at`, IDEMPOTENT on `(packId, digest)` (re-recording the same content is a no-op), with a per-pack FIFO ring (default capacity 500); `view(query?)` returns `{ runs, trend }` — runs newest-first per pack (optionally filtered by `packId` / windowed by `limit`) plus a chronological `RedTeamTrendPoint[]` (`at, packId, total, defended, escaped, errors`). NO wall-clock and NO RNG on any path — digests are timing-excluded, timestamps are caller-supplied (same clock-free posture as the existing `runRedTeam`/`generateAllVectors`). New types `RedTeamRunRecord`/`RedTeamTrendPoint`/`RedTeamHistoryView`/`RedTeamHistoryQuery`/`RedTeamHistoryStore`/`RedTeamHistoryOptions`. New `@adjudicate/canonical` dependency for the digest.

  `@adjudicate/admin-sdk` gains the read-only `governance.redTeamHistory` query (input `RedTeamHistoryQuerySchema` `{ packId?, limit? }`, `limit` capped at 500 → windows to the last N runs per pack) returning `RedTeamHistoryResultSchema` (`{ runs: RedTeamRunRecord[], trend: RedTeamTrendPoint[] }`). New schemas `RedTeamRunRecordSchema` (`{ digest: /^0x[0-9a-f]+$/, at: datetime, packId, summary }`, reusing the frozen `RedTeamSummarySchema`), `RedTeamTrendPointSchema`, `RedTeamHistoryResultSchema`, `RedTeamHistoryQuerySchema` (+ inferred types) re-declare the `RedTeamHistoryView` shape as Zod with NO dependency on `@adjudicate/red-team` — the same dependency-free posture `RedTeamReportSchema` (ADR-118) takes. New optional `AdminContext.redTeamHistory?: { view(input): RedTeamHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `redTeamReport`/`governance.redTeam`. No actor required (read-only aggregates). The existing single-shot `governance.redTeam` + `RedTeamReportSchema` and `AdminContext.redTeamReport` are unchanged. No closed-enum widening (`AttackVector`/`RedTeamStatus` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/red-team` page (Attack categories + Pass/fail + Trend) and the public web `/transparency/red-team` clean/regressed defenses badge.

- b642424: feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

  feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

  feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.

- 1e0058b: feat(primitives): add `createTokenBudgetGuard` — pure guard that REFUSE/DEFERs on per-session/per-tenant token budgets, reading the counter from adopter state S (ADR-120).

  feat(adapter-core): `AssistantTurn.usage` + `onTokenUsage` hook surface provider token usage per turn (the adopter folds it into state S).

  feat(anthropic,openai): map provider token usage onto `AssistantTurn.usage`.

  feat(admin-sdk): add `governance.tokenBudget` for the console Token Budget panel.

- 6b291be: Token Governance surface (ADR-135, follows ADR-120). `@adjudicate/adapter-core` gains a token-usage TELEMETRY store: the `TokenUsageStore` interface + `createInMemoryTokenUsageStore({ sessionBudget?, perTenantBudget?, perSessionBudget?, perTenantBudgets?, maxSessions?, maxEvents?, capacity? })`, mirroring the existing `createInMemoryMemoryStore`/`createInMemoryConfirmationStore` (Map-backed ref impl, opportunistic LRU bound, fixed-capacity event ring). Fed by the adapter loop's `onTokenUsage` hook via `record(sample)`, it accumulates per-session AND per-tenant cumulative consumption against configured caps and appends a bounded `TokenExhaustionEvent` when a counter CROSSES its cap (once per crossing, not per over-budget sample); reads via `sessions()` / `tenants()` / `exhaustionEvents()` / `totalConsumed()`. New types `TokenUsageSample`, `TokenBudgetConfig`, `SessionConsumption`, `TenantConsumption`, `TokenExhaustionEvent`, and the filter types. **The store is strictly OUTSIDE the determinism boundary — it is TELEMETRY and NEVER a kernel input.** Enforcement stays in `createTokenBudgetGuard` (input is adopter state S, not this store). NO wall-clock on any recorded value (timestamps are caller-supplied — `at` is used verbatim; the only `Date.now()` is the same LRU sweep the memory store already does) and NO RNG (event ids are a monotonic `evt:<n>` sequence, not `randomUUID`), so the store is reproducible across runs/replays. Session counters are LRU-bounded (default 10_000) and events ring-bounded (default 10_000) so unbounded session-id churn cannot grow memory — and the per-tenant aggregate is the backstop for session-churn budget evasion (it aggregates across all of a tenant's sessions regardless of churn). Redis is a noted follow-up (the in-memory store + interface ship now).

  `@adjudicate/admin-sdk` gains the read-only `governance.tokenBudgetByTenant` query (input `TokenBudgetTenantQuerySchema` `{ tenantId?, since?, eventLimit≤500 }`) returning `TokenBudgetByTenantResultSchema` (`{ tenants[], exhaustionEvents[], totalConsumed }`); throws PRECONDITION_FAILED when `ctx.tokenBudget.queryByTenant` is absent (feature-detectable), mirroring `governance.tokenBudget`. New schemas `TokenScopeSchema` (CLOSED `session`|`tenant`), `TokenBudgetTenantSchema`, `TokenExhaustionEventSchema`, `TokenBudgetTenantQuerySchema`, `TokenBudgetByTenantResultSchema` (+ inferred types) re-declare the store's read-model as Zod with NO dependency on `@adjudicate/adapter-core`. `TokenBudgetResultSchema` gains ADDITIVE OPTIONAL `tenants?`/`exhaustionEvents?` fields — the existing session-only shape and `governance.tokenBudget` stay byte-compatible. `AdminContext.tokenBudget` widens additively with an optional `queryByTenant` (`query` kept for back-compat; both optional so single-method adopters still typecheck). `ActorSchema` gains an ADDITIVE OPTIONAL `tenantId` and `extractActor` reads `x-adjudicate-actor-tenant` — the minimal multi-tenant dimension that realizes the pre-existing `AuditQuerySchema.tenantScope` convention; single-tenant adopters omit it. No kernel change, no closed KERNEL-enum widening (Decision-6/Taint/IntentActor/BasisCategory unchanged; the only new enum is admin-sdk-local and closed), no canonical-hash change. `TokenExhaustionEvent` is a telemetry read-model — NOT an `AuditRecord` field and NOT a `GovernanceEvent` taxonomy entry. Powers the console `/tokens` Token Governance section (tenant budgets, session budgets, exhaustion timeline) and the public web `/transparency/tokens` aggregate-only, id-free, banded burn-down.

### Patch Changes

- 570db36: feat(core): AuditRecord v5 adds optional `metadata` (EXCLUDED from auditHash) + `attachAuditMetadata` + an `adjudicateAndAudit({ metadataProvider })` seam (ADR-124).

  feat(observability): hallucination scoring — `createHallucinationMetadataProvider` + `bucketHallucinationScore` + `adjudicate.hallucination.score`/`.bucket` semconv attributes.

  fix(admin-sdk,audit-postgres): accept AuditRecord v5 (schema + row mapping).

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

## 2.0.0

### Minor Changes

- 9e65871: Sibling packages to `@adjudicate/core@1.1.0` for the audit-2026-05-24 F2
  release.

  **`@adjudicate/audit`** — `REASON_KEYS` and `emptyReasonCounts()` extended
  to include `"lgpd_scrub"`. Without this version bump, consumers pinning
  `^1.0.0` would receive `audit@1.0.1` whose `reasonCounts[r]++` against the
  new reason yields `undefined++` = `NaN`, corrupting downstream operator
  dashboards.

  **`@adjudicate/admin-sdk`** — `SupersessionReasonSchema` Zod enum extended
  to include `"lgpd_scrub"`. Without this version bump, consumers pinning
  `^1.0.0` would receive `admin-sdk@1.0.0` whose schema rejects the new
  literal with `"Invalid enum value"`, 500-ing every admin tRPC route that
  wraps audit queries.

  Both packages remain backwards-compatible at the runtime layer (new
  literal is purely additive to the union). See `RELEASE-1.1.0.md` for the
  coordinated release sequence.

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

### Patch Changes

- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/core@1.2.0

## 1.0.0

### Minor Changes

- Remove `AuditPlanSnapshotSchema.forbiddenConcepts` from the wire schema. The corresponding field is removed in `@adjudicate/core`.

### Patch Changes

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
