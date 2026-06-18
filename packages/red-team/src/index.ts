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
export { generateTaintEscalationEnvelopes } from "./vectors/taint-escalation.js";
export { generateToolScopeViolationEnvelopes } from "./vectors/tool-scope-violation.js";

export {
  computeRedTeamExitCode,
  runConfigSealCapEditRegression,
  runRedTeam,
  taintEscalationCausality,
  TAINT_GATE_BASIS,
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
  type RedTeamHistoryOptions,
  type RedTeamHistoryQuery,
  type RedTeamHistoryStore,
  type RedTeamHistoryView,
  type RedTeamRunRecord,
  type RedTeamTrendPoint,
} from "./history.js";

export {
  createPostgresRedTeamHistoryStore,
  redTeamRunsDDL,
  type PostgresRedTeamHistoryStore,
  type PostgresRedTeamHistoryStoreOptions,
  type SqlExecutor,
} from "./history-postgres.js";
