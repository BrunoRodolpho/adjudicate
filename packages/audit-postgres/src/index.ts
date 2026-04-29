// @adjudicate/audit-postgres — durable governance trail in Postgres.

export {
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

export { legacyV1ToV2 } from "./legacy-v1-compat.js";

// ─── SDK-shape readers (Phase 1.5c) ─────────────────────────────────────────
// Implement the `@adjudicate/admin-sdk` AuditStore + governance-log
// contracts against the existing schema. `@adjudicate/admin-sdk` is an
// OPTIONAL peer dependency — adopters who only use this package for
// writing don't pay for the SDK at runtime.

export {
  buildWhereClauses,
  createPostgresAuditStore,
  decodeCursor,
  encodeCursor,
  type CreatePostgresAuditStoreDeps,
} from "./audit-store.js";

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
