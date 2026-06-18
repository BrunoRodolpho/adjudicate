---
"@adjudicate/core": minor
"@adjudicate/approval-engine": minor
"@adjudicate/canonical": patch
---

feat(core): 021 — capability schema + canonical pre-image + constant-time hash-bind verify. Add a new `Capability` record (`{ intentHash, kernelId, signature }`) whose `signature` slot (`{ keyId; alg; value }`) is shaped IDENTICALLY to `AuditRecord.signature` so audit and capability share one signature shape; plus `UnsignedCapability`/`CapabilitySignature` types and the `CAPABILITY_PREIMAGE_VERSION` (`"adjudicate-capability-v1"`) tag. `capabilityPreimage` builds a versioned canonical pre-image STRING (tag line + `sha256Canonical({intentHash, kernelId})` via `@adjudicate/canonical` — the NFC, invariant-#4-compatible encoder, NOT the conformance fork), binding the authorizing `intentHash` so a capability is non-detachable and non-replayable across intents (§D #4). `verifyCapability` is the PURE-JS, browser-safe, constant-time hash-bind check (re-derives the pre-image, compares with `timingSafeHexEqual` — never early-exit, never throws; fail-safe `false` on any malformed input). `bindCapability` mints the hash-bound (non-asymmetric) variant. ADDITIVE: no consumer is wired into the kernel — the cap-gated executor is plan 024. The pure `adjudicate()` decision path and `intentHashInput` are UNCHANGED (purity/determinism preserved; six outcomes intact).

feat(approval-engine): 021 — node-resident ed25519 `signCapability` / `verifyCapabilitySignature` (impure shell, §D shell-signs boundary). Signs/verifies the SAME canonical `capabilityPreimage` string with `node:crypto` (alg `"ed25519"`, base64 detached signature in the shared signature slot), mirroring `createEd25519AttestationVerifier`'s node-only boundary. Fails CLOSED (never throws) on unknown key id / malformed key / non-ed25519 alg / bad or cross-intent / cross-kernel replay. Stays out of `@adjudicate/core` so core remains browser-bundleable.

fix(canonical): add the `capability-preimage-body` cross-impl golden vector (`sha256Canonical({intentHash, kernelId})`) plus a 021 capability-pre-image lock test pinning the full versioned pre-image string and its hash; existing v3 envelope + resource-refs vectors are untouched.

T5: `KernelIdentity.attest` stays a THROWING v0.2 seam — 021 does NOT unstub it. Capability minting/signing happens in the impure shell; the kernel never signs and merely records a `KernelIdentity.id` into the capability's `kernelId`. Documented in `identity.ts`; pinned by a test asserting `attest()` still rejects.
