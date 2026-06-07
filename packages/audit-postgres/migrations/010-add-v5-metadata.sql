-- 010-add-v5-metadata.sql
--
-- Activation blocker (audit 2026-06-07): @adjudicate/core bumped
-- AUDIT_RECORD_VERSION to 5 (ADR-124, v5 `metadata?` field) and the sink writes
-- `record_version: record.version` unconditionally — so EVERY audit insert now
-- carries record_version=5. But migration 008 last set the CHECK to
--   CHECK (record_version IN (1, 2, 3, 4))
-- so against any database migrated through 009, the FIRST sink.emit of any v5
-- record fails with Postgres 23514 (check_violation) on
-- intent_audit_record_version_check — independent of whether anyone enables
-- hallucination scoring. Post-activation the bridge fails CLOSED on every
-- audited mutation, so the cutover cannot persist a single AuditRecord.
--
-- This is the SAME class of regression migration 008 fixed for v4 (see its
-- header) — the version bump outran the schema. The unit suite (in-memory
-- mocks) did not catch it because it never executes SQL against the migrated
-- schema; integration.test.ts (gated on INTEGRATION_TEST=1) now exercises a
-- v5 + metadata round-trip so a live DB catches any recurrence.
--
-- Two additive changes, both idempotent and safe to re-run:
--   1. Widen the record_version CHECK to admit v5.
--   2. Add the nullable metadata_jsonb column backing AuditRecord.metadata
--      (v5+). metadata is EXCLUDED from the auditHash pre-image (ADR-124), so
--      it is post-hoc/async and a NULL on older rows is correct — round-tripping
--      it never affects tamper-evidence.

-- 1. Widen the record_version CHECK. Drop-then-add so the migration is
--    re-runnable and does not depend on the prior constraint's exact name set.
ALTER TABLE intent_audit
  DROP CONSTRAINT IF EXISTS intent_audit_record_version_check;
ALTER TABLE intent_audit
  ADD CONSTRAINT intent_audit_record_version_check
    CHECK (record_version IN (1, 2, 3, 4, 5));

-- 2. Add the nullable governance/observability metadata column. JSONB so it is
--    queryable; NULL for every pre-v5 row and for v5 rows with no metadata.
ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS metadata_jsonb JSONB;
