import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { classify } from "@adjudicate/core";
import type {
  GuardFireStats,
  InMemoryOutcomeSink,
  OutcomeSink,
  PolicyBundleDescriptor,
} from "@adjudicate/core";
import { AuditRecordSchema } from "../schemas/audit.js";
import {
  EmergencyHistoryQuerySchema,
  EmergencyStateSchema,
  EmergencyUpdateInputSchema,
  GovernanceEventSchema,
  type Actor,
} from "../schemas/emergency.js";
import {
  AuditQuerySchema,
  AuditQueryResultSchema,
} from "../schemas/query.js";
import { IntentHashSchema } from "../schemas/common.js";
import {
  OutcomeDistributionQuerySchema,
  OutcomeDistributionResultSchema,
} from "../schemas/outcome-distribution.js";
import {
  GuardFireStatsQuerySchema,
  GuardFireStatsResultSchema,
} from "../schemas/guard-stats.js";
import { PolicyBundleDescriptorSchema } from "../schemas/policy-descriptor.js";
import {
  PolicyManifestSchema,
  type PolicyManifestParsed,
} from "../schemas/policy-manifest.js";
import {
  DecisionAccuracyQuerySchema,
  DecisionAccuracyResultSchema,
  RetrospectiveOutcomeSchema,
} from "../schemas/outcome-reconciliation.js";
import {
  createDecisionAccuracyHandler,
  createRecordOutcomeHandler,
  type OutcomeLookup,
} from "../handlers/outcome-reconciliation.js";
import { ReplayResultSchema } from "../schemas/replay.js";
import { createAuditQueryHandler } from "../handlers/audit-query.js";
import { createEmergencyHandler } from "../handlers/emergency.js";
import {
  createOutcomeDistributionHandler,
  type OutcomeDistributionStore,
} from "../handlers/outcome-distribution.js";
import { createGuardFireStatsHandler } from "../handlers/guard-stats.js";
import {
  PiiClassificationQuerySchema,
  PiiClassificationResultSchema,
  PiiEventsQuerySchema,
  PiiEventsResultSchema,
} from "../schemas/pii-classification.js";
import { createPiiClassificationHandler } from "../handlers/pii-classification.js";
import { createPiiEventsHandler } from "../handlers/pii-events.js";
import {
  CommandRiskEventsQuerySchema,
  CommandRiskEventsResultSchema,
  CommandRiskQuerySchema,
  CommandRiskResultSchema,
} from "../schemas/command-risk.js";
import {
  createCommandRiskEventsHandler,
  createCommandRiskStatsHandler,
} from "../handlers/command-risk.js";
import {
  RedTeamReportSchema,
  type RedTeamReportParsed,
} from "../schemas/red-team.js";
import {
  RedTeamHistoryQuerySchema,
  RedTeamHistoryResultSchema,
  type RedTeamHistoryQuery,
  type RedTeamHistoryResultParsed,
} from "../schemas/red-team-history.js";
import {
  BehavioralDriftResultSchema,
  DriftHistoryQuerySchema,
  DriftHistoryResultSchema,
  type BehavioralDriftResultParsed,
  type DriftHistoryQuery,
  type DriftHistoryResultParsed,
} from "../schemas/behavioral-drift.js";
import {
  CatchCountsResultSchema,
  type CatchCountsResult,
} from "../schemas/catches.js";
import {
  IncidentListQuerySchema,
  IncidentRowSchema,
  ProposalListQuerySchema,
  RemediationProposalSchema,
  type IncidentRowParsed,
  type RemediationProposalParsed,
} from "../schemas/adjutant.js";
import {
  TokenBudgetByTenantResultSchema,
  TokenBudgetQuerySchema,
  TokenBudgetResultSchema,
  TokenBudgetTenantQuerySchema,
  type TokenBudgetByTenantResult,
  type TokenBudgetQuery,
  type TokenBudgetResult,
  type TokenBudgetTenantQuery,
} from "../schemas/token-budget.js";
import {
  ConfigSealReportSchema,
  ConfigSealStatusAllResultSchema,
  type ConfigSealReportParsed,
  type PackConfigSealEntryParsed,
} from "../schemas/config-seal.js";
import {
  KillSwitchTimelineReportSchema,
  type KillSwitchTimelineReportParsed,
} from "../schemas/kill-switch-timeline.js";
import {
  ApprovalListQuerySchema,
  ApprovalRequestSchema,
  ApprovalResolveInputSchema,
  ApprovalHistoryQuerySchema,
  ApprovalHistoryResultSchema,
  ApprovalChainQuerySchema,
  ApprovalChainResultSchema,
  type ApprovalRequestParsed,
  type ApprovalResolveInput,
  type ApprovalHistoryQuery,
  type ApprovalHistoryResult,
  type ApprovalChainQuery,
  type ApprovalChainResult,
} from "../schemas/approval.js";
import {
  PolicyCoherenceReportSchema,
  type PolicyCoherenceReportParsed,
} from "../schemas/policy-coherence.js";
import {
  AiBomByIdQuerySchema,
  AiBomListResultSchema,
  AiBomSchema,
  pickLatestAiBom,
  toAiBomSummary,
  type AiBomParsed,
} from "../schemas/ai-bom.js";
import {
  MemorySnapshotQuerySchema,
  MemorySnapshotSchema,
} from "../schemas/memory.js";
import type { AuditStore } from "../store/index.js";
import type { EmergencyStateStore } from "../store/emergency-store.js";
import type { ReplayInvoker } from "../store/replay-invoker.js";
import type { TurnTraceStore } from "../store/turn-trace-store.js";
import {
  TraceByConversationQuerySchema,
  TraceByTurnQuerySchema,
  TurnTraceListSchema,
} from "../schemas/turn-trace.js";

