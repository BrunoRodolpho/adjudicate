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
