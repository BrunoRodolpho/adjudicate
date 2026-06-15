-- 011-create-turn-trace.sql
--
-- responder-trace-admin C2/C3 — the `turn_trace` store: ONE row per LLM model
-- call (planner ×N + responder), grouped by turn_id. It carries the
-- content-addressed prompt manifest (id@hash), the REDACTED completion, tokens,
-- and the correlation keys. The adopter (ibatexas) WRITES it (redacting the
-- completion at write time through its audit redactor); the adjudicate console
-- READS it generically via createPostgresTurnTraceStore.
--
-- Placement mirrors intent_audit: a kernel-shaped, unqualified table in the same
-- database the console reads. It is a PLAIN table (not partitioned) — retention
-- is a time-based row DELETE on a dedicated, typically shorter window
-- (TURN_TRACE_RETENTION_DAYS), NOT the audit ledger's partition-drop. (A
-- partitioned variant is a future optimization if the trace volume warrants it.)
--
-- The adopter's writer also runs `CREATE TABLE IF NOT EXISTS` with the SAME
-- shape (turn-trace-writer.ts) so a deployment that has not yet applied this
-- migration still captures traces; this migration is the canonical definition.
--
-- Idempotent and safe to re-run.

CREATE TABLE IF NOT EXISTS turn_trace (
  id              BIGSERIAL PRIMARY KEY,
  turn_id         TEXT NOT NULL,
  call_index      INTEGER NOT NULL,
  conversation_id TEXT NOT NULL,
  intent_hash     TEXT,
  model           TEXT NOT NULL,
  temperature     DOUBLE PRECISION NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  prompt_manifest JSONB NOT NULL,
  completion      TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL,
  schema_version  INTEGER,
  UNIQUE (turn_id, call_index)
);

CREATE INDEX IF NOT EXISTS turn_trace_conversation_idx
  ON turn_trace (conversation_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS turn_trace_turn_idx
  ON turn_trace (turn_id, call_index);
CREATE INDEX IF NOT EXISTS turn_trace_recorded_idx
  ON turn_trace (recorded_at);