/**
 * tRPC v11 router for the Admin Query Interface.
 *
 * Namespaces:
 *   audit.*       — read-only kernel-emitted decision audits
 *   emergency.*   — operator-initiated kill switch (state + update + history)
 *   replay.*      — verification: re-adjudicate a historical record
 *
 * Phase 2 namespaces (`tenant.*`, `pack.*`) land additively on the same
 * router; existing namespaces remain stable.
 */

export interface AdminContext {
  readonly store: AuditStore | (AuditStore & OutcomeDistributionStore);
  readonly emergencyStore: EmergencyStateStore;
  /**
   * Optional per-LLM-call trace store (responder-trace-admin C3). When omitted,
   * `trace.*` procedures throw PRECONDITION_FAILED so the surface is
   * feature-detectable at runtime (the adopter wires it only when the
   * turn_trace store is configured).
   */
  readonly turnTrace?: TurnTraceStore;
  /**
   * Resolved by the adopter's `createContext` from request headers via
   * `extractActor(req)`. `null` is allowed for queries; mutating
   * procedures (`emergency.update`) reject null with UNAUTHORIZED.
   */
  readonly actor: Actor | null;
  /**
   * Optional replay capability. When omitted, `replay.run` throws
   * PRECONDITION_FAILED — the procedure shape is static, runtime
   * feature-detection is via the error code.
   */
  readonly replayer?: ReplayInvoker;
  /**
   * Optional guard-fire stats accumulator (typically `RuntimeContext.learning`
   * wired to a `GuardFireStats` instance). When omitted, `governance.guardFireStats`
   * throws PRECONDITION_FAILED so the surface is feature-detectable at runtime.
   */
  readonly guardFireStats?: GuardFireStats;
  /**
   * Optional snapshot of the active policy bundle descriptor. The route
   * handler computes it from the installed Pack(s) at startup via
   * `describePolicyBundle(bundle)`. Omitted when no Pack is wired —
   * `governance.describePolicy` then throws PRECONDITION_FAILED.
   */
  readonly policyDescriptor?: PolicyBundleDescriptor;
  /**
   * Optional full policy manifest for one or more adopters — the rule-
   * provenance tree's data source (a superset of `policyDescriptor`). The
   * route handler loads it from the artifact an adopter generates via
   * `describeInstalledPacks(...)` (e.g. `ibx policy export`). Omitted when no
   * manifest is wired — `governance.policyManifest` then throws
   * PRECONDITION_FAILED so the surface is feature-detectable at runtime.
   */
  readonly policyManifest?: PolicyManifestParsed;
  /**
   * Optional retrospective-outcome sink. When supplied, the
   * `governance.recordOutcome` mutation forwards to it. The
   * `governance.decisionAccuracy` query additionally requires
   * `outcomeLookup` so it can join audit records with observations.
   */
  readonly outcomeSink?: OutcomeSink;
  readonly outcomeLookup?: InMemoryOutcomeSink | OutcomeLookup;
  /**
   * Optional pre-computed red-team report (ADR-118). The route handler runs
   * `@adjudicate/red-team` against the installed Pack at startup and threads the
   * report here; `governance.redTeam` throws PRECONDITION_FAILED when absent.
   */
  readonly redTeamReport?: RedTeamReportParsed;
  /**
   * Optional bounded red-team run-history port (ADR-133). The route handler runs
   * the suite across `PackRegistry.all()`, records each report into an
   * `@adjudicate/red-team` history store, and exposes its `view()` (filtered by
   * the query). `governance.redTeamHistory` throws PRECONDITION_FAILED when
   * absent — the same runtime feature-detection posture as `redTeamReport`.
   */
  readonly redTeamHistory?: {
    view(input: RedTeamHistoryQuery): RedTeamHistoryResultParsed;
  };
  /**
   * Optional behavioral-drift detector port (ADR-119). The route handler wires
   * an @adjudicate/drift detector (fed from the audit stream/store) and exposes
   * its `snapshot()`; `governance.behavioralDrift` throws PRECONDITION_FAILED
   * when absent.
   */
  readonly driftDetector?: { snapshot(): BehavioralDriftResultParsed };
  /**
   * Optional bounded drift-history time-series port (ADR-132). The route
   * handler wires an @adjudicate/drift `DriftHistory` (snapshots recorded on a
   * cadence — quarters for the demo replay, an adopter's own cadence on a live
   * bus) and exposes its `view()` windowed to the query `limit`.
   * `governance.driftHistory` throws PRECONDITION_FAILED when absent — the same
   * runtime feature-detection posture as `driftDetector`.
   */
  readonly driftHistory?: {
    query(input: DriftHistoryQuery): DriftHistoryResultParsed;
  };
  /**
   * Optional token-budget telemetry store (ADR-120, extended ADR-135), fed by
   * the adapter's `onTokenUsage` hook. `query` (per-session, back-compat) and
   * the additive `queryByTenant` (per-tenant + exhaustion timeline) are both
   * optional so single-method adopters still typecheck. `governance.tokenBudget`
   * throws PRECONDITION_FAILED when the port is absent;
   * `governance.tokenBudgetByTenant` throws PRECONDITION_FAILED when
   * `queryByTenant` is absent.
   *
   * DETERMINISM: this is a TELEMETRY read port, outside the determinism
   * boundary. It never feeds a kernel decision — enforcement stays in
   * `createTokenBudgetGuard` (input is adopter state S, not this port).
   */
  readonly tokenBudget?: {
    query(input: TokenBudgetQuery): Promise<TokenBudgetResult>;
    queryByTenant?(input: TokenBudgetTenantQuery): Promise<TokenBudgetByTenantResult>;
  };
  /**
   * Optional "caught a bad call" telemetry port (item 7), fed from a
   * `CatchUsageStore` (the adapter's `onCatch` hook). `governance.catches`
   * throws PRECONDITION_FAILED when absent. TELEMETRY — outside the determinism
   * boundary, never a kernel input.
   */
  readonly catches?: {
    query(): Promise<CatchCountsResult>;
  };
  /**
   * Optional Adjutant operator-surface ports (task 13). `incidentsPort` JOINs
   * the IncidentProjection over IncidentState; `proposalsPort` lists the
   * RemediationProposalStore read-model. `adjutant.*` throws PRECONDITION_FAILED
   * when absent. The approvals queue reuses `approvalPort` (approval.list/resolve).
   */
  readonly incidentsPort?: {
    list(filter?: { status?: string; limit?: number }): Promise<ReadonlyArray<IncidentRowParsed>>;
  };
  readonly proposalsPort?: {
    list(filter?: {
      incidentId?: string;
      status?: string;
      limit?: number;
    }): Promise<ReadonlyArray<RemediationProposalParsed>>;
  };
  /**
   * Optional config-seal verification report (ADR-121), computed at startup via
   * `verifyConfigSeal(pack, seal)`. `governance.configSealStatus` throws
   * PRECONDITION_FAILED when absent.
   */
  readonly configSealStatus?: ConfigSealReportParsed;
  /**
   * Optional multi-pack config-seal report set (ADR-131). The adopter verifies
   * each installed pack via `verifyConfigSeal(pack, sealPackConfig(pack))` and
   * wires the entries (each carrying a derived structured `violations[]`) here.
   * `governance.configSealStatusAll` throws PRECONDITION_FAILED when absent.
   * Additive sibling to `configSealStatus`, which is unchanged.
   */
  readonly configSealReports?: ReadonlyArray<PackConfigSealEntryParsed>;
  /**
   * Optional kill-switch activation-timeline report (ADR-131). The route handler
   * maps `emergency.history` (GovernanceEvent) onto KillSwitchEvent[] and runs
   * `analyzeKillSwitchTimeline(...)` (pure, adopter-side) at startup / per
   * request, then threads the report here. `governance.killSwitchTimeline`
   * throws PRECONDITION_FAILED when absent.
   */
  readonly killSwitchTimeline?: KillSwitchTimelineReportParsed;
  /**
   * Optional Tier-3 policy-coherence report (ADR-125), computed at startup via
   * `analyzePolicy({ pack, plannerProbes })`. `governance.policyCoherence`
   * throws PRECONDITION_FAILED when absent.
   */
  readonly policyCoherence?: PolicyCoherenceReportParsed;
  /**
   * Optional approval-engine port (ADR-122, extended ADR-136). The route
   * handler adapts a concrete `@adjudicate/approval-engine` to this narrow
   * surface. `approval.list`/`approval.resolve` throw PRECONDITION_FAILED when
   * the port is absent; `approval.history`/`approval.chain` throw
   * PRECONDITION_FAILED when the OPTIONAL `history`/`chain` members are absent
   * (same runtime feature-detection posture as `driftDetector`).
   */
  readonly approvalPort?: {
    list(filter: { status?: string; sessionId?: string; limit?: number }): Promise<ReadonlyArray<ApprovalRequestParsed>>;
    resolve(input: ApprovalResolveInput, by: { id: string; displayName?: string }): Promise<ApprovalRequestParsed>;
    /**
     * Read-only decision history (ADR-136): resolved/expired approvals from the
     * registry projection. Optional — `approval.history` is PRECONDITION_FAILED
     * when unwired.
     */
    history?(input: ApprovalHistoryQuery): Promise<ApprovalHistoryResult>;
    /**
     * Read-only audit chain (ADR-136): request → resolved → resumed, joined by
     * walking the frozen `AuditRecord.supersedes` lineage via `ctx.store`.
     * Optional — `approval.chain` is PRECONDITION_FAILED when unwired.
     */
    chain?(input: ApprovalChainQuery): Promise<ApprovalChainResult>;
  };
  /** Optional AI-BOM for the installed Pack (ADR-127); `pack.aiBom` PRECONDITION_FAILED when absent. */
  readonly aiBom?: AiBomParsed;
  /**
   * Optional multi-pack AI-BOM set (ADR-130). The adopter computes
   * `generateAiBom(...)` per `PackRegistry.all()` entry and wires the array
   * here. `pack.aiBomList`/`pack.aiBomById` PRECONDITION_FAILED when absent —
   * but BOTH fall back to `[ctx.aiBom]` when only the legacy single BOM is
   * wired, so existing adopters keep a working Explorer. Kept additive: the
   * existing `aiBom` field is unchanged.
   */
  readonly aiBoms?: ReadonlyArray<AiBomParsed>;
  /** Optional read-only session-memory lookup (ADR-126); `memory.bySession` PRECONDITION_FAILED when absent. */
  readonly memoryLookup?: { get(sessionId: string): Promise<unknown | null> };
}

