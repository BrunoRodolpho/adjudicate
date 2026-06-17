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

export {
  analyzeComposition,
  type CompositionAnalyzeOptions,
  type CompositionCheck,
  type CompositionConflict,
  type CompositionReport,
} from "./composition.js";

export { renderJson, renderSarif, renderText } from "./render.js";

export {
  describePack,
  describeInstalledPacks,
  computeManifestDigest,
  diffPolicyManifests,
  type ManifestVersion,
  type GuardManifestNode,
  type DecisionEvidence,
  type DecisionOutcomeSummary,
  type IntentManifestNode,
  type PackManifestNode,
  type PolicyManifest,
  type DescribePackOptions,
  type DescribeManifestOptions,
  type DiffStatus,
  type PackDiff,
  type IntentDiff,
  type GuardDiff,
  type ManifestDiff,
} from "./manifest.js";

export { type NameSource, type Phase } from "./internal/walk.js";
