# @adjudicate/audit

## 3.0.0

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/admin-sdk@3.0.0

## 2.0.1

### Patch Changes

- Updated dependencies [58655cb]
- Updated dependencies [1ea3ed4]
- Updated dependencies [60daeef]
- Updated dependencies [5c1460d]
- Updated dependencies [2892100]
- Updated dependencies [fdc0344]
- Updated dependencies [71658f9]
- Updated dependencies [2ea6156]
- Updated dependencies [ce2cdc5]
- Updated dependencies [0726b56]
- Updated dependencies [7545b17]
- Updated dependencies [fa94fcd]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
- Updated dependencies [9f1e379]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/admin-sdk@3.0.0
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
  - @adjudicate/admin-sdk@2.0.0
  - @adjudicate/core@1.2.0

## 1.0.0

### Major Changes

- 663b572: Audit-sink defaults flip to fail-closed, with durable spill and half-open NATS breaker. Resolves audit-completeness gaps (#23, #24, #25, #28, #43) — moves "audit reconstructability" from configuration property to enforced default.

  **Breaking** — adopters who relied on `multiSink`'s pre-T3 fail-open semantics rename to `multiSinkLossy`. Within the `0.1.0-experimental` semver window this is permitted; the upside is governance-grade audit out of the box.
  - **CHANGED: `multiSink` is now strict** (alias for `multiSinkStrict`). Awaits all sinks via `Promise.allSettled`, throws `AuditSinkError` if any sink rejected. Was: fail-open, swallowed all rejections. The strict semantics is the right default for the framework's "every decision is reconstructable" claim. `multiSinkStrict` remains as a named alias for adopters who already chose strict explicitly.
  - **NEW: `multiSinkLossy(...)`** — explicit fail-open fan-out. The pre-T3 `multiSink` behaviour. Use only when you have explicitly accepted that audit completeness is not load-bearing for the call site (definitely not financial, regulated, or kernel-enforced intent paths).
  - **NEW: sink-of-sinks observability** — `multiSink`/`multiSinkStrict`/`multiSinkLossy` call `recordSinkFailure({ subject: "multiSink[i]", errorClass, ... })` for each rejection synchronously, so a metrics breadcrumb is always recorded even when the throw is swallowed upstream by a lossy fan-out.
  - **NEW: `persistentBufferedSink({ inner, storage, capacity, onOverflow })`** — durable replay queue. In-memory queue up to `capacity`; capacity-driven evictions spill to `PersistentSpillStorage`; on inner recovery, the spill drains FIFO before in-memory. Records survive process restart. Pair with `multiSink` (strict) for governance-grade audit.
  - **NEW: `PersistentSpillStorage` interface** with `append`/`readAll`/`ack`. Adopter-supplied (filesystem JSONL, SQLite, S3 — deployment-specific). Reference `createInMemorySpillStorage()` ships for tests and lightweight adopters.
  - **CHANGED: `persistentBufferedSink.onOverflow` is REQUIRED** — silent loss is the failure mode this sink prevents. The original `bufferedSink` keeps `onOverflow` optional for back-compat.
  - **CHANGED: `NatsSink` half-open close** — after the `failureThreshold` trip, the breaker transitions to `open`. The next emit attempt becomes `half-open`: success → `closed` (counter resets); failure → `open` again with `NatsSinkError` thrown immediately. Pre-T3 reset the counter to 0 after trip, leaving a 9-failure blind spot under sustained outage. Now every emit during a sustained outage is loud.
  - **NEW: 7 unit tests** (`persistent-buffered-sink.test.ts`) covering FIFO drain, capacity eviction, restart recovery, and the 100-record acceptance scenario.
  - **NEW: 2 unit tests** (`sink-burst-failure.test.ts`) for the half-open state transitions.
  - **NEW: 3 unit tests** (`sink.test.ts`) for the new strict default + `multiSinkLossy` parity + sink-of-sinks observability.
  - ADR-102 documents the fail-closed-default rationale.

  **Migration:**
  - `multiSink(natsSink, postgresSink)` previously fail-open → still works but **now throws** on inner failure. Action: either (a) accept the new strict semantic (recommended) or (b) rename to `multiSinkLossy` to preserve the old behaviour.
  - Adopters using `multiSinkStrict` explicitly: no migration needed.
  - Adopters using `bufferedSink`: no migration needed; for governance-grade audit, switch to `persistentBufferedSink` with a real `PersistentSpillStorage` implementation.
  - `NatsSink` adopters: behaviour change is invisible during normal operation. During sustained outages, every emit now throws `NatsSinkError` (pre-T3, only every 10th).

### Minor Changes

- 663b572: Coordination integrity — atomic park, rate-limit rollback, defer-resume cycle cap, ledger race fix. Resolves #35, #36, #37, #38 (partial), #41, top-priority E + I.

  The framework's coordination primitives had three gaps. The kernel's load-bearing claim ("the same intent cannot side-effect twice") sat behind first-writer-wins on the ledger key, which two parallel `adjudicate()` callers could both pass before either recorded the SET-NX. The defer-resume cycle had no global cap on resume-park-resume oscillation. Rate-limit counters incremented on every request — including REFUSEd ones — letting hostile traffic exhaust legitimate users' budgets.
  - **NEW: `RateLimitResult.rollback()`** — return a rollback handle from `checkRateLimit`. When the kernel returns a non-EXECUTE Decision, the executor invokes `rollback` to decrement the counter. Idempotent (safe to call once or skip). No-op when the store does not implement `decrement`.
  - **NEW: `RateLimitStore.decrement?(key)`** — optional method on the store contract. `createInMemoryRateLimitStore` implements it (clamps to zero). Adopter Redis stores wire `DECR`.
  - **NEW: `AdjudicateAndAuditDeps.rateLimitRollback?: () => Promise<void>`** — when supplied, fires after sink emission iff the Decision was non-EXECUTE. Adopters compose with `checkRateLimit().rollback`.
  - **NEW: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** (T1 carryover, surfaced here too) — `adjudicateAndAudit` uses the tag to flip a racing EXECUTE to `ledger_replay_suppressed` when SET-NX collides, closing #37 (parallel callers cannot both side-effect).
  - **NEW: `DEFAULT_MAX_RESUME_CYCLES = 3`** + `ResumeDeferredIntentArgs.maxResumeCycles` — per-`intentHash` resume cycle counter prevents DEFER → resume → DEFER oscillation under a misbehaving signal source. Returns `{ resumed: false, reason: "cycle_cap_exceeded" }` past the cap. Set to `0` to disable; back-compat skip when `redis.incr` is not wired.
  - **NEW: `DeferRedis.incr?` and `DeferRedis.expire?`** — optional Redis methods used by the cycle cap. Old adopters whose client lacks `incr` see no behavioural change (cap silently disabled).
  - **NEW: `ParkRedis.evalIncrCheck?(counterKey, ttlSeconds, max)`** — optional atomic Lua-eval increment-and-check. When wired, `parkDeferredIntent` uses it instead of the INCR-then-check sequence, eliminating the small race window at quota − 1. Adopters whose Redis client exposes `eval` can supply this; the framework falls back to the non-atomic sequence (the existing behaviour) when omitted.
  - **CHANGED: `parkDeferredIntent` EXPIRE refresh.** The pre-T5 implementation set the counter TTL via `EXPIRE NX` — once, on first park. Now the TTL refreshes on every park (no NX flag), so the counter outlives the latest envelope, not the first one's. Resolves #36.
  - **NEW: `taintRank(taint)`** exported from `@adjudicate/core` — used internally by `withBasisAudit` REWRITE-taint regression check (T4 carryover).
  - **NEW: 3 unit tests** (`rate-limit.test.ts`) for `RateLimitResult.rollback` (decrement, idempotency, store-without-decrement no-op).
  - **NEW: 4 unit tests** (`defer-resume-cycle-cap.test.ts`) for default cap, custom cap, disabled cap, back-compat skip.

  **Migration:**
  - Adopters using `checkRateLimit`: `result.rollback` is additive — call it on non-EXECUTE outcomes to fix #41. Old call sites that ignore it continue to work (counter stays advanced).
  - Adopters using `parkDeferredIntent`: counter TTL behaviour changes — refreshes on every park. Implementations whose Redis `expire` rejects calls without the NX flag must accept the new signature (`expire(key, seconds, mode?)` — second arg now optional).
  - Adopters using `resumeDeferredIntent`: no migration needed; the cycle cap is opt-in via wiring `redis.incr`.

- 663b572: Distributed kill switch via polled Redis + IBX_KERNEL_ENFORCE typo guard. Resolves #15, #17, #40, top-priority C.

  The kernel's `setKillSwitch` writes a module-level singleton — a single process can revoke its own authority but nothing propagates across replicas. Multi-replica deployments had no path to halt the fleet without redeploying. T7 ships an opt-in distributed primitive that keeps the kernel's `adjudicate()` strictly synchronous (no async-everywhere) by polling a Redis key into the runtime context's in-process kill-switch.

  Independently, `IBX_KERNEL_ENFORCE`/`IBX_KERNEL_SHADOW` accepted any comma-separated string. A typo like `IBX_KERNEL_ENFORCE=order.confrim` silently left `order.confirm` on the legacy path — exactly the cutover hazard the staged rollout exists to prevent.
  - **NEW: `startDistributedKillSwitch({ redis, key, pollMs?, context?, logger? })`** in `@adjudicate/audit` — polls a Redis key on a `pollMs` cadence (default 1000ms). When the key carries `{active: boolean, reason: string}`, the value flows into `RuntimeContext.killSwitch.set(...)`. Within `pollMs * 2` of a remote write, every replica's `adjudicate()` returns `kill_switch_active`.
  - **NEW: handle methods `trip(reason)` / `clear()` / `stop()`** — convenience wrappers around `redis SET` plus a poller-stop. `stop()` is idempotent and synchronous post-call (timer cleared).
  - **NEW: poll error observability** — Redis GET errors and malformed payloads emit `recordSinkFailure({ subject: "distributed-kill-switch", errorClass: "redis_get" | "redis_payload" })`, plus an optional structured `logger.warn` callback.
  - **NEW: `validateEnforceConfig(knownIntents, env?, warn?)`** in `@adjudicate/core/kernel` — call once at boot. Compares every token in `IBX_KERNEL_SHADOW`/`IBX_KERNEL_ENFORCE` against the known-intent set (typically the union of every installed Pack's `intents`). Unknown tokens emit a `console.warn` plus `recordSinkFailure({ errorClass: "enforce_config_typo" })`. Returns `{ unknownShadow, unknownEnforce }` for further inspection. Wildcard `*` is honoured.
  - **NEW: 8 unit tests** (`distributed-kill-switch.test.ts`) covering apply-on-poll, key-absent no-op, transition handling, trip/clear convenience, redis-error and malformed-payload observability, stop semantics, optional logger.
  - **NEW: 5 unit tests** (`enforce-config.test.ts`) for `validateEnforceConfig` — clean config, shadow typos, enforce typos, wildcard, both-typos.

  **Migration:** opt-in throughout. Existing single-process deployments continue to work via the module-level kill switch; multi-replica deployments call `startDistributedKillSwitch()` at boot. ENFORCE typo detection is a new boot-time check; adopters with `IBX_KERNEL_ENFORCE=*` or no env var continue without change.

- 663b572: Kernel-side audit emission, ledger consult, metrics + learning unification via `adjudicateAndAudit`.

  The pure deterministic `adjudicate(envelope, state, policy) → Decision` was the only kernel entry point — production callers had to bolt on metrics, learning, and audit emission themselves, leaving the framework's "every decision is reconstructable" claim resting on adopter discipline. The new sibling closes that gap by composing the four side-effecting concerns at one call site.
  - **NEW: `adjudicateAndAudit(envelope, state, policy, deps)`** — async wrapper around the sync kernel. Consults the optional Execution Ledger (short-circuiting to a `ledger_replay_suppressed` REFUSE on a cache hit), runs the pure kernel, calls `recordDecision`/`recordRefusal`/`recordOutcome`, builds the `AuditRecord`, and emits it through the supplied `AuditSink`. Returns `{ decision, record, ledgerHit }`. Sink failures propagate; learning-sink failures are absorbed (telemetry never blocks).
  - **NEW: EXECUTE-race fix.** After `adjudicate()` returns EXECUTE, `adjudicateAndAudit` calls `ledger.recordExecution()` and flips the Decision to REPLAY_SUPPRESSED if the SET-NX returned `"exists"`. Two parallel callers can no longer both side-effect for the same `intentHash`.
  - **CHANGED: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** instead of `Promise<void>`. Existing callers that ignored the void return type continue to work; the kernel uses the tag for the race fix above.
  - **MOVED: `Ledger`, `LedgerHit`, `LedgerRecordInput`, `LedgerRecordOutcome`, `AuditSink`** interfaces relocated to `@adjudicate/core` so the kernel can depend on them without inverting the package dependency. `@adjudicate/audit` re-exports them — adopter import paths are unchanged.
  - **NEW: `noopAuditSink()`** — no-op sink for entry points that need a sink-shaped value when audit is intentionally unwired (`adjudicateAndLearn` continues to work this way).
  - **NEW: kernel refusal code `ledger_replay_suppressed`** added to `KERNEL_REFUSAL_CODES` so `withBasisAudit` does not flag it as Pack drift.
  - **NEW: 14 unit tests** (`tests/kernel/adjudicate-and-audit.test.ts`) covering EXECUTE/REFUSE Decision passthrough, ledger hit short-circuit, ledger race, sink-strict propagation, learning-sink absorption, plan snapshot.
  - **NEW: 1 property test** (`tests/kernel/invariants/audit-emission.property.test.ts`, 1 000 runs) — every `adjudicateAndAudit` call emits exactly one AuditRecord whose decision matches the returned Decision.
  - ADR-101 documents the sync/async split rationale.

  **Migration:** `adjudicate()` is unchanged — replay/property tests/legacy callers continue to use it. Production paths should migrate to `adjudicateAndAudit({ sink, ledger? })`. `adjudicateAndLearn` is preserved (no behavior change).

- 663b572: Replay harness now classifies basis drift, not just `decision.kind` divergence.

  Before: `replay()` reported `report.matched === report.total` whenever every record's stored `decision.kind` matched the re-adjudicated kind. A Pack patch that renamed a refusal code, changed a basis category, or added a new pass-basis without changing the kind passed replay silently — exactly the governance-drift signal the framework's strongest claim depends on detecting.
  - **NEW: `ReplayMismatchKind` union** — `"DECISION_KIND" | "BASIS_DRIFT" | "REFUSAL_CODE_DRIFT"`. Reports route to different runbook severities.
  - **CHANGED: `ReplayMismatch` shape** gains `kind` and an optional `basisDelta: { missing, extra }` carrying the symmetric difference of the flat-set comparison. The previous `{ intentHash, expected, actual }` fields are preserved.
  - **Comparison rule (in this priority order):**
    1. Different `decision.kind` → `DECISION_KIND` mismatch.
    2. Same kind, different flat-set of `category:code` basis strings → `BASIS_DRIFT`.
    3. Both REFUSE, same kind + basis flat-set, different `refusal.code` → `REFUSAL_CODE_DRIFT`.
    4. Otherwise matched.
  - **Flat-set semantics:** order is ignored; `basis.detail` is ignored. Matches the `Postgres.intent_audit.decision_basis` shape (text[] of `category:code`).
  - **NEW: `classify(intentHash, expected, actual)`** — pure helper exported alongside `replay()` so adopters can write cross-record audits without re-implementing the rule.
  - **NEW: 11 unit tests** (`packages/audit/tests/replay.test.ts`) — basis order tolerance, basis.detail tolerance, missing-and-extra delta, BASIS_DRIFT precedence over REFUSAL_CODE_DRIFT, plus the acceptance test from the plan (5-record corpus with one swapped refusal code).
  - **NEW: 1 property test** (`packages/core/tests/kernel/invariants/replay-determinism.property.test.ts`, 5 000 runs) — replaying the same policy against any (taint × default × guard × payload) tuple produces a Decision that matches the stored one. The classifier rule is duplicated inline in the property test to avoid a package-graph cycle (audit → core).

  **Migration:** consumers that destructured `mismatches[i].expected/actual` continue to work. Consumers that switched on `mismatches[i].kind` get a richer signal: BASIS_DRIFT and REFUSAL_CODE_DRIFT are now distinguishable, and the `basisDelta.missing/extra` arrays surface the exact codes that drifted.

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
  - @adjudicate/admin-sdk@1.0.0