const t = initTRPC.context<AdminContext>().create();

const auditRouter = t.router({
  query: t.procedure
    .input(AuditQuerySchema)
    .output(AuditQueryResultSchema)
    .query(async ({ input, ctx }) => {
      // Audit reads expose tenant-scoped governance data — require an
      // authenticated actor (AuthReviewer-004), consistent with the mutating
      // procedures. Missing actor is UNAUTHORIZED, not an empty result.
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for audit queries",
        });
      }
      const handler = createAuditQueryHandler({ store: ctx.store });
      return handler(input);
    }),
  byHash: t.procedure
    .input(z.object({ intentHash: IntentHashSchema }))
    .output(AuditRecordSchema.nullable())
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for audit queries",
        });
      }
      return ctx.store.getByIntentHash(input.intentHash);
    }),
});

const emergencyRouter = t.router({
  state: t.procedure
    .output(EmergencyStateSchema)
    .query(async ({ ctx }) => {
      const handler = createEmergencyHandler({
        stateStore: ctx.emergencyStore,
      });
      return handler.getState();
    }),

  history: t.procedure
    .input(EmergencyHistoryQuerySchema)
    .output(z.array(GovernanceEventSchema).readonly())
    .query(async ({ input, ctx }) => {
      const handler = createEmergencyHandler({
        stateStore: ctx.emergencyStore,
      });
      return handler.history(input.limit);
    }),

  update: t.procedure
    .input(EmergencyUpdateInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "x-adjudicate-actor-id header required for mutating procedures",
        });
      }
      const handler = createEmergencyHandler({
        stateStore: ctx.emergencyStore,
      });
      return handler.update(input, ctx.actor);
    }),
});

