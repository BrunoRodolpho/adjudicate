// @adjudicate/admin-sdk — public surface.
//
// The tRPC router lives at `@adjudicate/admin-sdk/trpc` so adopters who
// don't want tRPC don't pay the dep cost. The Next adapter lives at
// `@adjudicate/admin-sdk/adapters/next` for the same reason.

// ─── Audit schemas ──────────────────────────────────────────────────────────
export {
  IntentActorSchema,
  IntentEnvelopeSchema,
  TaintSchema,
} from "./schemas/envelope.js";

export { BasisCategorySchema, DecisionBasisSchema } from "./schemas/basis.js";

export { RefusalKindSchema, RefusalSchema } from "./schemas/refusal.js";

export { DecisionKindSchema, DecisionSchema } from "./schemas/decision.js";

export {
  AuditPlanSnapshotSchema,
  AuditRecordSchema,
  AuditRecordVerificationSchema,
  SupersessionReasonSchema,
  SupersessionSchema,
} from "./schemas/audit.js";

export {
  AuditQuerySchema,
  AuditQueryResultSchema,
  type AuditQuery,
  type AuditQueryResult,
} from "./schemas/query.js";

// ─── Emergency schemas + types ──────────────────────────────────────────────
export {
  ActorSchema,
  EmergencyHistoryQuerySchema,
  EmergencyStateSchema,
  EmergencyStatusSchema,
  EmergencyUpdateInputSchema,
  GovernanceEventSchema,
  type Actor,
  type EmergencyHistoryQuery,
  type EmergencyState,
  type EmergencyStatus,
  type EmergencyUpdateInput,
  type GovernanceEvent,
} from "./schemas/emergency.js";

// ─── Audit store ────────────────────────────────────────────────────────────
export {
  type AuditStore,
  type InMemoryAuditStoreOptions,
  createInMemoryAuditStore,
} from "./store/index.js";

// ─── Turn-trace store (responder-trace-admin C3) ─────────────────────────────
export {
  type TurnTraceStore,
  type TurnTraceCall,
  type InMemoryTurnTraceStoreOptions,
  TURN_TRACE_DEFAULT_LIMIT,
  createInMemoryTurnTraceStore,
} from "./store/turn-trace-store.js";
export {
  TurnTraceCallSchema,
  TurnTraceListSchema,
  TraceByTurnQuerySchema,
  TraceByConversationQuerySchema,
  type TurnTraceCallDTO,
} from "./schemas/turn-trace.js";

// ─── Emergency store ────────────────────────────────────────────────────────
export {
  type EmergencyStateStore,
  type EmergencyUpdateRequest,
  type EmergencyUpdateResult,
  type InMemoryEmergencyStateStoreOptions,
  createInMemoryEmergencyStateStore,
} from "./store/emergency-store.js";

// ─── Governance schemas + types ─────────────────────────────────────────────
export {
  OutcomeBucketSchema,
  OutcomeDistributionQuerySchema,
  OutcomeDistributionResultSchema,
  type OutcomeBucket,
  type OutcomeDistributionQuery,
  type OutcomeDistributionResult,
} from "./schemas/outcome-distribution.js";

export {
  GuardFireBucketSchema,
  GuardFireStatsQuerySchema,
  GuardFireStatsResultSchema,
  GuardPhaseSchema,
  type GuardFireBucket as GuardFireBucketParsed,
  type GuardFireStatsQuery as GuardFireStatsQueryParsed,
  type GuardFireStatsResult,
  type GuardPhase as GuardPhaseParsed,
} from "./schemas/guard-stats.js";

export {
  PiiClassificationBucketSchema,
  PiiClassificationQuerySchema,
  PiiClassificationResultSchema,
  PiiDispositionSchema,
  SensitivityLevelSchema,
  PiiEventSchema,
  PiiEventsQuerySchema,
  PiiEventsResultSchema,
  type PiiClassificationBucket,
  type PiiClassificationQuery,
  type PiiClassificationResult,
  type PiiEvent,
  type PiiEventsQuery,
  type PiiEventsResult,
} from "./schemas/pii-classification.js";

