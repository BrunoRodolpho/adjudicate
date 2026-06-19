# ADR-111 — AuditRecord v4 additive fields + verifyAuditRecord

- **Status:** Accepted
- **Date:** 2026-05-18 (M3 overnight execution)
- **Supersedes:** none
- **Related:** ADR-101 (kernel audit emission), ADR-104 (envelope v2), ADR-105 (closed vocabulary), ADR-124 (v5 `metadata`)

> The current `AUDIT_RECORD_VERSION` is **5** (ADR-124 added an optional
> `metadata` field additively on top of v4). This ADR records the v4 design;
> the v5 deltas are noted inline. The contract is additive — pre-v4 records
> remain valid against the v5 type and every reader.

## Context

AuditRecord v3 covered envelope + decision + basis, the plan snapshot
(CapabilityPlanner output), supersession lineage (`confirmation_resolved`,
`defer_resumed`, `rewrite_executed`, `replay`, `lgpd_scrub`), and
kernelIdentity. Three gaps remained:

1. **No policy versioning.** A record from January 2025 might not replay
   deterministically against the Pack code from May 2026 because the Pack
   changed in between. The replay reader has no way to "use the Pack as of
   policyVersion X" without external tracking.

2. **No kernel versioning.** Same problem one layer up: the kernel itself
   evolves (e.g., the T8 taint reorder changed the audit sequence). Records
   emitted by pre-T8 kernels replay differently in post-T8 kernels unless the
   reader applies the right semantics.

3. **No tamper detection.** A mutated stored AuditRecord goes undetected
   unless someone compares the record byte-for-byte against an independent
   copy.

## Decision

Bump `AUDIT_RECORD_VERSION` to 4. Add four additive fields (all OPTIONAL —
v3 records remain valid; v4 readers populate from `buildAuditInput`; the
`auditHash` is computed by `buildAuditRecord`):

- `policyVersion?: string` — Pack.version at emit time
- `kernelVersion?: string` — @adjudicate/core package version (distinct from
  `kernelIdentity.version`, which identifies the kernel BUILD)
- `auditHash?: string` — tamper-evident token (see below)
- `signature?: { keyId; alg; value }` — pluggable KMS/HSM signature over
  `auditHash`

> **v5 (ADR-124):** adds optional `metadata?: Record<string, unknown>` for
> post-hoc governance/observability data (e.g. `hallucination_score`).
> `metadata` is EXCLUDED from the `auditHash` pre-image — like `signature` —
> so attaching it after emission never invalidates tamper-evidence.
> `attachAuditMetadata(record, metadata)` merges it onto an already-built
> record purely. See the cross-version contract note below.

### auditHash and verification

`auditHash = sha256Canonical(record \ { auditHash, signature, metadata })`.
It binds envelope + decision + basis + supersession into one tamper-evident
token; verifiers strip the same three fields and re-derive.

`verifyAuditRecord(record) → AuditRecordVerification` is a pure, I/O-free
function. It runs **two independent checks**:

1. **Envelope self-consistency** (runs first, applies to pre-v4 records too):
   re-derives `envelope.intentHash` via `deriveIntentHash` — the same recipe
   `buildEnvelope` uses — and compares. Catches a forged or drifted envelope
   hash even when the surrounding `auditHash` is itself valid.
2. **auditHash tamper check**: re-derives the stripped-record hash and
   compares (constant-time via `timingSafeHexEqual`).

```ts
type AuditRecordVerification =
  | { verified: true }
  | { verified: false; reason: "tampered"; derived; stored }
  | { verified: false; reason: "envelope_intent_mismatch"; derived; stored }
  | { verified: null; reason: "missing_hash" }; // pre-v4 record, no auditHash
```

Signature verification (non-repudiation) is a separate, pluggable concern.

### Postgres migration

`packages/audit-postgres/migrations/008-add-v4-fields.sql` adds **five**
nullable columns and widens the `record_version` CHECK:

- `policy_version TEXT NULL`, `kernel_version TEXT NULL`,
  `audit_hash TEXT NULL`, `signature_jsonb JSONB NULL`,
  `kernel_identity_jsonb JSONB NULL`
- CHECK widened to `record_version IN (1, 2, 3, 4)` (migration 005 had it at
  1–3; v4 inserts would otherwise fail `intent_audit_record_version_check`)
- indexes on `policy_version` (by `recorded_at DESC`) and `audit_hash`

> **v5 migration** — `010-add-v5-metadata.sql` widens the CHECK to
> `IN (1, 2, 3, 4, 5)` and adds `metadata_jsonb JSONB`. This is the current
> schema state: the sink writes `record_version = record.version`
> unconditionally, so without it the first v5 insert fails closed (Postgres
> 23514). Same class of regression 008 fixed for v4.

The columns are nullable; v3 writers continue to work and existing rows
remain valid.

### admin-sdk schema

`AuditRecordSchema` (`packages/admin-sdk/src/schemas/audit.ts`) accepts
`version: 1 | 2 | 3 | 4 | 5`. The v4 fields and the v5 `metadata` field are
`.optional()`, so v3 records pass validation unchanged.

## Consequences

### Positive

- `replayHistorical(records, registry)` resolves the correct Pack version per
  record via `PackRegistry.resolve(packId, policyVersion)`. Compliance
  auditors get "show me the decision under the policy active at time T."
- Tamper detection works end-to-end. The console can render a verified badge
  per record; tampered records are loud failures. The
  `envelope_intent_mismatch` shape additionally catches a forged envelope hash.
- KMS integration is pluggable — adopters wire an `AuditSigner` without
  touching kernel code.

### Negative

- Each new optional field is a small serialization cost (~10–50 bytes/record).
  At 100k records/day that's negligible (~10MB/day).
- `buildAuditRecord` now always computes `auditHash` (sha256 over the record).
  Measured: ~3µs added to `adjudicateAndAudit()` p99 — the 15ms SLO budget
  still has 99.98% headroom.

### Cross-version contract (v5)

A v5 record carrying `metadata` MUST be verified by `@adjudicate/core` ≥ v5.
A pre-v5 `verifyAuditRecord` does not strip `metadata` from the pre-image, so
it would re-derive a different hash and FALSELY report `tampered`. Records
with no metadata are cross-version safe. Pinned by `audit-record-v5.test.ts`.

## Alternatives considered

### Embed verifier signature in `decision.basis`

Rejected. The basis is the kernel's vocabulary; signatures are an audit-layer
concern. Mixing them would force every basis-emitting guard to know about
audit hashing — a layering violation.

### Single hash over `(envelope, decision)` instead of full record

Rejected. Adopters who care about supersession lineage tampering need the
supersession field bound to the hash. Hashing only `(envelope, decision)`
would let a malicious actor relink supersession edges without detection.

### Required v4 (no opt-out)

Rejected. OSS adopters with existing v3 ingestion pipelines should not be
force-upgraded. The fields are optional; adopters opt in via
`buildAuditInput.policyVersion` / `.kernelVersion`.

## References

- Implementation: `packages/core/src/audit.ts` — `AuditRecord`,
  `buildAuditRecord`, `attachAuditMetadata`, `verifyAuditRecord`,
  `AuditRecordVerification`.
- Migrations: `packages/audit-postgres/migrations/008-add-v4-fields.sql`,
  `010-add-v5-metadata.sql`.
- Schema: `packages/admin-sdk/src/schemas/audit.ts`.
- Tests: `packages/core/tests/audit-record-v4.test.ts` (16 tests),
  `audit-record-v5.test.ts` (cross-version metadata contract).
- v5 field: ADR-124 (hallucination scoring).
