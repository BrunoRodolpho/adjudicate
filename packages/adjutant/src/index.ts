/**
 * @adjudicate/adjutant — subordinate operations surface.
 *
 * "Adjudicate decides; Adjutant carries out." Adjutant turns off-path signals
 * (audit bus, drift detector, LLM diagnosis) into draft envelopes that re-enter
 * the normal `adjudicate()` path. It has ZERO independent authority: no executor
 * of its own; every side effect routes through the adopter's
 * `AdopterExecutor.invokeIntent`, and only on a kernel EXECUTE.
 *
 * Phase 1 (this module): signal ingestion (SignalChannel), incident projection,
 * and the RemediationOrchestrator with the full SAFE/REVIEW/MANUAL outcome
 * mapping (SAFE auto = clamp REWRITE -> re-adjudicate -> EXECUTE). The operator
 * UI (apps/adjutant) is a separate, later deliverable.
 */

export * from "./types.js";
export {
  createRemediationOrchestrator,
  type RemediationOrchestrator,
  type RemediationOrchestratorOptions,
  type RemediationResolution,
  type ResolveArgs,
} from "./orchestrator.js";
export {
  createInMemoryRemediationProposalStore,
  type RemediationProposal,
  type RemediationProposalStatus,
  type RemediationProposalStore,
} from "./proposal-store.js";
export {
  createSignalChannel,
  auditBusToSignal,
  driftToSignal,
  type SignalChannel,
} from "./signal-channel.js";
export {
  createIncidentProjection,
  type IncidentProjection,
  type IncidentProjectionEntry,
} from "./incident-projection.js";
// P4 — durable Postgres-backed projection stores (project real agent_runs; no
// second adjudication). Synthesized SRE analogy is labeled in each module.
export {
  createPostgresRemediationProposalStore,
  remediationProposalsDDL,
  type PostgresRemediationProposalStore,
  type PostgresProposalStoreOptions,
  type SqlExecutor,
} from "./proposal-store-postgres.js";
export {
  createPostgresIncidentProjection,
  dispositionFromDecisionKind,
  type PostgresIncidentProjection,
  type PostgresIncidentProjectionOptions,
} from "./incident-projection-postgres.js";
