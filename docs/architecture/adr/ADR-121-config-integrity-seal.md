# ADR-121 — Configuration Integrity Seal

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/conformance` (`sealPackConfig`/`verifyConfigSeal`), `@adjudicate/core` (`kill.SEAL_MISMATCH` basis), `@adjudicate/adapter-core` (loop seal gate + `refused` outcome), `@adjudicate/admin-sdk` (`governance.configSealStatus`), apps/console
- **Related:** ADR-115 (pack trust / fingerprint), ADR-105 (guard metadata), ADR-114 (kill switch)

## Context

`computePackFingerprint` (ADR-115) pins a Pack's declarative subset at install time but excludes `policy`/`planner` (function references can't be hashed) — so guard thresholds, system-only taint config, and basis vocabulary can drift silently after sign-off. Operators want a deploy-time seal verified *continuously at runtime*.

## Decision

- **`sealPackConfig(pack, opts?)` → `ConfigSeal`** and **`verifyConfigSeal(pack, seal, opts?)` → `ConfigSealReport`** in `@adjudicate/conformance`. The sealed surface (`extractSealableSurface`) is a *superset* of the fingerprint: declarative subset **+ guard metadata descriptions** (via `describePolicyBundle`) **+ probed `taint.minimumFor(kind)` per declared intent + basis codes**. The digest is sha256 over canonical-JSON of that surface; an optional signature (reused ed25519/RSA-PSS from ADR-115) covers the digest.
- **Adapter loop gate:** a new `configSeal` option verifies the seal **once per agent instance** before the first adjudication. On mismatch the turn is **refused** (new `AgentOutcome` variant `{ kind: "refused" }`, trace phase `config_seal_violation`) without calling the planner/bridge, and — if `engageKillSwitchOnMismatch` — the runtime context's kill switch is engaged.
- **Console:** `governance.configSealStatus` + a `ConfigSealStatus` panel on the governance page.
- Factored the shared `canonicalJson` out of `pack-trust.ts` into `canonical-json.ts` (behavior-preserving).

## Why this shape

- **Honest about what's sealable.** Function bodies remain un-pinnable; the seal pins everything *introspectable*. Crucially, `TaintPolicy` is opaque (no enumerable `systemOnlyKinds`), so the extractor **probes** `minimumFor(kind)` over the declared intents — this is what catches a webhook intent silently downgraded from TRUSTED to UNTRUSTED. Guard descriptions are serialized structurally (tolerating unknown ADR-105 variants).
- **Gate outside `adjudicate()`.** The check reads static `pack` + `seal`, never envelope/state — it cannot enter `intentHash` or the pure decision path. A property/loop test proves the kernel decision is identical with or without `configSeal`. The only mutated state is the kill-switch singleton (its documented role).

## Invariants preserved

- Kernel determinism: seal functions are pure; the gate is one-time, cached, outside the decision path.
- `kill.SEAL_MISMATCH` is an additive basis code (category `kill`, blocks regardless of policy). `AgentOutcome.refused` and the trace phase are additive.

## Alternatives considered

- **Hash full Pack module bytes.** Rejected — bundler churn (ADR-115 precedent).
- **Make the gate a `stateGuard`.** Rejected — guards can't access RuntimeContext / engage the kill switch and run per-envelope (wrong altitude). The iteration-start seam is correct.

## Test coverage

`packages/conformance/tests/config-seal.test.ts` (digest determinism, taint-minimum capture, sign/verify round-trip, taint-downgrade + metadata-tamper + signature-mismatch detection, require_signature errors). `packages/adapter-core/tests/config-seal-gate.test.ts` (valid → proceeds, no-option regression, mismatch → refused + bridge never called, kill-switch engage). `apps/console` ConfigSealStatus test.

## Lifecycle

`ConfigSeal.schemaVersion: 1`; surface additions are MINOR + a schemaVersion bump. Reordering two structurally-identical anonymous guards is invisible (identical behavior); any named/metadata/threshold/taint change is detected.