const replayRouter = t.router({
  /**
   * Re-adjudicate a historical AuditRecord against currently-installed
   * policy. Modeled as a mutation (not a query) because:
   *   - It's an explicit operator action, not a passive read
   *   - It invokes the kernel synchronously (potentially expensive)
   *   - We don't want it to auto-run on mount via React Query defaults
   */
  run: t.procedure
    .input(z.object({ intentHash: IntentHashSchema }))
    .output(ReplayResultSchema)
    .mutation(async ({ input, ctx }) => {
      // Replay re-adjudicates a historical record — an explicit operator
      // action that must be attributable (AuthReviewer-004). Guard before
      // the replayer feature-detection so an unauthenticated caller gets
      // UNAUTHORIZED rather than PRECONDITION_FAILED.
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for replay mutations",
        });
      }
      if (!ctx.replayer) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Replay capability not configured. Wire a ReplayInvoker into the route handler context.",
        });
      }
      const original = await ctx.store.getByIntentHash(input.intentHash);
      if (!original) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No audit record found for intentHash ${input.intentHash}`,
        });
      }
      const { decision: recomputed, stateSource } = await ctx.replayer.replay(
        original,
      );
      // Reuse the kernel's existing classifier — single source of truth
      // for the diff rule (DECISION_KIND > BASIS_DRIFT > REFUSAL_CODE_DRIFT).
      const classification = classify(
        original.intentHash,
        original.decision,
        recomputed,
      );
      return {
        original,
        recomputed,
        classification,
        stateSource,
      };
    }),
});

const governanceRouter = t.router({
  /**
   * Time-bucketed distribution of `Decision.kind` over a window. Drives the
   * console's outcome-distribution dashboard.
   */
  outcomeDistribution: t.procedure
    .input(OutcomeDistributionQuerySchema)
    .output(OutcomeDistributionResultSchema)
    .query(async ({ input, ctx }) => {
      const handler = createOutcomeDistributionHandler({ store: ctx.store });
      return handler(input);
    }),

  /**
   * Data-classification (PII) dispositions over a window, bucketed by
   * (sensitivityLevel × disposition). Drives the console's PII panel
   * (ADR-117). Reads the same AuditStore as outcomeDistribution — no extra
   * context wiring required.
   */
  piiClassificationStats: t.procedure
    .input(PiiClassificationQuerySchema)
    .output(PiiClassificationResultSchema)
    .query(async ({ input, ctx }) => {
      const handler = createPiiClassificationHandler({ store: ctx.store });
      return handler(input);
    }),

  /**
   * Event-level data-classification drill-down (ADR-129) — individual PII
   * disposition events (no raw values), newest-first, for the console's PII
   * Events table. Record-level governance data, so it requires an authenticated
   * actor (consistent with audit.query). Reads the same AuditStore.
   */
  piiEvents: t.procedure
    .input(PiiEventsQuerySchema)
    .output(PiiEventsResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for PII event drill-down",
        });
      }
      const handler = createPiiEventsHandler({ store: ctx.store });
      return handler(input);
    }),

  /**
   * Command-risk dispositions over a window, bucketed by (category ×
   * disposition). Drives the console's Command Risk panel (ADR-134, ADR-123).
   * Reads the same AuditStore as outcomeDistribution — no extra context wiring.
   *
   * SECURITY: the result schema carries ONLY the closed-enum category +
   * disposition and integer counts. The raw command string (which may contain
   * secrets) is never read into the result, and the `.output()` Zod gate has no
   * field that could serialize it. Aggregate is unauthenticated-friendly like
   * piiClassificationStats — it leaks no per-record data.
   */
  commandRisk: t.procedure
    .input(CommandRiskQuerySchema)
    .output(CommandRiskResultSchema)
    .query(async ({ input, ctx }) => {
      const handler = createCommandRiskStatsHandler({ store: ctx.store });
      return handler(input);
    }),

  /**
   * Event-level command-risk drill-down (ADR-134) — individual command-risk
   * disposition events, newest-first, for the console's blocked-commands list.
   * Record-level governance data, so it requires an authenticated actor
   * (consistent with audit.query / piiEvents). Reads the same AuditStore.
   *
   * SECURITY: each event row carries ONLY intentHash + at + intentKind +
   * decisionKind + closed-enum category/disposition. The raw command, sanitized
   * command, stripped flags, and matched rule ids are NEVER surfaced — the
   * schema has no field that could carry the (tainted, secret-bearing) command.
   */
  commandRiskEvents: t.procedure
    .input(CommandRiskEventsQuerySchema)
    .output(CommandRiskEventsResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "x-adjudicate-actor-id header required for command-risk event drill-down",
        });
      }
      const handler = createCommandRiskEventsHandler({ store: ctx.store });
      return handler(input);
    }),

  /**
   * Tier-3 policy-coherence report (AJD-301, ADR-125). Throws
   * PRECONDITION_FAILED when no report is wired into context.
   */
  policyCoherence: t.procedure
    .output(PolicyCoherenceReportSchema)
    .query(async ({ ctx }) => {
      if (!ctx.policyCoherence) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Policy-coherence report not configured. Compute analyzePolicy({ pack, plannerProbes }) at startup and wire it into context.",
        });
      }
      return ctx.policyCoherence;
    }),

  /**
   * Config-integrity seal status for the installed Pack (ADR-121). Throws
   * PRECONDITION_FAILED when no seal report is wired into context.
   */
  configSealStatus: t.procedure
    .output(ConfigSealReportSchema)
    .query(async ({ ctx }) => {
      if (!ctx.configSealStatus) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Config-seal status not configured. Compute verifyConfigSeal(pack, seal) at startup and wire the report into context.",
        });
      }
      return ctx.configSealStatus;
    }),

  /**
   * Multi-pack config-integrity seal status (ADR-131) — one entry per installed
   * pack, each wrapping the existing per-pack `ConfigSealReport` with a
   * `packId`/`packVersion` and a derived structured `violations[]`. Additive
   * sibling of `configSealStatus`; the single-pack procedure is unchanged.
   * Throws PRECONDITION_FAILED when no multi-pack reports are wired into context.
   */
  configSealStatusAll: t.procedure
    .output(ConfigSealStatusAllResultSchema)
    .query(async ({ ctx }) => {
      if (!ctx.configSealReports) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Multi-pack config-seal reports not configured. Verify each installed pack via verifyConfigSeal(pack, sealPackConfig(pack)) and wire ctx.configSealReports.",
        });
      }
      return { entries: [...ctx.configSealReports] };
    }),

  /**
   * Kill-switch activation-timeline roll-up (ADR-131) — exposes the existing
   * pure producer `analyzeKillSwitchTimeline` (`@adjudicate/audit`) over tRPC.
   * The analyzer runs adopter-side (map `emergency.history` → KillSwitchEvent[]),
   * and the report is threaded as a read — same posture as `redTeam`,
   * `policyCoherence`, and `aiBom`. Throws PRECONDITION_FAILED when no report is
   * wired into context.
   */
  killSwitchTimeline: t.procedure
    .output(KillSwitchTimelineReportSchema)
    .query(async ({ ctx }) => {
      if (!ctx.killSwitchTimeline) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Kill-switch timeline not configured. Map emergency.history to KillSwitchEvent[] and run analyzeKillSwitchTimeline at the route handler, then wire ctx.killSwitchTimeline.",
        });
      }
      return ctx.killSwitchTimeline;
    }),

  /**
   * Per-session token-budget telemetry (ADR-120). Throws PRECONDITION_FAILED
   * when no token-budget store is wired into context.
   */
  tokenBudget: t.procedure
    .input(TokenBudgetQuerySchema)
    .output(TokenBudgetResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.tokenBudget) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Token-budget store not configured. Wire a store fed by the adapter's onTokenUsage hook into the route handler context.",
        });
      }
      return ctx.tokenBudget.query(input);
    }),

  /**
   * Per-tenant token-budget telemetry + the budget-exhaustion timeline
   * (ADR-135). Additive sibling of `governance.tokenBudget` (which stays
   * session-only and byte-compatible). Throws PRECONDITION_FAILED when the
   * store's `queryByTenant` method is not wired — the same runtime
   * feature-detection posture as `tokenBudget`.
   *
   * DETERMINISM: read-only telemetry, outside the determinism boundary. The
   * exhaustion events are a denormalized read-model, never an audit record and
   * never a kernel input.
   */
  tokenBudgetByTenant: t.procedure
    .input(TokenBudgetTenantQuerySchema)
    .output(TokenBudgetByTenantResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.tokenBudget?.queryByTenant) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Tenant token-budget store not configured. Wire a TokenUsageStore (fed by onTokenUsage) exposing queryByTenant into the route handler context.",
        });
      }
      return ctx.tokenBudget.queryByTenant(input);
    }),

  /**
   * "Caught a bad call" telemetry (item 7) — aggregated out-of-plan catch
   * counts. Throws PRECONDITION_FAILED when no CatchUsageStore is wired. The
   * console card SUMS this total with the existing REWRITE outcome bucket into
   * one "caught N bad calls" headline.
   */
  catches: t.procedure
    .output(CatchCountsResultSchema)
    .query(async ({ ctx }) => {
      if (!ctx.catches) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Catch store not configured. Wire a CatchUsageStore fed by the adapter's onCatch hook into the route handler context.",
        });
      }
      return ctx.catches.query();
    }),

  /**
   * Behavioral/statistical drift snapshot (ADR-119) — decision-distribution
   * shift over a baseline-vs-recent window. Distinct from the operational
   * DriftPanel. Throws PRECONDITION_FAILED when no detector is wired.
   */
  behavioralDrift: t.procedure
    .output(BehavioralDriftResultSchema)
    .query(async ({ ctx }) => {
      if (!ctx.driftDetector) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Behavioral-drift detector not configured. Wire an @adjudicate/drift detector into the route handler context.",
        });
      }
      return ctx.driftDetector.snapshot();
    }),

  /**
   * Bounded drift-history time-series (ADR-132) — the per-dimension TVD +
   * alert-count roll-up of recorded detector snapshots over time, so an
   * operator can see whether a TVD spike is new / recovering / sustained. The
   * `limit` windows the timeline to the last N retained points. Throws
   * PRECONDITION_FAILED when no history is wired.
   */
  driftHistory: t.procedure
    .input(DriftHistoryQuerySchema)
    .output(DriftHistoryResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.driftHistory) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Drift-history store not configured. Wire an @adjudicate/drift DriftHistory into the route handler context.",
        });
      }
      return ctx.driftHistory.query(input);
    }),

  /**
   * Pre-computed adversarial red-team report for the installed Pack (ADR-118).
   * Throws PRECONDITION_FAILED when no report is wired into context.
   */
  redTeam: t.procedure
    .output(RedTeamReportSchema)
    .query(async ({ ctx }) => {
      if (!ctx.redTeamReport) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Red-team report not configured. Run @adjudicate/red-team against the installed Pack and wire the report into the route handler context.",
        });
      }
      return ctx.redTeamReport;
    }),

  /**
   * Bounded red-team run-history (ADR-133) — per-pack run records (newest-first)
   * plus a defended/escaped/error trend over runs, so an operator can see
   * whether a pack's adversarial posture is improving, holding, or regressing.
   * `packId` restricts to one pack; `limit` windows to the last N runs per pack.
   * Throws PRECONDITION_FAILED when no history is wired.
   */
  redTeamHistory: t.procedure
    .input(RedTeamHistoryQuerySchema)
    .output(RedTeamHistoryResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.redTeamHistory) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Red-team history store not configured. Record @adjudicate/red-team reports into a history store and wire it into the route handler context.",
        });
      }
      return ctx.redTeamHistory.view(input);
    }),

  /**
   * Per-guard fire counts in a rolling window. Drives the console's
   * governance visualiser. Throws PRECONDITION_FAILED when no
   * GuardFireStats is wired into context.
   */
  guardFireStats: t.procedure
    .input(GuardFireStatsQuerySchema)
    .output(GuardFireStatsResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.guardFireStats) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Guard-fire stats not configured. Wire a GuardFireStats instance into the route handler context.",
        });
      }
      const handler = createGuardFireStatsHandler({
        stats: ctx.guardFireStats,
      });
      return handler(input);
    }),

  /**
   * Snapshot of the installed policy bundle's structure (phases + guard
   * metadata). Drives the console's governance visualiser. Computed from
   * `describePolicyBundle(bundle)` at route-handler startup; threaded
   * through context so the procedure stays a pure read.
   */
  describePolicy: t.procedure
    .output(PolicyBundleDescriptorSchema)
    .query(async ({ ctx }) => {
      if (!ctx.policyDescriptor) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Policy descriptor not configured. Wire a PolicyBundleDescriptor into the route handler context (typically via describePolicyBundle(pack.policy)).",
        });
      }
      // The schema intentionally widens GuardDescription to a passthrough
      // object so unknown ADR-105 variants flow through. The structural
      // mismatch (closed core union vs permissive wire object) means TS
      // needs the cast at the seam.
      return ctx.policyDescriptor as unknown as z.infer<
        typeof PolicyBundleDescriptorSchema
      >;
    }),

  /**
   * Full policy manifest (per-adopter packs → intents → guards, taint floors,
   * outcomes, basis codes, source provenance) — the rule-provenance tree's
   * data source. A superset of `describePolicy`. Loaded from the adopter's
   * generated artifact (e.g. `ibx policy export`) and threaded through context
   * so the procedure stays a pure read. Throws PRECONDITION_FAILED when no
   * manifest is wired.
   */
  policyManifest: t.procedure
    .output(PolicyManifestSchema)
    .query(async ({ ctx }) => {
      if (!ctx.policyManifest) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Policy manifest not configured. Wire a PolicyManifest into the route handler context (typically the artifact from describeInstalledPacks / `ibx policy export`).",
        });
      }
      return ctx.policyManifest;
    }),

  /**
   * Record a retrospective outcome — the upstream observation that the
   * decision's action actually succeeded / failed / was withdrawn. Joins
   * back to the AuditRecord by `intentHash`. Mutating procedure — requires
   * the actor header.
   */
  recordOutcome: t.procedure
    .input(RetrospectiveOutcomeSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "x-adjudicate-actor-id header required for mutating procedures",
        });
      }
      if (!ctx.outcomeSink) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Outcome sink not configured. Wire an OutcomeSink into the route handler context.",
        });
      }
      const handler = createRecordOutcomeHandler({ sink: ctx.outcomeSink });
      return handler(input);
    }),

  /**
   * Aggregate decision-accuracy stats: how many EXECUTE records in the
   * window have a matching observation, and how many of those reported
   * success vs failure vs withdrawn.
   */
  decisionAccuracy: t.procedure
    .input(DecisionAccuracyQuerySchema)
    .output(DecisionAccuracyResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.outcomeLookup) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Outcome lookup not configured. Wire an InMemoryOutcomeSink (or other OutcomeLookup) into the route handler context.",
        });
      }
      const handler = createDecisionAccuracyHandler({
        auditStore: ctx.store,
        outcomeLookup: ctx.outcomeLookup,
      });
      return handler(input);
    }),
});

const approvalRouter = t.router({
  /** List approval requests (ADR-122). Requires an actor. */
  list: t.procedure
    .input(ApprovalListQuerySchema)
    .output(z.array(ApprovalRequestSchema))
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "actor required" });
      }
      if (!ctx.approvalPort) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Approval engine not configured. Wire an approval port into context.",
        });
      }
      return [...(await ctx.approvalPort.list(input))];
    }),

  /** Approve or decline a pending confirmation. Mutating — requires an actor. */
  resolve: t.procedure
    .input(ApprovalResolveInputSchema)
    .output(ApprovalRequestSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "actor required" });
      }
      if (!ctx.approvalPort) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Approval engine not configured. Wire an approval port into context.",
        });
      }
      return ctx.approvalPort.resolve(input, { id: ctx.actor.id, ...(ctx.actor.displayName ? { displayName: ctx.actor.displayName } : {}) });
    }),

  /**
   * Decision history (ADR-136) — resolved/expired approvals from the registry
   * projection. Read-only; requires an actor. PRECONDITION_FAILED when the
   * optional `history` port member is unwired (feature-detection). The
   * `resolvedBy` actor is a CLAIM until real per-operator identity (OIDC).
   */
  history: t.procedure
    .input(ApprovalHistoryQuerySchema)
    .output(ApprovalHistoryResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "actor required" });
      }
      if (!ctx.approvalPort?.history) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Approval history not configured. Wire a persisted approval registry with a history projection into context.",
        });
      }
      return ctx.approvalPort.history(input);
    }),

  /**
   * Audit chain (ADR-136) — given an intentHash, walk the frozen
   * `AuditRecord.supersedes` lineage (confirmation_resolved / defer_resumed) to
   * reconstruct request → resolved → resumed. Read-only; requires an actor.
   * PRECONDITION_FAILED when the optional `chain` port member is unwired.
   */
  chain: t.procedure
    .input(ApprovalChainQuerySchema)
    .output(ApprovalChainResultSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "actor required" });
      }
      if (!ctx.approvalPort?.chain) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Approval chain not configured. Wire a persisted approval registry with a chain walker into context.",
        });
      }
      return ctx.approvalPort.chain(input);
    }),
});

const memoryRouter = t.router({
  /** Cross-session memory snapshot for a session (ADR-126). Requires an actor. */
  bySession: t.procedure
    .input(MemorySnapshotQuerySchema)
    .output(MemorySnapshotSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "actor required" });
      }
      if (!ctx.memoryLookup) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Memory lookup not configured. Wire a read-only memory view into context.",
        });
      }
      const memory = await ctx.memoryLookup.get(input.sessionId);
      return { sessionId: input.sessionId, present: memory !== null, memory, retrievedAt: new Date().toISOString() };
    }),
});

/**
 * Resolve the wired AI-BOM set, falling back to the legacy single `ctx.aiBom`
 * for back-compat (ADR-130). Returns `undefined` when neither is configured so
 * callers can raise PRECONDITION_FAILED uniformly.
 */
function resolveAiBoms(ctx: AdminContext): ReadonlyArray<AiBomParsed> | undefined {
  if (ctx.aiBoms) return ctx.aiBoms;
  if (ctx.aiBom) return [ctx.aiBom];
  return undefined;
}

const packRouter = t.router({
  /** AI Bill-of-Materials for the installed Pack (ADR-127). */
  aiBom: t.procedure
    .output(AiBomSchema)
    .query(async ({ ctx }) => {
      if (!ctx.aiBom) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI-BOM not configured. Compute generateAiBom(...) at startup and wire it into context.",
        });
      }
      return ctx.aiBom;
    }),

  /**
   * Cheap summary list of every wired Pack's AI-BOM (ADR-130) for the
   * Explorer's left rail. Read-only and non-sensitive (no actor required,
   * consistent with `pack.aiBom`); the signature VALUE is never surfaced (only
   * `signed: boolean`). PRECONDITION_FAILED when no BOMs are wired; falls back
   * to `[ctx.aiBom]` when only the legacy single BOM is configured.
   */
  aiBomList: t.procedure
    .output(AiBomListResultSchema)
    .query(async ({ ctx }) => {
      const all = resolveAiBoms(ctx);
      if (!all) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "AI-BOM list not configured. Compute generateAiBom(...) per PackRegistry.all() and wire ctx.aiBoms.",
        });
      }
      return { boms: all.map(toAiBomSummary) };
    }),

  /**
   * Full AI-BOM for one Pack (ADR-130). When `packVersion` is omitted the
   * deterministic latest is returned (semver-max, `bomDigest` tiebreak — no
   * wall-clock). NOT_FOUND when no BOM matches; PRECONDITION_FAILED when no
   * BOMs are wired at all. Read-only and non-sensitive (no actor required).
   */
  aiBomById: t.procedure
    .input(AiBomByIdQuerySchema)
    .output(AiBomSchema)
    .query(async ({ input, ctx }) => {
      const all = resolveAiBoms(ctx);
      if (!all) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "AI-BOM list not configured. Compute generateAiBom(...) per PackRegistry.all() and wire ctx.aiBoms.",
        });
      }
      const matches = all.filter(
        (b) =>
          b.packId === input.packId &&
          (input.packVersion === undefined || b.packVersion === input.packVersion),
      );
      if (matches.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No AI-BOM for ${input.packId}${input.packVersion ? "@" + input.packVersion : ""}`,
        });
      }
      return pickLatestAiBom(matches);
    }),
});

