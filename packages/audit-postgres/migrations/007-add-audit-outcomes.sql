-- IBX-IGE Postgres audit mirror — schema migration v7.
--
-- Adds the audit_outcomes table — retrospective observations of what
-- actually happened after the kernel's Decision (SA2 Rec 6). Joined to
-- intent_audit by intent_hash so the decision-accuracy query can
-- correlate the kernel's call with reality.
--
-- Schema notes:
--   - One row per (intent_hash, at). Repeat observations are appended
--     rather than overwritten so the operator can see the timeline.
--   - `observed` is constrained to the kernel's three-valued vocabulary;
--     adopters who need richer taxonomy attach a sibling table.
--   - `note` is free-form, bounded at the application layer.

CREATE TABLE IF NOT EXISTS audit_outcomes (
  intent_hash  TEXT      NOT NULL,
  observed     TEXT      NOT NULL CHECK (observed IN ('succeeded', 'failed', 'withdrawn')),
  observed_at  TIMESTAMPTZ NOT NULL,
  note         TEXT      NULL,
  CONSTRAINT pk_audit_outcomes PRIMARY KEY (intent_hash, observed_at)
);

-- Predecessor-lookup: aggregate per-record decisions of the accuracy query.
CREATE INDEX IF NOT EXISTS idx_audit_outcomes_intent_hash
  ON audit_outcomes (intent_hash);
