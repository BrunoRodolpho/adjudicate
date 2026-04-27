-- IBX-IGE Postgres audit mirror — schema migration v2.
--
-- Adds:
--   - record_version SMALLINT — tracks the AuditRecord schema version (1 or 2).
--                               Existing v1 rows backfill to 1 via DEFAULT.
--   - plan_jsonb JSONB        — optional plan snapshot from CapabilityPlanner
--                               at decision time. NULL for v1 records and for
--                               v2 records that did not carry a plan.
--
-- Inherited by every existing partition automatically. New partitions created
-- by adopter tooling pick up the columns from the parent.

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS record_version SMALLINT NOT NULL DEFAULT 1
    CHECK (record_version IN (1, 2));

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS plan_jsonb JSONB NULL;

-- Constraint: plan_jsonb is only meaningful for v2+ records. v1 records MUST
-- have plan_jsonb NULL. v2 records MAY have it (it's still optional).
ALTER TABLE intent_audit ADD CONSTRAINT intent_audit_plan_v2_only
  CHECK (record_version >= 2 OR plan_jsonb IS NULL);

-- Index for queries that filter by plan presence (e.g., "show me decisions
-- that recorded the planner's tool list"). Partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_intent_audit_with_plan
  ON intent_audit (recorded_at DESC)
  WHERE plan_jsonb IS NOT NULL;