const adjutantRouter = t.router({
  /**
   * Incident rows for the operator surface (task 13) — a JOIN of the
   * IncidentProjection over IncidentState. PRECONDITION_FAILED when no incidents
   * port is wired.
   */
  incidents: t.procedure
    .input(IncidentListQuerySchema)
    .output(z.array(IncidentRowSchema))
    .query(async ({ input, ctx }) => {
      if (!ctx.incidentsPort) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Incidents port not configured. Wire an Adjutant IncidentProjection JOIN into the route handler context.",
        });
      }
      return [...(await ctx.incidentsPort.list(input))];
    }),
  /**
   * Remediation proposals read-model. PRECONDITION_FAILED when no proposals port
   * is wired.
   */
  proposals: t.procedure
    .input(ProposalListQuerySchema)
    .output(z.array(RemediationProposalSchema))
    .query(async ({ input, ctx }) => {
      if (!ctx.proposalsPort) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Proposals port not configured. Wire an Adjutant RemediationProposalStore into the route handler context.",
        });
      }
      return [...(await ctx.proposalsPort.list(input))];
    }),
});

/**
 * Turn-trace router (responder-trace-admin C3) — reads the generic, redacted
 * `turn_trace` store. `byTurn` returns the model calls for one turn (planner→
 * responder); `byConversation` returns the whole conversation's calls so the
 * console can render one timeline grouped by turnId. PRECONDITION_FAILED when
 * no turn_trace store is wired (feature-detectable surface).
 */
