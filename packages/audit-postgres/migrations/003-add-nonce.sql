-- Migration 003 — add the `nonce` column for envelope v2 (T8).
--
-- Pre-T8 the IntentEnvelope hashed `(version, kind, payload, createdAt,
-- actor, taint)`. Adopters who rebuilt envelopes on retry without
-- preserving `createdAt` produced a different intentHash and silently
-- broke ledger dedup. v2 introduces an explicit `nonce` field that IS
-- the hash input; `createdAt` becomes descriptive metadata.
--
-- v1 rows do NOT carry a nonce. The replay reader's `legacyV1ToV2`
-- synthesizes one from the historical createdAt so the v1 envelope's
-- intentHash reproduces. Live writes are v2, so new rows always have a
-- non-null nonce.
--
-- Idempotent: safe to apply multiple times.

ALTER TABLE intent_audit
  ADD COLUMN IF NOT EXISTS nonce TEXT NULL;

-- Optional supporting index for forensic lookups by nonce. Safe to skip
-- in production deployments that primarily query by intent_hash.
CREATE INDEX IF NOT EXISTS intent_audit_nonce_idx
  ON intent_audit (nonce)
  WHERE nonce IS NOT NULL;
