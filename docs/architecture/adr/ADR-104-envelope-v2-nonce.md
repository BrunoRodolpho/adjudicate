# ADR-104 — Envelope v2: nonce-based intentHash + auth-after-taint reorder

**Status:** Accepted, 2026-04-27.
**Phase:** Phase 1 — assurance hardening.

## Context

The architectural assurance audit identified two coordinated problems
in the pre-T8 IntentEnvelope schema (v1):

### Problem 1 — `createdAt` foot-gun

The v1 `intentHash` was sha256 of `(version, kind, payload, createdAt,
actor, taint)`. This made `createdAt` load-bearing for the Execution
Ledger's dedup invariant: same envelope on retry → same hash → same
ledger key → first writer wins.

But adopters who reconstructed envelopes from durable storage on retry
had to remember to preserve `createdAt`. The README warned about it;
the type system did not enforce it. A `buildEnvelope({ ..., createdAt:
new Date().toISOString() })` on retry produces a *new* hash and the
ledger cannot dedupe — duplicate webhook deliveries re-execute.

The audit cited this as the most likely silent breakage in production
adopters, scoring State Assurance at 3 because hash determinism was
correct but the API surface invited misuse.

### Problem 2 — auth-before-taint ordering

The pre-T8 kernel evaluated `state → auth → taint → business`. The
intent was usability — auth refusals are usually more informative to a
caller than taint refusals, so put them first.

But auth guards have side effects in practice. The signature is
`(envelope, state) => Decision | null`; nothing prevents a guard from
calling a permission service, logging the principal, or hitting an
analytics tracker. Those side effects fire on UNTRUSTED inputs that
the kernel was about to refuse two steps later. Subtle defense-in-depth
violation.

## Decision

Three coordinated changes, shipped as one major within
`0.1.0-experimental`:

### 1. Envelope v2 — separate idempotency key from descriptive metadata

```ts
export interface IntentEnvelope<K, P> {
  readonly version: 2;
  readonly kind: K;
  readonly payload: P;
  readonly createdAt: string;  // metadata, NOT in hash
  readonly nonce: string;      // idempotency key, IN hash
  readonly actor: IntentActor;
  readonly taint: Taint;
  readonly intentHash: string;
}
```

Hash recipe: `(version, kind, payload, nonce, actor, taint)`. Adopters
supply `crypto.randomUUID()` for first attempts; retries pass the same
value. `createdAt` is descriptive metadata that varies freely.

`BuildEnvelopeInput.nonce` is **required** — TypeScript catches the
omission. The foot-gun shifts from "remember to preserve `createdAt`"
to "supply a `nonce`", which is structurally what the framework was
trying to communicate all along.

### 2. v1 envelopes are REFUSEd at runtime

Hard cutover. `INTENT_ENVELOPE_VERSION = 2`. The schema gate emits
`schema_version_unsupported` for any other version. No coexist period.

Justified within `0.1.0-experimental`: the framework is pre-stable, the
foot-gun is widely-cited, and a coexist period extends the duration of
the bug surface for everyone. The migration is mechanical (add `nonce`)
and the type system enforces it.

### 3. Kernel evaluation reorders to taint-first

```
state → taint → auth → business
```

(was `state → auth → taint → business`.)

UNTRUSTED inputs short-circuit before any auth side effect runs.
Refusal-code distribution in audit history shifts: an UNTRUSTED
envelope that would have failed both `auth_scope_insufficient` and
`taint_level_insufficient` now reports `taint_level_insufficient`
because taint runs first. This is the operationally-correct outcome
— auth-decision-on-untrusted-input was a partial-evaluation bug.

### Why hard cutover instead of coexist

- **Type system enforces migration.** `buildEnvelope` without `nonce`
  is a compile error. The migration is bounded: every call site is
  visible.
- **The foot-gun is invisible without the type change.** A coexist
  period with both v1 and v2 still lets adopters mistakenly produce
  v1 envelopes that miss dedup.
- **`0.1.0-experimental` is the right window.** The README explicitly
  permits breaking changes during this phase.

### Why `legacyV1ToV2` for replay reads

Live writes are v2. Audit storage may contain pre-T8 v1 rows that
operators want to replay against the new policy to detect drift.
`legacyV1ToV2(row)` synthesizes a v2 envelope from a v1 row using
the historical `createdAt` as the nonce — the closest stand-in
available, ensuring deterministic reproduction across replays.

The synthesized `intentHash` does NOT match the v1 row's stored hash
(different recipes; we cannot reverse a sha256). Replay reports kind
+ basis comparison, which is what the harness actually probes; the
hash is only used as a join key, which `intent_hash` from the row
provides.

## Consequences

### Positive

- The most widely-cited foot-gun is retired at the type level.
- Hash determinism is preserved (same nonce → same hash).
- Auth side effects can no longer leak on UNTRUSTED inputs.
- The migration is bounded by the TypeScript surface — every call site
  is visible.

### Negative

- Breaking change for every adopter at deploy time. Migration is
  mechanical (add `nonce: crypto.randomUUID()`).
- v1 envelopes in flight at deploy boundary will be REFUSEd. Adopters
  must quiesce v1 producers before deploying.
- Refusal-code distribution shifts in audit history; replay drift may
  surface for the period spanning the deploy.

### Neutral

- `createdAt` remains for descriptive metadata (audit timestamps,
  forensic traceability).
- Pre-T8 audit rows replay via `legacyV1ToV2` without storage migration.

## Implementation notes

- `packages/core/src/envelope.ts` — version bump, nonce field, hash recipe.
- `packages/core/src/kernel/adjudicate.ts` — taint-before-auth reorder,
  documentation update.
- `packages/audit-postgres/src/postgres-sink.ts` — `nonce` column.
- `packages/audit-postgres/migrations/003-add-nonce.sql` — DDL.
- `packages/audit-postgres/src/legacy-v1-compat.ts` — `legacyV1ToV2`.
- `packages/pack-payments-pix/src/policies.ts` — REWRITE plumbs nonce.
- 6 unit tests + 2 property tests; existing kernel/adjudicate tests
  updated for new ordering.

## Follow-ups

- A future PR can ship a one-shot replay job that re-stamps v1 audit
  rows with synthesized nonces in the `nonce` column, eliminating the
  legacyV1ToV2 fallback path entirely.
- Phase 2's `@adjudicate/tools` will gain a `ToolDefinition.idempotencyKey`
  contract that wraps nonce generation — adopters who use
  ToolDefinition won't see `nonce` directly.
