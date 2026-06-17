# ADR-142 — Access-grant TTL + break-glass (`envelope.createdAt` clock)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/pack-access-governance` (`AccessGrant.grantedAt/expiresAt`, `access.breakglass`, `refuseExpiredGrant`, `executeBreakglass`), `@adjudicate/core` (additive `state`/`business` basis codes), apps/console PackMetadataRegistry
- **Related:** ADR-126 (memory store — replay clock discussion), ADR-115 (taint primitives), ADR-117 (PII redaction in the access pack)

## Context

The access-governance Pack had no notion of time-boxed grants or emergency access. Adding expiry/break-glass must not introduce a non-replayable clock into the decision path (`Date.now()` in a guard would break replay).

## Decision

- **`AccessGrant`** gains optional `grantedAt?`/`expiresAt?` (ISO-8601).
- **`refuseExpiredGrant`** (state guard, on `access.revoke`) refuses with `state.GRANT_EXPIRED` when `grant.expiresAt <= envelope.createdAt`. Comparison via `Date.parse` over the replayable, audit-preserved `createdAt` (boundary `createdAt == expiresAt` counts as expired).
- **`access.breakglass`** intent joins `accessTaintPolicy.systemOnlyKinds` — the kernel taint gate refuses an UNTRUSTED (LLM-forged) break-glass for free, before any business guard.
- **`executeBreakglass`** (business guard) requires a valid `ttlMs` (≤ 1h cap) → EXECUTE with `business.BREAKGLASS_GRANTED` (carrying `grantedAt = createdAt`); a missing/invalid ttl → REFUSE with `business.BREAKGLASS_TTL_INVALID`. The adopter mints `expiresAt = grantedAt + ttlMs` into state **post-turn** (out of the decision path).
- Fixed the pack-object version drift (`0.1.0-experimental` → `0.2.1`, matching `package.json`) and synced the console `PackMetadataRegistry`.

## Why this shape

- **`envelope.createdAt` is the replayable clock.** It is excluded from `intentHash` but round-trips through `replayEnvelopeFromAudit`, so an expiry comparison against it re-adjudicates identically. `Date.parse` parses a replayable string — no clock read.
- **Break-glass minting is post-turn.** The guard is pure (it only authorizes); the adopter folds the time-boxed grant into `S` afterward, mirroring the ADR-138/ADR-120 post-turn fold discipline.

## Invariants preserved

- Pure guards over `(envelope, S)`; no `Date.now()` in the decision path; no new Decision kind (maps to REFUSE/EXECUTE). Additive `state.GRANT_EXPIRED` + `business.BREAKGLASS_*` keys under existing categories (decision L2 — no `BasisCategory` union edit). **Integrity caveat:** `createdAt` is replay-stable but not tamper-evident (excluded from `intentHash`); the security argument rests on it being host-minted, never proposer-supplied.

## Alternatives considered

- **`Date.now()` in the expiry guard.** Rejected — non-deterministic, breaks replay.
- **A new top-level `access` BasisCategory.** Rejected (decision L2) — highest-coupling/irreversible; additive keys under `state`/`business` preserve audit-partition specificity reversibly.

## Test coverage

`packages/pack-access-governance/tests/breakglass-expiry.test.ts` (break-glass EXECUTE/TTL-invalid/unknown-resource/determinism; UNTRUSTED→SECURITY taint refuse; expiry boundary; non-expired revokes normally; no-expiresAt never expires). Existing pack six-outcome/conformance tests still green.
