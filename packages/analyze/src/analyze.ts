/**
 * `analyzePolicy()` — the analyzer pipeline entry point.
 *
 * Runs every analyzer in `analyzers` (defaults to `DEFAULT_ANALYZERS`)
 * against a Pack, applies severity overrides, and returns an
 * `AnalysisReport`.
 */

import type { PackV0 } from "@adjudicate/core";
import { DEFAULT_ANALYZERS } from "./analyzers.js";
import type {
  AnalysisReport,
  Analyzer,
  AnalyzeOptions,
  Diagnostic,
  DiagnosticSeverity,
} from "./types.js";

export interface AnalyzePolicyArgs<K extends string, P, S, C>
  extends AnalyzeOptions {
  readonly pack: PackV0<K, P, S, C>;
  readonly analyzers?: ReadonlyArray<Analyzer>;
}

export function analyzePolicy<K extends string, P, S, C>(
  args: AnalyzePolicyArgs<K, P, S, C>,
): AnalysisReport {
  const analyzers = args.analyzers ?? DEFAULT_ANALYZERS;
  const overrides = args.severityOverrides ?? {};
  const strict = args.strict ?? false;
  const now = args.now ?? (() => new Date());
  const analyzedAt = now().toISOString();

  const allDiagnostics: Diagnostic[] = [];
  for (const analyzer of analyzers) {
    const raw = analyzer.analyze(args.pack);
    for (const d of raw) {
      const overridden = overrides[d.code];
      let severity: DiagnosticSeverity = overridden ?? d.severity;
      if (strict && severity === "warning") severity = "error";
      allDiagnostics.push({ ...d, severity });
    }
  }

  const summary = {
    error: allDiagnostics.filter((d) => d.severity === "error").length,
    warning: allDiagnostics.filter((d) => d.severity === "warning").length,
    note: allDiagnostics.filter((d) => d.severity === "note").length,
  };

  return {
    packId: args.pack.id,
    packVersion:
      "version" in args.pack && typeof args.pack.version === "string"
        ? args.pack.version
        : undefined,
    diagnostics: allDiagnostics,
    summary,
    passed: summary.error === 0,
    analyzedAt,
  };
}
