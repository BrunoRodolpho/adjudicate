-- @adjudicate/audit-postgres — schema migration v4.
--
-- Adds the `governance_events` table — a durable audit trail of human-
-- initiated state changes (kill-switch toggles, future Phase 2 operator
-- actions). Stored separately from `intent_audit` because operator
-- actions are low-volume, low-cardinality, and have a fundamentally
-- different shape: no envelope, no Decision, no PolicyBundle. Just
-- "who changed what to what, why, when."
--
-- Storage choice for `actor`: JSONB. The SDK's `Actor` type today is
-- `{ id, displayName? }` but is expected to grow (email, team, IP).
-- JSONB lets the SDK extend `Actor` without a schema migration; the
-- application-layer Zod validation is the canonical vocabulary gate.
--
-- Phase 1.5c uses this table as the durable LOG of operator actions.
-- The live `EmergencyState` itself (current status, in-memory today)
-- remains uncoordinated with the kernel's Redis-polled DistributedKillSwitch
-- — Phase 1.5d's Redis impl closes that loop end-to-end. This migration
-- lands the audit trail half independently.

CREATE TABLE IF NOT EXISTS governance_events (
  id              TEXT PRIMARY KEY,
  at              TIMESTAMPTZ NOT NULL,
  kind            TEXT NOT NULL,
  actor           JSONB NOT NULL,
  previous_status TEXT NOT NULL,
  new_status      TEXT NOT NULL,
  reason          TEXT NOT NULL
);

-- Newest-first scan is the dominant query.
CREATE INDEX IF NOT EXISTS idx_governance_events_at_desc
  ON governance_events (at DESC);

-- Expression index for "who toggled this" lookups. Cheap (low row count).
CREATE INDEX IF NOT EXISTS idx_governance_events_actor_id
  ON governance_events ((actor->>'id'));

-- Structural invariant: idempotent no-ops do NOT produce events
-- (enforced at the SDK store; mirrored here so a misbehaving writer
-- can't pollute the log). NOTE: status vocabulary CHECK is deliberately
-- absent — Zod is the canonical gate; coupling DB CHECKs to enum
-- changes creates unnecessary migrations as the framework evolves.
ALTER TABLE governance_events ADD CONSTRAINT
  governance_events_status_changed CHECK (previous_status != new_status);
