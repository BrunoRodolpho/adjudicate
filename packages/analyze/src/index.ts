// @adjudicate/analyze — public surface.

export type {
  AnalysisReport,
  Analyzer,
  AnalyzeOptions,
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
} from "./types.js";

export {
  DEFAULT_ANALYZERS,
  basisCodeConsistencyAnalyzer,
  defaultPolarityAnalyzer,
  missingMetadataAnalyzer,
  rewriteScopeAnalyzer,
  signalConsistencyAnalyzer,
  taintPolicyAnalyzer,
} from "./analyzers.js";

export { analyzePolicy, type AnalyzePolicyArgs } from "./analyze.js";

export { renderJson, renderSarif, renderText } from "./render.js";
