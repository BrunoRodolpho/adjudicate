# ADR-137 — Per-decision configuration integrity (amends ADR-121)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/conformance` (`freezeSealableSurface`, `verifyConfigSealFrozen`), `@adjudicate/adapter-core` (`configSeal.reverify`/`onDrift`, loop re-verify gate)
- **Related:** ADR-121 (Configuration Integrity Seal), ADR-114 (kill switch v2), ADR-116 (post-v1 extension discipline)

## Context

ADR-121 verified the config seal **once per agent instance** (a boot-only `sealChecked` latch in the adapter loop). A long-lived instance whose installed Pack reference is swapped *after* boot would never be re-checked — the seal's tamper-evidence lapsed for the life of the process.

## Decision

- **Re-verify on a cadence, upstream of `adjudicate()`.** `configSeal.reverify` ∈ `"every_turn"` (default) | `"frozen"` | `{ ttlMs }`. The loop re-verifies the seal **before each adjudication** and refuses the turn on mismatch. The seal is never a kernel input — it gates the turn at the loop layer, so `intentHash`/`S`/`auditHash` pre-image are untouched.
- **`freezeSealableSurface(surface)`** deep-freezes the captured surface; **`verifyConfigSealFrozen(frozen, seal, opts)`** verifies a seal against a pre-extracted surface (the `"frozen"` cadence — cheapest, catches seal tampering). `verifyConfigSeal` refactored to share the digest+signature verdict.
- **`onDrift(report)`** — a best-effort, tamper-evident telemetry hook fired on mismatch.
- **Self-healing refuse, not a latch.** A mismatch refuses *that turn*; it is not latched across turns, so `every_turn` self-heals once the pack/seal is re-aligned. The optional `engageKillSwitchOnMismatch` still latches (operator recovery — see ADR-114 + the Appendix D runbook).
- **Deprecation window (decision L1).** Defaults stay lax (`require_digest`, kill-switch off) for one release; the loop emits a **one-time** warning when `policy` isn't `require_signature` or `engageKillSwitchOnMismatch` is unset. The breaking default-flip is deferred.

## Why this shape

- **The clock lives in the loop, never the kernel.** `{ ttlMs }` caching uses a loop-layer `Date.now()`; `adjudicate()` stays pure. Every cadence is replay-safe because the seal gate is never a replayed input.
- **Re-verify cadence decoupled from default values.** The security value (catching post-boot drift) ships immediately; the operationally-disruptive defaults (fail-closed-on-unsigned, kill-latch) ship a release later so adopters on digest-only seals are not fail-closed overnight.

## Invariants preserved

- Seal verification is upstream of and never an input to `adjudicate()`; closed Decision union untouched (mismatch → loop-level `refused` outcome, not a new kind). Pure crypto (sha256 + ed25519/RSA-PSS), no clock/RNG in the verifier.

## Alternatives considered

- **Keep boot-only.** Rejected — leaves post-boot reference-swap undetected.
- **Flip strict defaults immediately.** Rejected — fail-closes every turn for unsigned-seal adopters and latches kill switches (manual recovery storm); the deprecation window is the ADR-116-consistent rollout.

## Test coverage

`packages/conformance/tests/config-seal-frozen.test.ts` (deep-freeze; frozen verify match/mismatch). `packages/adapter-core/tests/config-seal-reverify.test.ts` (frozen valid/mismatch, `{ttlMs}`, every_turn repeat, `onDrift`, one-time deprecation warn). Existing ADR-121 gate tests (`config-seal-gate.test.ts`) still green under the new cadence.

## Lifecycle

Phase 2: cadence + helpers + warn (this ADR). Phase 3: flip `require_signature` + `engageKillSwitchOnMismatch=true` defaults after the deprecation release. Operators must wire the signing-key + kill-switch-recovery runbooks (plan Appendix D) before adopting the strict defaults.
