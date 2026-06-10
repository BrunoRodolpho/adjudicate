---
"@adjudicate/analyze": minor
"@adjudicate/admin-sdk": minor
---

Add the policy-manifest builder: `describePack`, `describeInstalledPacks`, `computeManifestDigest`, and `diffPolicyManifests`. The `PolicyManifest` is a JSON-serialisable superset of `describePolicyBundle` that captures, per Pack and per intent kind, the taint floor, the phase-ordered guard chain (with resolved names, structured descriptions, and opt-in source locations), basis codes, DEFER signals, tool bindings, and statically-inferred decision outcomes — plus a stable content `digest` for drift diffing. Powers the rule-provenance tree in the operator console. No `@adjudicate/core` changes (determinism fence untouched).

`@adjudicate/admin-sdk` gains the matching `PolicyManifestSchema` wire schema (+ `PolicyManifestParsed`) and a `governance.policyManifest` tRPC procedure with an optional `AdminContext.policyManifest` field (feature-detected via `PRECONDITION_FAILED`, mirroring `describePolicy`). admin-sdk carries no `@adjudicate/analyze` dependency — the schema is re-declared permissively per the established pattern.