export {
  CommandRiskBucketSchema,
  CommandRiskCategorySchema,
  CommandRiskDispositionSchema,
  CommandRiskEventSchema,
  CommandRiskEventsQuerySchema,
  CommandRiskEventsResultSchema,
  CommandRiskQuerySchema,
  CommandRiskResultSchema,
  type CommandRiskBucket,
  type CommandRiskCategory,
  type CommandRiskDisposition,
  type CommandRiskEvent,
  type CommandRiskEventsQuery,
  type CommandRiskEventsResult,
  type CommandRiskQuery,
  type CommandRiskResult,
} from "./schemas/command-risk.js";

export {
  AttackVectorSchema,
  RedTeamReportSchema,
  RedTeamResultSchema,
  RedTeamStatusSchema,
  RedTeamSummarySchema,
  type RedTeamReportParsed,
} from "./schemas/red-team.js";

export {
  RedTeamHistoryQuerySchema,
  RedTeamHistoryResultSchema,
  RedTeamRunRecordSchema,
  RedTeamTrendPointSchema,
  type RedTeamHistoryQuery,
  type RedTeamHistoryResultParsed,
  type RedTeamRunRecordParsed,
  type RedTeamTrendPointParsed,
} from "./schemas/red-team-history.js";

export {
  BehavioralDriftResultSchema,
  DriftAlertSchema,
  DriftDimensionNameSchema,
  DriftDimensionSnapshotSchema,
  DriftHistoryDimensionEntrySchema,
  DriftHistoryEntrySchema,
  DriftHistoryQuerySchema,
  DriftHistoryResultSchema,
  DriftSignalKindSchema,
  type BehavioralDriftResultParsed,
  type DriftHistoryDimensionEntryParsed,
  type DriftHistoryEntryParsed,
  type DriftHistoryQuery,
  type DriftHistoryResultParsed,
} from "./schemas/behavioral-drift.js";

export {
  TokenBudgetByTenantResultSchema,
  TokenBudgetQuerySchema,
  TokenBudgetResultSchema,
  TokenBudgetSessionSchema,
  TokenBudgetTenantQuerySchema,
  TokenBudgetTenantSchema,
  TokenExhaustionEventSchema,
  TokenScopeSchema,
  type TokenBudgetByTenantResult,
  type TokenBudgetQuery,
  type TokenBudgetResult,
  type TokenBudgetSession,
  type TokenBudgetTenant,
  type TokenBudgetTenantQuery,
  type TokenExhaustionEvent,
  type TokenScope,
} from "./schemas/token-budget.js";

export {
  ConfigSealReportSchema,
  ConfigSealStatusAllResultSchema,
  PackConfigSealEntrySchema,
  SealViolationKindSchema,
  SealViolationSchema,
  deriveSealViolations,
  type ConfigSealReportParsed,
  type ConfigSealStatusAllResultParsed,
  type PackConfigSealEntryParsed,
  type SealViolationKindParsed,
  type SealViolationParsed,
} from "./schemas/config-seal.js";

export {
  KillSwitchEventSourceSchema,
  KillSwitchStabilityClassSchema,
  KillSwitchTimelineReportSchema,
  type KillSwitchEventSourceParsed,
  type KillSwitchStabilityClassParsed,
  type KillSwitchTimelineReportParsed,
} from "./schemas/kill-switch-timeline.js";

export {
  ApprovalListQuerySchema,
  ApprovalRequestSchema,
  ApprovalResolveInputSchema,
  ApprovalStatusSchema,
  ApprovalHistoryQuerySchema,
  ApprovalHistoryEntrySchema,
  ApprovalHistoryResultSchema,
  ApprovalChainQuerySchema,
  ApprovalChainStepKindSchema,
  ApprovalChainStepSchema,
  ApprovalChainResultSchema,
  type ApprovalRequestParsed,
  type ApprovalResolveInput,
  type ApprovalHistoryQuery,
  type ApprovalHistoryEntry,
  type ApprovalHistoryResult,
  type ApprovalChainQuery,
  type ApprovalChainStepKind,
  type ApprovalChainStep,
  type ApprovalChainResult,
} from "./schemas/approval.js";
export {
  RemediationDispositionSchema,
  PendingActionSchema,
  IncidentDependencySchema,
  IncidentRowSchema,
  IncidentListQuerySchema,
  RemediationProposalStatusSchema,
  RemediationProposalSchema,
  ProposalListQuerySchema,
  type IncidentRowParsed,
  type IncidentListQuery,
  type RemediationProposalParsed,
  type ProposalListQuery,
  type RemediationDispositionParsed,
} from "./schemas/adjutant.js";

