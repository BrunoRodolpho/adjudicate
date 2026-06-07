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
} from "../schemas/pii-classification.js";
import { createPiiClassificationHandler } from "../handlers/pii-classification.js";
import type { AuditStore } from "../store/index.js";
import type { EmergencyStateStore } from "../store/emergency-store.js";
import type { ReplayInvoker } from "../store/replay-invoker.js";

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
   * Optional retrospective-outcome sink. When supplied, the
   * `governance.recordOutcome` mutation forwards to it. The
   * `governance.decisionAccuracy` query additionally requires
   * `outcomeLookup` so it can join audit records with observations.
   */
  readonly outcomeSink?: OutcomeSink;
  readonly outcomeLookup?: InMemoryOutcomeSink | OutcomeLookup;
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

export const adminRouter = t.router({
  audit: auditRouter,
  emergency: emergencyRouter,
  replay: replayRouter,
  governance: governanceRouter,
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
