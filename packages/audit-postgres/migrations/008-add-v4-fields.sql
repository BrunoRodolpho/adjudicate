-- T-066 + T-067: AuditRecord v4 additive fields.
--
-- Adds the four new optional fields shipped in v4:
--   policy_version  TEXT NULL  — Pack.version at adjudication time
--   kernel_version  TEXT NULL  — @adjudicate/core version
--   audit_hash      TEXT NULL  — sha256 over the canonical record
--   signature_jsonb JSONB NULL — pluggable KMS signature
--
-- All four are NULL-safe: v3-shaped writers continue to work; v4-shaped
-- writers populate the new columns. Readers tolerate absence (the v3
-- AuditRecordSchema is a strict subset of v4).
--
-- Indexes:
--   - idx_intent_audit_policy_version supports "replay records as of
--     Pack v1.2.3" queries used by the historical-replay tooling.

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS policy_version  TEXT NULL,
  ADD COLUMN IF NOT EXISTS kernel_version  TEXT NULL,
  ADD COLUMN IF NOT EXISTS audit_hash      TEXT NULL,
  ADD COLUMN IF NOT EXISTS signature_jsonb JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_intent_audit_policy_version
  ON intent_audit (policy_version, recorded_at DESC)
  WHERE policy_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intent_audit_audit_hash
  ON intent_audit (audit_hash)
  WHERE audit_hash IS NOT NULL;
