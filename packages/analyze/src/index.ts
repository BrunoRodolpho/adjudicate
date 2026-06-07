// @adjudicate/analyze — public surface.

export type {
  AnalysisReport,
  Analyzer,
  AnalyzeOptions,
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  SourceLocation,
  Tier2Analyzer,
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

export {
  DEFAULT_TIER2_ANALYZERS,
  loadSourceFiles,
  rewriteScopeAstAnalyzer,
} from "./tier2.js";

export {
  DEFAULT_TIER3_ANALYZERS,
  policyCoherenceAnalyzer,
  type PlannerProbe,
  type Tier3Analyzer,
} from "./tier3.js";

export { analyzePolicy, type AnalyzePolicyArgs } from "./analyze.js";

export { renderJson, renderSarif, renderText } from "./render.js";
