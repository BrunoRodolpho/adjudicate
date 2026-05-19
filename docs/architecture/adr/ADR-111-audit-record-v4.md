# ADR-111 — AuditRecord v4 additive fields + verifyAuditRecord

**Status**: Accepted (2026-05-18 — M3 overnight execution)
**Supersedes**: none
**Related**: ADR-101 (kernel audit emission), ADR-104 (envelope v2), ADR-105 (closed vocabulary)

## Context

AuditRecord v3 covered:
- envelope + decision + basis (the kernel's output)
- plan snapshot (CapabilityPlanner output)
- supersession lineage (`confirmation_resolved`, `defer_resumed`,
  `rewrite_executed`, `replay`)
- kernelIdentity (build attestation reservation)

Three gaps remained:

1. **No policy versioning.** A record from January 2025 might not
   replay deterministically against the Pack code from May 2026
   because the Pack changed in between. The replay reader has no
   way to "use the Pack as of policyVersion X" without external
   tracking.

2. **No kernel versioning.** Same problem one layer up: the kernel
   itself evolves (e.g., the T8 taint reorder changed the audit
   sequence). Records emitted by pre-T8 kernels replay differently
   in post-T8 kernels unless the reader applies the right semantics.

3. **No tamper detection.** A bad actor (or accidental corruption)
   that mutates a stored AuditRecord goes undetected unless someone
   compares the record byte-for-byte against an independent copy.

## Decision

Bump `AUDIT_RECORD_VERSION` to 4. Add four additive fields:

```ts
interface AuditRecord {
  // ... existing v3 fields ...
  readonly policyVersion?: string;    // Pack.version at emit time
  readonly kernelVersion?: string;    // @adjudicate/core version
  readonly auditHash?: string;        // sha256(canonical(record \ { auditHash, signature }))
  readonly signature?: {              // KMS/HSM signature over auditHash
    readonly keyId: string;
    readonly alg: string;
    readonly value: string;
  };
}
```

All four are OPTIONAL — readers tolerate absence (v3 records remain
valid). v4 readers populate the fields from `buildAuditInput`. The
`auditHash` field is computed automatically by `buildAuditRecord`.

`verifyAuditRecord(record) → AuditRecordVerification` is exported:

```ts
type AuditRecordVerification =
  | { verified: true }
  | { verified: false; reason: "tampered"; derived: string; stored: string }
  | { verified: null; reason: "missing_hash" };
```

Pure function. No I/O. Verifies tamper-evidence; signature
verification is a separate concern (pluggable `AuditSigner`).

### Postgres migration

`packages/audit-postgres/migrations/008-add-v4-fields.sql` adds four
nullable columns:
- `policy_version TEXT NULL`
- `kernel_version TEXT NULL`
- `audit_hash TEXT NULL`
- `signature_jsonb JSONB NULL`

Plus two indexes (policy_version by recorded_at desc, audit_hash for
lookup).

The columns are nullable. v3 writers continue to work; v4 writers
populate them. Existing rows (read as v3) remain valid.

### admin-sdk schema

`AuditRecordSchema` accepts `version: 1 | 2 | 3 | 4`. The four new
fields are `.optional()`. v3 records pass v4 schema validation
unchanged.

## Consequences

### Positive

- `replayHistorical(records, registry)` can resolve the correct Pack
  version per record. Compliance auditors get "show me the decision
  under the policy active at time T."
- Tamper detection works end-to-end. The console can render a "✓
  verified" badge per record; tampered records are loud failures.
- KMS integration is a pluggable step — adopters who need
  non-repudiation wire an `AuditSigner` without touching kernel code.

### Negative

- AuditRecord shape grew. Each new optional field is a small
  serialization cost (~10–50 bytes per record). At 100k records/day
  that's negligible (~10MB/day extra storage).
- `buildAuditRecord` now always computes `auditHash` (sha256 over
  the record). Benchmark impact measured: ~3µs added to
  `adjudicateAndAudit()` p99. SLO budget of 15ms still has 99.98%
  headroom.

### Neutral

- The `signature` field is the seam for v0.5's KMS-signing
  integration. v0.4 ships without an `AuditSigner` interface — that
  comes in v0.5.

## Migration path

- v0.4 ships v4 records by default. v3 readers continue to work
  (additive shape change).
- v0.5 ships an `AuditSigner` interface; adopters who want
  cryptographic signatures wire a KMS-backed signer.
- v1.0 freezes the v4 shape (no v5 planned).

## Alternatives considered

### Embed verifier signature in `decision.basis`

Rejected. The basis is the kernel's vocabulary; signatures are an
audit-layer concern. Mixing them would force every basis-emitting
guard to know about audit hashing — a layering violation.

### Single hash over `(envelope, decision)` instead of full record

Rejected. Adopters who care about supersession lineage tampering
(post-v3.0 governance) need the supersession field bound to the hash.
Hashing only `(envelope, decision)` would let a malicious actor
relink supersession edges without detection.

### Required v4 (no opt-out)

Considered. Rejected because OSS adopters with existing v3 ingestion
pipelines should not be force-upgraded. The fields are optional;
adopters opt in to the policy/kernel-version recording via
`buildAuditInput.policyVersion` / `.kernelVersion`.

## References

- Implementation: `packages/core/src/audit.ts` (AuditRecord interface,
  buildAuditRecord, verifyAuditRecord, AuditRecordVerification).
- Migration: `packages/audit-postgres/migrations/008-add-v4-fields.sql`.
- Schema: `packages/admin-sdk/src/schemas/audit.ts`.
- Tests: `packages/core/tests/audit-record-v4.test.ts` (10 tests).
