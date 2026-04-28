# @adjudicate/core

## 1.0.0

### Major Changes

- 663b572: Envelope v2 — nonce-based intentHash + auth-after-taint kernel reorder + v1 replay compat. Resolves #5, #7 (partial), #13, top-priority G.

  **Breaking** — `INTENT_ENVELOPE_VERSION` bumps to `2`. v1 envelopes are REFUSEd at runtime with `schema_version_unsupported`. Live writes are v2; pre-T8 audit rows replay via `legacyV1ToV2`. Within the `0.1.0-experimental` window, this is a deliberate fail-loud cutover that retires the most-cited foot-gun in the framework.

  The pre-T8 hash recipe `(version, kind, payload, createdAt, actor, taint)` made `createdAt` load-bearing for ledger dedup. An adopter rebuilding an envelope on retry without preserving `createdAt` silently produced a different `intentHash` — duplicate webhook deliveries re-executed. The README warned about this; the type system did not. T8 promotes idempotency to a first-class field.
  - **CHANGED: `IntentEnvelope` schema v2.** New `nonce: string` field (idempotency key, hashed). `createdAt` becomes descriptive metadata only (not hashed). Hash recipe is now `(version, kind, payload, nonce, actor, taint)`.
  - **CHANGED: `BuildEnvelopeInput.nonce` is required.** Adopters supply `crypto.randomUUID()` for first attempts and the SAME value for retries. `createdAt` remains optional; it can vary freely without affecting the hash.
  - **CHANGED: kernel evaluation order is `state → taint → auth → business`** (was `state → auth → taint → business`). UNTRUSTED inputs short-circuit before any auth side effect runs. Refusal-code distribution shifts in audit history: taint refusals on UNTRUSTED inputs that would also have failed auth now surface the taint refusal instead. Net safer; replay drift on the auth-vs-taint path may surface as `BASIS_DRIFT` for one corpus.
  - **NEW: `legacyV1ToV2(row)`** in `@adjudicate/audit-postgres` — synthesizes a v2 envelope from a v1 `intent_audit` row. Uses `row.nonce` when present (v2 row), falls back to the stored envelope's `nonce`, then to `createdAt` for true v1 rows. Replay produces the same Decision under unchanged policy; the synthesized `intentHash` does NOT match the v1 row's stored hash (different recipe) but the kind/basis comparison is meaningful.
  - **NEW: migration `003-add-nonce.sql`** adds the `nonce TEXT NULL` column plus a partial index on non-null nonces. Idempotent (`IF NOT EXISTS`).
  - **CHANGED: `IntentAuditRow.nonce: string | null`** carried through `recordToRow` and `rowToRecord`.
  - **NEW: `taintRank(taint)` exported** from `@adjudicate/core` (T4 carryover) — used by `withBasisAudit` for REWRITE taint regression detection.
  - **CHANGED: `replayEnvelopeFromAudit` reads `record.envelope.nonce`** with `record.envelope.createdAt` as a fallback for pre-T8 records.
  - **CHANGED: pix-payments-pix REWRITE site** plumbs `nonce: envelope.nonce` (preserves the original idempotency key through clamping).
  - **NEW: 6 unit tests** (`v1-replay-compat.test.ts`) covering nonce sourcing precedence, createdAt preservation, intentHash divergence under different recipes.
  - **NEW: 2 property tests** (`v2-hash-stability.property.test.ts`, 5 000 + 5 000 runs) — invariance under `createdAt` perturbation; differentiation under `nonce` perturbation.
  - **CHANGED: kernel ordering tests** in `adjudicate.test.ts` updated to assert the new pass-basis sequence and the new auth-after-taint short-circuit.
  - ADR-104 documents the cutover.

  **Migration:**
  - Adopters using `buildEnvelope({...})` without `nonce`: TypeScript error. Add `nonce: crypto.randomUUID()` for first attempts; preserve the value across retries.
  - Adopters with v1 envelopes in flight at deploy time: those envelopes will be REFUSEd by the new kernel. Quiesce v1 producers, drain in-flight messages, then deploy.
  - Adopters with v1 audit rows: `legacyV1ToV2` enables replay reads through the standard `replay()` harness without touching the storage.
  - Adopters whose auth guards had side effects: those side effects no longer fire on UNTRUSTED-refused intents. Most adopters benefit; a few who relied on auth-side logging for UNTRUSTED inputs need to move that logging to the taint pre-gate.

