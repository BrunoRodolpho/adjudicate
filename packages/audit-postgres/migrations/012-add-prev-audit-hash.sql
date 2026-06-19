-- 012-add-prev-audit-hash.sql
--
-- 093 — inter-record hash chain + read-path persistence completion.
--
-- Three ADDITIVE, idempotent columns (no CHECK widening, no index/arbiter
-- changes — migration 009's UNIQUE (intent_hash, recorded_at) and the
-- record_version CHECK (1..5) from 010 are untouched, so the 42P10/23514
-- activation blockers cannot recur):
--
--   1. prev_audit_hash (093 / T5) — the inter-record hash-chain link: the
--      `auditHash` of the immediately-preceding record in the SAME stream. NULL
--      for genesis records and for every pre-093 row. EXCLUDED from the auditHash
--      pre-image (threaded onto the record AFTER the hash, like
--      signature/metadata), so a NULL on older rows is correct and round-tripping
--      it never affects tamper-evidence.
--
--   2. authority_snapshot_jsonb (033 read-path completion / 092-F1) — the
--      RECORDED authority-graph snapshot the decision was injected with. Unlike
--      prev_audit_hash, this IS part of the auditHash pre-image. Until 093 the
--      sink never persisted it and `rowToRecord` never rehydrated it, so any
--      snapshot-bearing record round-tripped through Postgres would re-derive a
--      DIFFERENT auditHash and 092 verify-on-read would FALSELY flag it tampered
--      (fail-SAFE over-flag, never fail-open). This column + the matching
--      rehydrate in rowToRecord close that read-path gap.
--
--   3. aggregate_snapshot_jsonb (052 read-path completion / 092-F1) — the
--      RECORDED aggregate/limit snapshot the decision was injected with. Same
--      class as authority_snapshot_jsonb: IN the auditHash pre-image, previously
--      unpersisted → false-tamper on verify-on-read. Persisted + rehydrated here.
--
-- JSONB so the snapshot columns stay queryable; TEXT for the hash link. All
-- NULLABLE — every pre-existing row reads back byte-identically (no backfill),
-- and a non-injecting record continues to omit the field (hash-stable).

-- 1. prev_audit_hash — the per-stream cryptographic chain tip.
ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS prev_audit_hash TEXT;

-- 2. authority_snapshot_jsonb — recorded authority-graph snapshot (033), part of
--    the auditHash pre-image; MUST round-trip to avoid verify-on-read false-tamper.
ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS authority_snapshot_jsonb JSONB;

-- 3. aggregate_snapshot_jsonb — recorded aggregate/limit snapshot (052), part of
--    the auditHash pre-image; MUST round-trip to avoid verify-on-read false-tamper.
ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS aggregate_snapshot_jsonb JSONB;
