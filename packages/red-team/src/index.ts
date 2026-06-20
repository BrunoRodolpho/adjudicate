/**
 * @adjudicate/red-team — deterministic adversarial scenario generation.
 *
 * Generates prompt-injection, taint-escalation, and tool-scope-violation
 * scenarios from a Pack's declared surface and runs them through the PURE
 * kernel, asserting the policy's defenses hold (no clean EXECUTE escapes).
 * Same seed → byte-identical scenarios. No kernel changes; a consumer of the
 * existing taint/auth/business basis vocabulary.
 */

export {
  RED_TEAM_DEFAULT_SEED,
  lcg,
  type Rng,
} from "./prng.js";

export {
  NON_EXECUTE_DEFENSES,
  emptyStateFor,
  toSimulateScenario,
  type AttackVector,
  type GenerateOptions,
  type RedTeamPack,
  type RedTeamScenario,
  type ScenarioIntent,
} from "./scenario.js";

export { generatePromptInjectionEnvelopes } from "./vectors/prompt-injection.js";
export { generateProvenanceInjectionEnvelopes } from "./vectors/provenance-injection.js";
export {
  generateOwnershipViolationEnvelopes,
  generateReadInjectIntentEnvelopes,
  generateTaintEscalationEnvelopes,
  OWNERSHIP_VICTIM_PRINCIPAL,
  OWNERSHIP_VICTIM_RESOURCE,
} from "./vectors/taint-escalation.js";
export { generateToolScopeViolationEnvelopes } from "./vectors/tool-scope-violation.js";
export {
  OWNERSHIP_ATTACKER_PRINCIPAL,
  OWNERSHIP_ATTACKER_SESSION_ID,
  OWNERSHIP_FIXTURES,
  ownershipFixtureFor,
  type OwnershipAuthorityContext,
  type OwnershipFixture,
} from "./vectors/ownership-fixtures.js";

export {
  computeRedTeamExitCode,
  deriveCanaryBaseline,
  frozenCanaryScenarios,
  runBaselinedCanaryGate,
  runCanaryGate,
  runConfigSealCapEditRegression,
  runRedTeam,
  taintEscalationCausality,
  TAINT_GATE_BASIS,
  type BaselinedCanaryGateResult,
  type CanaryBaseline,
  type CanaryBaselineScenario,
  type CanaryExitCode,
  type CanaryGateResult,
  type CanaryPolicy,
  type CanaryStage,
  type CapEditRegressionResult,
  type RedTeamReport,
  type RedTeamResult,
  type RedTeamStatus,
  type RedTeamSummary,
  type TaintEscalationCausality,
} from "./runner.js";

export { renderRedTeamJson, renderRedTeamText } from "./render.js";

export { generateAllVectors } from "./vectors.js";

export {
  createInMemoryRedTeamHistoryStore,
  digestRedTeamReport,
  runRedTeamAcrossPacks,
  runStagedCanaryRollout,
  type RedTeamHistoryOptions,
  type RedTeamHistoryQuery,
  type RedTeamHistoryStore,
  type RedTeamHistoryView,
  type RedTeamRunRecord,
  type RedTeamTrendPoint,
  type StagedCanaryRolloutResult,
} from "./history.js";

export {
  createPostgresRedTeamHistoryStore,
  redTeamRunsDDL,
  type PostgresRedTeamHistoryStore,
  type PostgresRedTeamHistoryStoreOptions,
  type SqlExecutor,
} from "./history-postgres.js";
