# @adjudicate/runtime

## 0.1.0

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

- M1 — Foundation + Safety (v0.2.0)

  ## Kernel hardening

  ### Guard exception isolation (ADR-106)

  The kernel now wraps every guard invocation in `try/catch`. Throwing guards no longer propagate to the adopter — instead, the kernel converts the throw into a `SECURITY` REFUSE with the new `kernel.GUARD_PANIC` basis code, preserving the audit trail through the same path as any other refusal.

  The `BASIS_CODES.kernel` category is new (adds `GUARD_PANIC`). Adopters who depended on guards throwing should set `kernelEnforcement.allowGuardExceptions: true` for a one-cycle migration window.

  ### Resume-hash verification

  `ParkedEnvelope` gains optional `version`, `nonce`, `taint`, `actorPrincipal` fields. When present, `resumeDeferredIntent` re-derives the `intentHash` via `sha256Canonical` and asserts byte-equality with the stored value — detecting blob tampering between park and resume.

  New: `verifyParkedEnvelopeHash(parked) → ParkVerificationResult`. New: `verifyHash: "strict" | "warn" | "off"` option on `resumeDeferredIntent` (default `"warn"`).

  The Anthropic adapter now parks full envelope fields at DEFER time and verifies on resume/confirm.

  ## Externalized refusal strings (ADR-107)

  Kernel inline strings switched from Brazilian Portuguese to English defaults. New `@adjudicate/core/refusal-messages.ts` exports the `RefusalMessages` interface and the `localizeDecision(decision, messages)` helper.

  New package: `@adjudicate/locales-pt-BR` provides `portugueseRefusalMessages` for adopters who want pt-BR strings. Use at presentation time:

  ```ts
  import { localizeDecision } from "@adjudicate/core";
  import { portugueseRefusalMessages } from "@adjudicate/locales-pt-BR";
  const userVisible = localizeDecision(decision, portugueseRefusalMessages);
  ```

  ## Admin SDK

  `BasisCategorySchema` adds `"kernel"` to the closed Zod enum to match the new kernel category.

  ## Performance characterization

  New `bench/` workspace publishes p50/p99 microbenchmarks. See `docs/perf/v0.2-baseline.md`. All measured numbers have >200× headroom against published SLOs.

### Patch Changes

- Updated dependencies [d8c11b7]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [92858a0]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/core@1.0.0
