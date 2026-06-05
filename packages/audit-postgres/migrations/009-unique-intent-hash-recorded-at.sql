-- 009-unique-intent-hash-recorded-at.sql
--
-- Fix the audit-sink ON CONFLICT arbiter (activation blocker, found cycle-32).
--
-- `INSERT_AUDIT_SQL` (postgres-sink.ts) performs idempotent audit writes with
--   ON CONFLICT (intent_hash, recorded_at) DO NOTHING
-- and its doc comment states this "matches the table's unique constraint".
-- But migration 001 created `idx_intent_audit_intent_hash` as a NON-UNIQUE
-- index — so no unique/exclusion constraint matches that ON CONFLICT target,
-- and every real sink write fails with Postgres 42P10
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification".
-- The audit-postgres unit tests only assert the SQL *string* (they never
-- execute it against the migrated schema), so the gap went uncaught until the
-- first live audited turn. Post-activation this fails CLOSED on every audited
-- mutation (the bridge refuses an unauditable mutation), so the cutover cannot
-- persist a single AuditRecord. This migration provides the missing arbiter.
--
-- Semantics: intent_audit is append-only. (intent_hash, recorded_at) is the
-- correct idempotency key:
--   * a re-emitted record at the SAME instant (retry) → DO NOTHING (deduped);
--   * a re-adjudication at a LATER recorded_at (e.g. parked-resume writes the
--     same intent_hash again) → a distinct row (both decisions audited).
-- recorded_at is the RANGE partition key, so it MUST be part of any unique
-- index on this partitioned table — it is.
--
-- Idempotent + safe to re-run. Converting the index to UNIQUE requires no
-- duplicate (intent_hash, recorded_at) pairs to pre-exist; if a deployment
-- already has duplicates (it should not, given the kernel's per-instant
-- determinism), de-duplicate before applying.

DROP INDEX IF EXISTS idx_intent_audit_intent_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_audit_intent_hash
  ON intent_audit (intent_hash, recorded_at);
