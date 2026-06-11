# @adjudicate/runtime

Runtime-side framework helpers for adjudicate. Two concerns live here:

1. **Deferred-intent park/resume** — the kernel returns `DEFER` when an intent
   is valid but awaits an external signal (a payment webhook confirming a
   pending charge, a manager approving a request, an inventory restock
   unblocking an order). This package handles both halves of that flow with
   content-addressed deduplication, so duplicate signal deliveries fold into
   exactly one resume.
2. **Deadline helpers** — small primitives for racing async generators against
   a hard wall-clock deadline; useful for orchestrators wrapping LLM streams.

The Redis client and key-builder are always injected — this package has no
transport or namespacing assumptions of its own.

## Public surface

```ts
import {
  // resume side (defer-resume.ts)
  resumeDeferredIntent,
  deferResumeHash,
  verifyParkedEnvelopeHash,
  DEFAULT_MAX_RESUME_CYCLES,        // 3
  DEFER_PENDING_TTL_GRACE_SECONDS,  // 14 days
  type DeferRedis,
  type DeferLogger,
  type DeferResumeResult,
  type ParkVerificationResult,
  type ParkedEnvelope,
  type ResumeDeferredIntentArgs,

  // park side (defer-park.ts)
  parkDeferredIntent,
  decrementDeferCounter,
  deferParkKey,
  deferCounterKey,
  DEFAULT_DEFER_QUOTA_PER_SESSION,  // 16
  type ParkRedis,
  type CounterRedis,
  type ParkDeferredIntentArgs,
  type ParkDeferredIntentResult,
  type ParkLogger,

  // deadline helpers (with-deadlines.ts)
  deadlinePromise,
  DEADLINE_HIT,
} from "@adjudicate/runtime";
```

## How it works

**Park.** When the kernel returns `DEFER`, the adopter calls
`parkDeferredIntent`, which enforces a per-session quota
(`DEFAULT_DEFER_QUOTA_PER_SESSION` = 16, tunable) before writing the envelope
to `rk("defer:pending:${sessionId}")` with `EX: ttlSeconds`. The caller sets
`ttlSeconds` (typically `signal.timeoutMs / 1000 + grace`). Quota overflow
returns `{ parked: false, reason: "quota_exceeded" }` and emits a
`recordResourceLimit` event. Park the envelope **with** its hash-verification
fields (`version`, `nonce`, `taint`, `actorPrincipal`) so resume-time
tamper detection works; legacy blobs lacking them fail closed under the
default strict policy.

**Resume.** When the awaited signal lands, the adopter calls
`resumeDeferredIntent`, which:

1. Reads the parked envelope (`no_parked_envelope` / `malformed_envelope` /
   `signal_mismatch` short-circuit early).
2. **Verifies the blob hash** (`verifyHash`, default `"strict"`): re-derives
   `intentHash` via `sha256Canonical` from the stored fields and asserts
   byte-equality. Mismatch → `park_blob_tampered`; legacy blob missing the
   fields → `park_blob_unverifiable` (under `"warn"` it logs and proceeds;
   `"off"` skips the check entirely). Guards against an attacker with Redis
   write access mutating the parked payload between park and resume.
3. **Enforces the resume-cycle cap** (`maxResumeCycles`, default
   `DEFAULT_MAX_RESUME_CYCLES` = 3): bounds a `DEFER → resume → re-adjudicate
   → DEFER` oscillation driven by a misbehaving signal source. Over the cap →
   `cycle_cap_exceeded`. Requires `redis.incr`; silently skipped without it.
   Set to `0` to disable.
4. Acquires a resume token at `rk("defer:resumed:${deferResumeHash(intentHash,
   signal)}")` via `SET NX` — first writer wins. Loser →
   `duplicate_resume_suppressed`.
5. On success, deletes the parked key, best-effort `DECR`s the per-session
   counter (if `redis.decr` is wired), and returns the envelope so the adopter
   can re-adjudicate it.

`DEFER_PENDING_TTL_GRACE_SECONDS` (14 days) is the retention applied to the
resume-token and cycle-counter keys created on the resume side — not the
parked-envelope TTL, which the adopter controls via `parkDeferredIntent`'s
`ttlSeconds`.

## Adapter contract

```ts
interface DeferRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null>; // "OK" on success, null on collision
  del(key: string): Promise<unknown>;

  // Optional. Absence degrades gracefully:
  incr?(key: string): Promise<number>;        // required for the resume-cycle cap
  decr?(key: string): Promise<number>;        // keeps the per-session quota counter live
  expire?(key: string, seconds: number): Promise<unknown>; // bounds the cycle-counter key
}
```

The shape matches `node-redis` v4+; `ioredis` users need a thin wrapper.
`parkDeferredIntent` takes a separate `ParkRedis` (atomic `incr`/`decr`/`expire`
plus an optional `evalIncrCheck` Lua hook for a race-free quota check) — see
`defer-park.ts`.

## Second-domain example

[`examples/clinic/clinic-policies.ts`](./examples/clinic/clinic-policies.ts)
is a minimal `PolicyBundle` showing how to author a domain against
`@adjudicate/core` (top-level types) and `@adjudicate/core/kernel`
(`adjudicate`, `PolicyBundle`, combinators) without forking the framework —
useful for verifying the kernel handles your domain shape before wiring up the
park/resume flow above.
