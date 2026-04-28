# @adjudicate/audit

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

- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/core@1.0.0
