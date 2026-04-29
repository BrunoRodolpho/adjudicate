// @adjudicate/audit — execution ledger + durable audit sinks + replay.

export {
  type Ledger,
  type LedgerHit,
  type LedgerRecordInput,
  type LedgerRecordOutcome,
} from "./ledger.js";
export {
  createRedisLedger,
  type CreateRedisLedgerOptions,
  type RedisLedgerClient,
} from "./ledger-redis.js";
export { createMemoryLedger } from "./ledger-memory.js";

export {
  type AuditSink,
  AuditSinkError,
  bufferedSink,
  type BufferedSinkOptions,
  multiSink,
  multiSinkLossy,
  multiSinkStrict,
} from "./sink.js";
export {
  createInMemorySpillStorage,
  persistentBufferedSink,
  type PersistentBufferedSinkOptions,
  type PersistentBufferedSpillReason,
  type PersistentSpillStorage,
} from "./persistent-buffered-sink.js";
export {
  createConsoleSink,
  type ConsoleSinkOptions,
} from "./sink-console.js";
export {
  createNatsSink,
  type NatsPublisher,
  type NatsSinkOptions,
} from "./sink-nats.js";

export {
  classify,
  replay,
  type Adjudicator,
  type ReplayBasisDelta,
  type ReplayMismatch,
  type ReplayMismatchKind,
  type ReplayReport,
} from "./replay.js";

export { isLedgerEnabled, isLedgerEnforced } from "./feature-flag.js";
export {
  startDistributedKillSwitch,
  type DistributedKillSwitchHandle,
  type DistributedKillSwitchOptions,
} from "./distributed-kill-switch.js";

// ─── SDK-shape Redis emergency store (Phase 1.5d) ───────────────────────────
// Implements `@adjudicate/admin-sdk`'s EmergencyStateStore against the same
// Redis key format the kernel's `startDistributedKillSwitch` already polls.
// `@adjudicate/admin-sdk` is an OPTIONAL peer dependency — adopters who only
// use this package for kernel-runtime concerns don't pay for the SDK.

export {
  createRedisEmergencyStateStore,
  type CreateRedisEmergencyStateStoreOptions,
  type EmergencyHistoryLog,
} from "./redis-emergency-store.js";