export {
  CoherenceDiagnosticSchema,
  PolicyCoherenceReportSchema,
  type PolicyCoherenceReportParsed,
} from "./schemas/policy-coherence.js";

export {
  AiBomByIdQuerySchema,
  AiBomListResultSchema,
  AiBomRagRefSchema,
  AiBomSchema,
  AiBomSummarySchema,
  AiBomToolRefSchema,
  pickLatestAiBom,
  toAiBomSummary,
  type AiBomByIdQueryParsed,
  type AiBomListResultParsed,
  type AiBomParsed,
  type AiBomRagRefParsed,
  type AiBomSummaryParsed,
  type AiBomToolRefParsed,
} from "./schemas/ai-bom.js";

export {
  MemorySnapshotQuerySchema,
  MemorySnapshotSchema,
  type MemorySnapshotParsed,
} from "./schemas/memory.js";

export {
  GuardDescriptionSchema,
  GuardDescriptorSchema,
  GuardMetadataSchema,
  PolicyBundleDescriptorSchema,
  PolicyPhaseDescriptorSchema,
  PolicyPhaseSchema,
  type PolicyBundleDescriptorParsed,
} from "./schemas/policy-descriptor.js";

export {
  SourceLocationSchema,
  GuardManifestNodeSchema,
  DecisionEvidenceSchema,
  DecisionOutcomeSummarySchema,
  IntentManifestNodeSchema,
  PackManifestNodeSchema,
  PolicyManifestSchema,
  type PolicyManifestParsed,
  type PackManifestNodeParsed,
  type IntentManifestNodeParsed,
  type GuardManifestNodeParsed,
} from "./schemas/policy-manifest.js";

export {
  DecisionAccuracyQuerySchema,
  DecisionAccuracyResultSchema,
  ObservedOutcomeSchema,
  RetrospectiveOutcomeSchema,
  type DecisionAccuracyQuery,
  type DecisionAccuracyResult,
  type RetrospectiveOutcomeParsed,
} from "./schemas/outcome-reconciliation.js";

// ─── Handlers ───────────────────────────────────────────────────────────────
export {
  createAuditQueryHandler,
  type CreateAuditQueryHandlerDeps,
} from "./handlers/audit-query.js";

export {
  createEmergencyHandler,
  type CreateEmergencyHandlerDeps,
} from "./handlers/emergency.js";

export {
  createOutcomeDistributionHandler,
  type CreateOutcomeDistributionHandlerDeps,
  type OutcomeDistributionStore,
} from "./handlers/outcome-distribution.js";

export {
  createGuardFireStatsHandler,
  type CreateGuardFireStatsHandlerDeps,
} from "./handlers/guard-stats.js";

export {
  createPiiClassificationHandler,
  type CreatePiiClassificationHandlerDeps,
} from "./handlers/pii-classification.js";

export {
  createPiiEventsHandler,
  type CreatePiiEventsHandlerDeps,
} from "./handlers/pii-events.js";

export {
  createCommandRiskStatsHandler,
  createCommandRiskEventsHandler,
  type CreateCommandRiskStatsHandlerDeps,
  type CreateCommandRiskEventsHandlerDeps,
} from "./handlers/command-risk.js";

// ─── Auth utility ───────────────────────────────────────────────────────────
export { extractActor } from "./auth/extract-actor.js";

// ─── Replay schemas + types (Phase 2b) ──────────────────────────────────────
export {
  ReplayBasisDeltaSchema,
  ReplayMismatchKindSchema,
  ReplayMismatchSchema,
  ReplayResultSchema,
  StateSourceSchema,
  type ReplayBasisDeltaParsed,
  type ReplayMismatchKindParsed,
  type ReplayMismatchParsed,
  type ReplayResult,
  type StateSource,
} from "./schemas/replay.js";

// ─── Replay invoker contract ────────────────────────────────────────────────
export {
  ReplayError,
  type ReplayErrorCode,
  type ReplayInvoker,
} from "./store/replay-invoker.js";
