-- IBX-IGE Postgres audit mirror — schema migration v3.
--
-- Adds the v3 `supersedes` column linking each adjudication back to its
-- predecessor (REQUEST_CONFIRMATION resolved, DEFER resumed, REWRITE
-- executed, or replay).
--
-- Adds:
--   - supersedes_jsonb JSONB — optional predecessor link with shape
--                              { predecessorIntentHash, predecessorAt,
--                                reason, token? }. NULL for v1/v2 records.
--
-- Also widens the record_version CHECK constraint to allow 3, and adds an
-- index for predecessor-lookup queries.

ALTER TABLE intent_audit
  DROP CONSTRAINT IF EXISTS intent_audit_record_version_check;

ALTER TABLE intent_audit
  ADD CONSTRAINT intent_audit_record_version_check
    CHECK (record_version IN (1, 2, 3));

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS supersedes_jsonb JSONB NULL;

-- Constraint: supersedes_jsonb is only meaningful for v3+ records.
ALTER TABLE intent_audit ADD CONSTRAINT intent_audit_supersedes_v3_only
  CHECK (record_version >= 3 OR supersedes_jsonb IS NULL);

-- Partial index for predecessor-lookup queries — "find every record whose
-- supersedes.predecessorIntentHash = X". Kept partial (NOT NULL) so it
-- stays small.
CREATE INDEX IF NOT EXISTS idx_intent_audit_supersedes_predecessor
  ON intent_audit
  ((supersedes_jsonb ->> 'predecessorIntentHash'))
  WHERE supersedes_jsonb IS NOT NULL;