const traceRouter = t.router({
  byTurn: t.procedure
    .input(TraceByTurnQuerySchema)
    .output(TurnTraceListSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for trace queries",
        });
      }
      if (!ctx.turnTrace) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Turn-trace store not configured. Wire a TurnTraceStore into the route handler context.",
        });
      }
      return { calls: [...(await ctx.turnTrace.byTurn(input.turnId))] };
    }),
  byConversation: t.procedure
    .input(TraceByConversationQuerySchema)
    .output(TurnTraceListSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.actor) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "x-adjudicate-actor-id header required for trace queries",
        });
      }
      if (!ctx.turnTrace) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Turn-trace store not configured. Wire a TurnTraceStore into the route handler context.",
        });
      }
      const calls = await ctx.turnTrace.byConversation(
        input.conversationId,
        input.limit,
      );
      return { calls: [...calls] };
    }),
});

export const adminRouter = t.router({
  audit: auditRouter,
  emergency: emergencyRouter,
  replay: replayRouter,
  governance: governanceRouter,
  approval: approvalRouter,
  pack: packRouter,
  memory: memoryRouter,
  adjutant: adjutantRouter,
  trace: traceRouter,
});

export type AdminRouter = typeof adminRouter;

/**
 * Server-side caller factory for tests and same-process invocation.
 *
 *   const caller = createAdminCaller({ store, emergencyStore, actor, replayer });
 *   await caller.audit.query({ limit: 10 });
 *   await caller.replay.run({ intentHash: "0xabc..." });
 */
export const createAdminCaller = t.createCallerFactory(adminRouter);
