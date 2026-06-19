// @adjudicate/audit-postgres — durable governance trail in Postgres.

export {
  INSERT_AUDIT_SQL,
  auditInsertParams,
  createPostgresSink,
  partitionMonthOf,
  recordToRow,
  type IntentAuditRow,
  type PostgresSinkOptions,
  type PostgresWriter,
} from "./postgres-sink.js";

export {
  readAuditWindow,
  rowToRecord,
  type AuditQueryFn,
  type AuditQueryFnWindow,
} from "./replay.js";

export {
  legacyV1ToV2,
  recordedAuthoritySnapshotFromRow,
} from "./legacy-v1-compat.js";

// ─── SDK-shape readers (Phase 1.5c) ─────────────────────────────────────────
// Implement the `@adjudicate/admin-sdk` AuditStore + governance-log
// contracts against the existing schema. `@adjudicate/admin-sdk` is an
// OPTIONAL peer dependency — adopters who only use this package for
// writing don't pay for the SDK at runtime.

export {
  InvalidCursorError,
  buildWhereClauses,
  createPostgresAuditStore,
  decodeCursor,
  encodeCursor,
  type CreatePostgresAuditStoreDeps,
} from "./audit-store.js";

// Turn-trace read store (responder-trace-admin C3) — reads the redacted,
// kernel-shaped `turn_trace` table the adopter writes.
export {
  createPostgresTurnTraceStore,
  type CreatePostgresTurnTraceStoreDeps,
} from "./turn-trace-store.js";

export {
  governanceEventToRow,
  rowToGovernanceEvent,
  type GovernanceEventRow,
} from "./governance-events.js";

export {
  createPostgresGovernanceLog,
  governanceInsertParams,
  INSERT_GOVERNANCE_EVENT_SQL,
  type CreatePostgresGovernanceLogDeps,
  type PostgresGovernanceLog,
} from "./governance-log.js";

export type {
  PostgresGovernanceWriter,
  PostgresReader,
} from "./pg-reader.js";

export {
  RESERVE_GUARD_STAT_SQL,
  UPSERT_GUARD_STAT_SQL,
  createPostgresGuardFireStatsStore,
  createPostgresReservationStore,
  type CreatePostgresGuardFireStatsStoreDeps,
  type CreatePostgresReservationStoreDeps,
  type GuardStatsWriter,
  type ReservationKey,
  type ReservationOutcome,
  type ReservationWriter,
} from "./guard-stats-store.js";

export {
  INSERT_OUTCOME_SQL,
  createPostgresOutcomeLookup,
  createPostgresOutcomeSink,
  loadOutcomesWindow,
  type CreatePostgresOutcomeSinkDeps,
  type OutcomesWriter,
} from "./outcomes-store.js";
