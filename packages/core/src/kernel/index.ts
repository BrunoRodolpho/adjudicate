// @adjudicate/core/kernel — adjudicate, PolicyBundle, combinators
//                          + shadow-mode rollout, metrics, enforce-config.

export { adjudicate } from "./adjudicate.js";
export {
  adjudicateAndAudit,
  type AdjudicateAndAuditClock,
  type AdjudicateAndAuditDeps,
  type AdjudicateAndAuditResult,
} from "./adjudicate-and-audit.js";
export {
  adjudicateWithDeadline,
  type AdjudicateWithDeadlineOptions,
} from "./adjudicate-with-deadline.js";
export {
  adjudicateAndLearn,
  createConsoleLearningSink,
  flattenBasis,
  hasLearningSink,
  recordOutcome,
  setLearningSink,
  _resetLearningSink,
  type AdjudicateAndLearnOptions,
  type LearningEvent,
  type LearningSink,
} from "./learning.js";
export { allOf, constant, firstMatch } from "./combinators.js";
export type { Guard, PolicyBundle } from "./policy.js";

// Migrated from @ibatexas/llm-provider during consolidation — these are
// framework-generic kernel-adjacent concerns.
export * from "./shadow.js";
export * from "./metrics.js";
export * from "./enforce-config.js";
export {
  createRuntimeContext,
  getDefaultRuntimeContext,
  _resetDefaultRuntimeContext,
  type CreateRuntimeContextOptions,
  type EnforceConfig as RuntimeEnforceConfig,
  type KillSwitchControl,
  type KillSwitchState as RuntimeKillSwitchState,
  type LearningSinkSlot,
  type MetricsSinkSlot,
  type RuntimeContext,
  type ShadowTelemetrySinkSlot,
} from "./runtime-context.js";
export {
  checkRateLimit,
  createInMemoryRateLimitStore,
  createRateLimitGuard,
  type CheckRateLimitArgs,
  type RateLimitGuardOptions,
  type RateLimitResult,
  type RateLimitStore,
} from "./rate-limit.js";
