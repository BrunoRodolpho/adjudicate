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
export {
  replayWithIntegrity,
  isReplayIntegrityClean,
  type IntegrityFailure,
  type ReplayIntegrityReport,
} from "./replay-integrity.js";
export {
  explainReplayReport,
  type ExplainReplayOptions,
  type ReplayExplainFormat,
} from "./explain-replay.js";

// Post-v1 replay-drift detector — turns a chronological sequence of
// ReplayReport samples into a deterministic trend classification.
// Closed vocabulary; pure; additive.
export {
  classifyReplayDrift,
  DEFAULT_DRIFT_THRESHOLDS,
  type ReplayDriftClass,
  type ReplayDriftPoint,
  type ReplayDriftReport,
  type ReplayDriftSample,
  type ReplayDriftThresholds,
} from "./replay-drift.js";

// Post-v1 supersession-chain analytics — reconstructs the chains formed by
// AuditRecord.supersedes links (v3+). Pure; deterministic; additive.
export {
  buildSupersessionChains,
  explainSupersessionChainReport,
  type SupersessionChain,
  type SupersessionChainNode,
  type SupersessionChainReport,
} from "./supersession-chain.js";

// Post-v1 kill-switch timeline analyser — summarises a sequence of
// kill-switch state transitions into a closed-vocabulary stability class.
export {
  analyzeKillSwitchTimeline,
  KILL_SWITCH_EVENT_SOURCES,
  type KillSwitchEvent,
  type KillSwitchEventKind,
  type KillSwitchEventSource,
  type KillSwitchStabilityClass,
  type KillSwitchTimelineOptions,
  type KillSwitchTimelineReport,
} from "./kill-switch-timeline.js";

export { isLedgerEnabled, isLedgerEnforced } from "./feature-flag.js";
export {
  startDistributedKillSwitch,
  type DistributedKillSwitchHandle,
  type DistributedKillSwitchOptions,
} from "./distributed-kill-switch.js";
export {
  startDistributedKillSwitchPubSub,
  type DistributedKillSwitchPubSubHandle,
  type DistributedKillSwitchPubSubOptions,
  type RedisPubSubClient,
} from "./kill-switch-pubsub.js";
export {
  createInMemoryAuditEventBus,
  createRedisAuditEventBus,
  bridgeAuditSinkToBus,
  type AuditEventBus,
  type AuditEventHandler,
  type BridgeAuditSinkToBusOptions,
  type BridgeBusFailure,
  type RedisAuditEventBusOptions,
} from "./event-bus.js";

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
