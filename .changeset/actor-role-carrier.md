---
"@adjudicate/core": minor
"@adjudicate/runtime": minor
"@adjudicate/adapter-core": patch
---

WS7 — `IntentActor.role`, an OPTIONAL, OPAQUE adopter role carrier (staff-role authorization prerequisite for role-aware pack guards, e.g. OWNER/MANAGER/ATTENDANT × intent-kind matrices).

`@adjudicate/core` (minor — new surface):

- `IntentActor` gains `readonly role?: string`. The string is adopter vocabulary — the kernel assigns it NO meaning, enforces NO enum, and consults it in NO built-in guard; adopter packs may read it via `envelope.actor.role`. Orthogonal to BOTH the provenance `principal` axis AND the authority graph's identity binding.
- Canonical-drop-safe (mirroring `attestation` / `resourceRefs`): an envelope WITHOUT `role` hashes byte-identically to pre-change envelopes — `@adjudicate/canonical` drops `undefined` keys before hashing, so NO existing `intentHash`, golden vector, or replay fixture changes (all pass unchanged). A PRESENT `role` IS bound into `intentHash` via `actor`, so a post-decision role swap is tamper-evident.
- `isIntentEnvelope` rejects a present-but-malformed `role` (empty string / non-string); absent stays valid. `docs/specs/intent-envelope-v2.schema.json` adds the optional `actor.role` property (`string`, `minLength: 1`) under the actor's `additionalProperties: false`.

`@adjudicate/runtime` (minor — new park-blob field):

- `ParkDeferredIntentArgs["envelope"]` / `ParkedEnvelope["envelope"]` gain optional `actorRole`, and `verifyParkedEnvelopeHash` re-derives the hash with `role` threaded through the reconstructed actor (passed unconditionally, exactly like `resourceRefs`) — so a parked envelope CARRYING a role resumes with an IDENTICAL `intentHash` instead of false-tampering (`park_blob_tampered`), while a no-role blob re-derives byte-identically (no regression).

`@adjudicate/adapter-core` (patch — internal threading, no API change):

- The DEFER park projection in `translateDecision` forwards `actorRole: envelope.actor.role` so a role-carrying DEFER round-trips park → resume with its hash intact.
