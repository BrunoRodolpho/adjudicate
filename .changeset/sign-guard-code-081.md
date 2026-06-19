---
"@adjudicate/conformance": minor
"@adjudicate/core": minor
"@adjudicate/primitives": patch
"@adjudicate/red-team": minor
"@adjudicate/adapter-core": patch
"@adjudicate/cli": minor
"@adjudicate/admin-sdk": patch
---

feat(core): 081 — pin per-guard CODE artifacts into the policy descriptor. Add `attachGuardCodeArtifact` / `readGuardCodeArtifact` / `GuardCodeArtifact` (a symbol-keyed slot carrying closure-captured numeric caps + predicate body) and surface a per-guard `codeDigest` (sha256-over-canonical via `@adjudicate/canonical`) on `GuardDescriptor` in `describePolicyBundle`. Additive + back-compatible: guards without an artifact carry no `codeDigest`. No new kernel dependency; the kernel decision is unchanged (purity/determinism preserved).

feat(conformance): the ConfigSeal sealable surface now binds guard CODE, not just declared metadata. `SealableSurface` gains an order-stable `guardCodeDigests` list (new `GuardCodeDigest` type) threaded through `extractSealableSurface`; `computeConfigDigest` / `verifyConfigSeal` / `verifyConfigSealFrozen` signatures are unchanged. Closes Critique #27 / the 034→081 body-integrity dependency: editing a `createRewriteGuard` closure-captured cap (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) now drives a digest mismatch instead of verifying clean (fail-closed, §D-inv-6).

fix(primitives): `createRewriteGuard` exposes its closure-captured cap (and clamp body) to the descriptor via `attachGuardCodeArtifact`, so a behavior-changing cap edit is no longer invisible to the seal.

feat(red-team): add `runConfigSealCapEditRegression` (+ `CapEditRegressionResult`) — a `config_integrity` regression that asserts a tampered guard cap is DETECTED by the sealed surface digest.

feat(cli): `pack verify --expect-seal <hex>` verifies the extended ConfigSeal surface (guard code bodies pinned), in addition to the declarative-subset fingerprint.

chore(adapter-core, admin-sdk): doc + wire-schema updates for the extended descriptor surface (the `configSeal` loop gate now binds guard code; `GuardDescriptorSchema` tolerates the optional `codeDigest`).
