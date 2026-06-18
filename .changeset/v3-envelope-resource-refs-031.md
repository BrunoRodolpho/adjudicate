---
"@adjudicate/core": minor
"@adjudicate/canonical": patch
"@adjudicate/admin-sdk": minor
"@adjudicate/audit-postgres": patch
"@adjudicate/red-team": minor
---

feat(core): 031 — v3 IntentEnvelope resource-refs (drop-safe hash binding). Add the OPTIONAL `resourceRefs` slot (new `ResourceRefs = Readonly<Record<string,string>>` type) to `IntentEnvelope` / `BuildEnvelopeInput`, threaded through `buildEnvelope`, and bound into the module-private `intentHashInput` pre-image so a present owner ref is tamper-evident (§D #4). CANONICAL-DROP-SAFE — exactly like `actor.attestation`: an envelope without resource-refs (or with the field explicitly `undefined`) omits the key from the canonical pre-image and hashes IDENTICALLY to its post-041 value (the replay-longevity corpus hash `dc624bd0…` is unchanged). `EXPECTED_ENVELOPE_KEYS`/`isIntentEnvelope` admit the new key without requiring it (nine required keys + one optional). No guard consults it in 031 — the authority predicate is plan 034; the kernel decision and determinism are unchanged.

fix(canonical): add the v3 `envelope-with-resource-refs` cross-impl golden vector plus drop-safety tests; existing no-resource-refs vectors are untouched (the `envelope-hash-recipe` baseline `cd017dd3…` still pins the no-refs sibling).

feat(admin-sdk): `IntentEnvelopeSchema` gains the optional `resourceRefs` field (new `ResourceRefsSchema = z.record(z.string(), z.string())`) with build-time core↔schema drift guards. Additive — old (no-refs) and new (with-refs) envelopes both round-trip.

chore(audit-postgres): `legacyV1ToV2` threads stored `resourceRefs` through replay reconstruction; drop-safe for every v1/v2 row (omitted → byte-identical recomputed hash).

feat(red-team): `ScenarioIntent` gains optional `resourceRefs`, threaded through the runner's `buildEnvelope`; `generateTaintEscalationEnvelopes` emits one v3-with-resource-refs probe per eligible kind asserting a declared owner does NOT weaken the taint short-circuit (still REFUSE).

Docs: `intent-envelope-v2.schema.json`, `canonical-json-hash.md`, and `canonical-hash-vectors.json` updated to declare/pin the v3 field and its drop-safety.
