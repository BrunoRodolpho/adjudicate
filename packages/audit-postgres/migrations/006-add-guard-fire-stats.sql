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
--   - `count` is incremental — UPSERTs add to the running total. The PK arbiter
--     prevents duplication across writers.
--
-- 052 — THE PK ARBITER (atomic/coalescing counting; avoids silent 42P10/23502).
--   `pack_id` is part of the PRIMARY KEY, which is the conflict target of the
--   additive `ON CONFLICT (...) DO UPDATE SET count = count + EXCLUDED.count`
--   upsert (guard-stats-store.ts). A PK column MUST be NOT NULL — and Postgres
--   treats NULL as DISTINCT in unique/PK arbiters, so a nullable `pack_id`
--   breaks the counter in two ways:
--     (a) the default (no-pack) accumulator writes `pack_id` and a NULL would
--         violate the implicit NOT NULL of the PK column (Postgres 23502); and
--     (b) even as a non-null-key, two NULL-pack rows would NOT conflict, so the
--         arbiter never matches and the upsert INSERTs duplicate rows instead of
--         aggregating — the over-count failure mode.
--   So `pack_id` is `NOT NULL DEFAULT ''`: the no-pack case stores the
--   empty-string sentinel (the store writes '' for the default accumulator), the
--   PK arbiter matches deterministically, and the additive upsert coalesces every
--   write atomically in a single statement (no read-modify-write race).

CREATE TABLE IF NOT EXISTS audit_guard_stats (
  guard_name      TEXT        NOT NULL,
  guard_phase     TEXT        NOT NULL CHECK (guard_phase IN ('state', 'taint', 'auth', 'business')),
  decision_kind   TEXT        NOT NULL CHECK (decision_kind IN ('EXECUTE','REFUSE','REWRITE','DEFER','ESCALATE','REQUEST_CONFIRMATION')),
  day             DATE        NOT NULL,
  pack_id         TEXT        NOT NULL DEFAULT '',
  count           BIGINT      NOT NULL DEFAULT 0,
  CONSTRAINT pk_audit_guard_stats PRIMARY KEY (guard_name, guard_phase, decision_kind, day, pack_id)
);

-- Lookup index keyed by (day, pack_id) for window-scoped queries.
CREATE INDEX IF NOT EXISTS idx_audit_guard_stats_day_pack
  ON audit_guard_stats (day DESC, pack_id);
