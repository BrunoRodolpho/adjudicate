-- IBX-IGE Postgres audit mirror — schema migration v6.
--
-- Adds the audit_guard_stats table — a daily aggregate of guard fires by
-- (guard_name, guard_phase, decision_kind). Written through by
-- `PostgresGuardFireStatsStore` from `@adjudicate/audit-postgres` when an
-- adopter wires it into the core `GuardFireStats` accumulator.
--
-- Schema notes:
--   - `day` is a DATE (YYYY-MM-DD) so the natural key fits the rolling-window
--     query shape and avoids storing redundant timestamps.
--   - `pack_id` is nullable: a Pack-aware `resolvePackId` populates it; the
--     default in-memory accumulator does not.
--   - `count` is incremental — UPSERTs add to the running total. The natural
--     key prevents duplication across writers.

CREATE TABLE IF NOT EXISTS audit_guard_stats (
  guard_name      TEXT        NOT NULL,
  guard_phase     TEXT        NOT NULL CHECK (guard_phase IN ('state', 'taint', 'auth', 'business')),
  decision_kind   TEXT        NOT NULL CHECK (decision_kind IN ('EXECUTE','REFUSE','REWRITE','DEFER','ESCALATE','REQUEST_CONFIRMATION')),
  day             DATE        NOT NULL,
  pack_id         TEXT        NULL,
  count           BIGINT      NOT NULL DEFAULT 0,
  CONSTRAINT pk_audit_guard_stats PRIMARY KEY (guard_name, guard_phase, decision_kind, day, pack_id)
);

-- Lookup index keyed by (day, pack_id) for window-scoped queries.
CREATE INDEX IF NOT EXISTS idx_audit_guard_stats_day_pack
  ON audit_guard_stats (day DESC, pack_id);