- 663b572: Pack conformance — REFUSE-by-default, Plan⊆Pack validation, drift across all decision kinds. Resolves #1, #3, #4 (partial), #18, #20, top-priority D + F.

  The pre-T4 conformance surface only caught REFUSE refusal-code drift, accepted any `policy.default`, and did not validate that a planner's `allowedIntents` matched the Pack's declared `intents`. The strongest claim of the framework — "the LLM cannot propose intents the Pack does not handle" — relied on adopter discipline. T4 closes the gaps.

  **Breaking** — Packs that ship `policy.default = "EXECUTE"` without explicit opt-in now throw `PackConformanceError`. Within `0.1.0-experimental` this is a deliberate posture flip toward fail-safe defaults.
  - **NEW: `assertPackConformance(pack, options?)` rejects `policy.default = "EXECUTE"`** unless `options.allowDefaultExecute === true`. The framework's recommended polarity is REFUSE; an EXECUTE default is the most direct authority leak and should be a deliberate, documented choice. Read-only Packs (search, summary) can opt in.
  - **NEW: `installPack(pack, { allowDefaultExecute: true })`** threads the option through to conformance.
  - **NEW: `assertPlanSubsetOfPack(plan, pack)`** — pure helper that throws `PlanConformanceError` if `plan.allowedIntents` contains an intent absent from `pack.intents`. Catches a planner advertising a mutation the Pack never claimed to handle (typically a renaming regression).
  - **NEW: `safePlan(planner, classification, pack?)`** — third optional arg. When supplied, every `plan()` call asserts both `assertPlanReadOnly` (existing) and `assertPlanSubsetOfPack` (new). The pre-T4 two-arg form continues to work; only adopters who pass a pack get the stricter check.
  - **NEW: `PlanConformanceError.intentsLeaked`** — companion to `mutatingToolsLeaked`. Lists intents that violated the pack-subset relation.
  - **NEW: optional `Pack.signals: readonly string[]`** — DEFER signal vocabulary. When declared, every DEFER Decision the Pack emits must use a `signal` from this list; `withBasisAudit` records `defer_signal_drift` for unknown signals. Cross-pack signal collision detection is left to a future Phase-2 registry.
  - **CHANGED: `withBasisAudit` extends drift detection across all decision kinds.** Previously it only inspected REFUSE; now every basis whose `category:code` is outside `BASIS_CODES` records `basis_vocabulary_drift`, REWRITE with `rewritten.taint` of higher rank than `envelope.taint` records `rewrite_taint_regression`, and DEFER with a signal outside declared `pack.signals` records `defer_signal_drift`. Decisions are still **not** blocked — drift is observed, not enforced.
  - **NEW: `taintRank(taint)` exported** from `@adjudicate/core` so adopters can perform their own rank comparisons. Used internally by `withBasisAudit`.
  - **NEW: `KERNEL_REFUSAL_CODES` gains `"ledger_replay_suppressed"`** (T1 carryover) so `withBasisAudit` does not flag it as Pack drift.
  - **NEW: 6 unit tests** (`pack-conformance.test.ts`) for default-EXECUTE rejection, signals shape validation, basis-vocabulary drift on EXECUTE.
  - **NEW: 9 unit tests + 1 property test** (`plan-allowed-intents.test.ts`, 5 000 runs) for `assertPlanSubsetOfPack` and the safePlan optional pack arg.
  - **NEW: 2 install-pack tests** for the new `allowDefaultExecute` plumbing.

  **Migration:**
  - A Pack with `policy.default = "EXECUTE"`: pass `{ allowDefaultExecute: true }` to `assertPackConformance` / `installPack`, OR change to `default: "REFUSE"` and add an explicit EXECUTE guard.
  - An adopter using `safePlan(planner, classification)`: no migration needed; the pack-subset check is opt-in via a third arg.
  - An adopter writing a custom Pack with mixed-vocabulary basis codes: any code outside `BASIS_CODES` now emits `basis_vocabulary_drift` telemetry. The decision still flows; treat the new event as a runbook signal.

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

- 663b572: `RuntimeContext` — per-tenant container for kill switch + sinks + enforce config. Resolves multi-tenancy gap (#8) and kill-switch env-seed one-shot (#16).

  The kernel ships with module-level singletons for several mutable slots (kill switch, MetricsSink, LearningSink, ShadowTelemetrySink, IBX_KERNEL_SHADOW/ENFORCE parses). Single-process multi-tenant deployments could not give two tenants independent kill switches or telemetry routing. Operators who flipped `IBX_KILL_SWITCH=1` after a manual `setKillSwitch()` call had no path to re-seed the env.
  - **NEW: `createRuntimeContext(options?)`** — mints a fresh container with isolated kill switch, metrics/learning/shadow sink slots, and an `EnforceConfig`. Each tenant holds the handle and routes reads/writes through it. Custom env-var names (`killSwitchEnvVar`, `shadowEnvVar`, `enforceEnvVar`) let tenants seed from per-tenant env vars (e.g., `IBX_KILL_SWITCH_TENANT_FOO`).
  - **NEW: `getDefaultRuntimeContext()`** — process-wide singleton context. Existing module-level functions (`isKilled`, `recordDecision`, etc.) operate on it; back-compat is total.
  - **NEW: `KillSwitchControl.reseedFromEnv(env?)`** — re-reads the kill-switch env var even after a manual `set()`. Operator escalation pathway during incidents.
  - **CHANGED: `adjudicateAndAudit` accepts optional `context: RuntimeContext`** — when supplied, metrics + learning events route through the tenant context's slots. The tenant kill switch is consulted ahead of the kernel kill-switch (both gates apply). Without `context`, behaviour is identical to T1.
  - **NEW: tenant kill-switch refusal** carries the tenant id in `basis.detail.tenant` so audit can distinguish process-wide vs per-tenant authority revocation.
  - **NEW: 14 unit tests** (`tests/kernel/runtime-context.test.ts`) covering kill-switch isolation, env-var override, reseed, sink-slot isolation, enforce-config isolation, adjudicate-and-audit routing, and back-compat.
  - ADR-103 documents the abstraction.

  **Migration:** existing module-level callers continue unchanged. New tenant-aware code calls `createRuntimeContext()` and passes `{ context }` to `adjudicateAndAudit`.
