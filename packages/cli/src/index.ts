// @adjudicate/cli — programmatic surface.
//
// This is the test/integration entry point for the CLI's commands and
// helpers. The bin entry (`./bin.ts`) wires these via commander; tests
// invoke them directly without going through argv parsing.

export {
  runPackInit,
  type PackInitOptions,
} from "./commands/pack-init.js";

export {
  runPackLint,
  type PackLintOptions,
} from "./commands/pack-lint.js";

export { runDoctor } from "./commands/doctor.js";

export {
  runSimulate,
  type SimulateOptions,
} from "./commands/simulate.js";

export {
  runReap,
  type ReapOptions,
  type ReapRedisClient,
  type ReapReport,
} from "./commands/reap.js";

export {
  runVisualize,
  type VisualizeOptions,
} from "./commands/visualize.js";

export {
  runRepl,
  type ReplOptions,
} from "./commands/repl.js";

export {
  runReplay,
  type ReplayOptions,
  type CliReplayReport,
} from "./commands/replay.js";

export {
  runExport,
  type ExportOptions,
  type ExportFormat,
} from "./commands/export.js";

export {
  runScenariosGenerate,
  type ScenariosGenerateOptions,
} from "./commands/scenarios-generate.js";

export {
  runRedTeamCommand,
  type RedTeamOptions,
} from "./commands/red-team.js";

export {
  runPackBom,
  type PackBomOptions,
} from "./commands/pack-bom.js";

export {
  runDev,
  type DevOptions,
  COMPOSE_FILENAME,
} from "./commands/dev.js";

export {
  detectWorkspace,
  type WorkspaceContext,
  type WorkspaceMode,
} from "./lib/workspace.js";

export {
  renderTemplate,
  type RenderResult,
  type RenderTemplateOptions,
  type TemplateVars,
} from "./lib/template.js";

export {
  loadScenario,
  loadIntentAndState,
  ScenarioParseError,
  type Scenario,
  type IntentInput,
} from "./lib/scenario.js";

export {
  loadPackFromModule,
  findPackExport,
  isLikelyPack,
} from "./lib/pack-loader.js";

export {
  render as renderSimulation,
  type SimulationOutput,
  type SimulationFormat,
} from "./lib/simulate-renderer.js";

export {
  listScenarios,
  runDiff,
  renderDiffText,
  renderDiffJson,
  computeExitCode,
  type DiffReport,
  type DiffSummary,
  type ScenarioResult,
  type ScenarioStatus,
} from "./lib/simulate-diff.js";
