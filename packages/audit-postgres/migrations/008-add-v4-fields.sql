-- T-066 + T-067: AuditRecord v4 additive fields.
--
-- Adds the optional fields the kernel binds into the v4 tamper-evident
-- record:
--   policy_version        TEXT NULL  — Pack.version at adjudication time
--   kernel_version        TEXT NULL  — @adjudicate/core version
--   audit_hash            TEXT NULL  — sha256 over the canonical record
--   signature_jsonb       JSONB NULL — pluggable KMS signature { keyId, alg, value }
--   kernel_identity_jsonb JSONB NULL — kernel build (id, version); v3+, part of audit_hash
--
-- All are NULL-safe: v3-shaped writers continue to work; v4-shaped
-- writers populate the new columns. Readers tolerate absence (the v3
-- AuditRecordSchema is a strict subset of v4).
--
-- record_version CHECK: migration 005 last set it to IN (1, 2, 3). Since
-- @adjudicate/core stamps AUDIT_RECORD_VERSION = 4 on every record, the
-- constraint MUST be widened to include 4 here or every fresh insert
-- violates intent_audit_record_version_check. (Audit 2026-05-27 RC-K1 /
-- DataReviewer-001: migration 008 added the columns but forgot the CHECK.)
--
-- Indexes:
--   - idx_intent_audit_policy_version supports "replay records as of
--     Pack v1.2.3" queries used by the historical-replay tooling.
--   - idx_intent_audit_audit_hash supports tamper-evidence lookups.

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS policy_version        TEXT NULL,
  ADD COLUMN IF NOT EXISTS kernel_version        TEXT NULL,
  ADD COLUMN IF NOT EXISTS audit_hash            TEXT NULL,
  ADD COLUMN IF NOT EXISTS signature_jsonb       JSONB NULL,
  ADD COLUMN IF NOT EXISTS kernel_identity_jsonb JSONB NULL;

-- Widen the record_version CHECK to admit v4. Drop-then-add so the
-- migration is idempotent against a DB last migrated at 005.
ALTER TABLE intent_audit
  DROP CONSTRAINT IF EXISTS intent_audit_record_version_check;

ALTER TABLE intent_audit
  ADD CONSTRAINT intent_audit_record_version_check
    CHECK (record_version IN (1, 2, 3, 4));

CREATE INDEX IF NOT EXISTS idx_intent_audit_policy_version
  ON intent_audit (policy_version, recorded_at DESC)
  WHERE policy_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intent_audit_audit_hash
  ON intent_audit (audit_hash)
  WHERE audit_hash IS NOT NULL;
