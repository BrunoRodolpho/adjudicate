/**
 * @adjudicate/analyze — public type surface.
 *
 * Diagnostic codes (AJD-NNN) are STABLE once shipped. Per ADR-109,
 * the closed-vocabulary discipline (rules from ADR-105) applies:
 * new diagnostics get new codes; old codes never change meaning.
 */

import type { PackV0 } from "@adjudicate/core";

/**
 * Severity ladder. Mirrors SARIF's `Result.level`.
 *
 * - `"error"`: blocks `--strict` runs; analyzer exits non-zero.
 * - `"warning"`: surfaces in output; does not block `--strict` by default.
 * - `"note"`: informational; useful for "consider doing X" hints.
 */
export type DiagnosticSeverity = "error" | "warning" | "note";

/**
 * Closed diagnostic code enum. Tier 1 (metadata-driven) reserves
 * AJD-101..AJD-110. Tier 2 (symbolic) reserves AJD-201..AJD-210
 * (post-M2). Tier 3 (fuzz) reserves AJD-301..AJD-310.
 *
 * Per ADR-109 governance:
 * - Variants are immutable once released.
 * - Severity may change between minor versions (note → warning →
 *   error) following the deprecation policy.
 * - Tooling MUST tolerate unknown codes (forward compat with
 *   experimental analyzers).
 */
export type DiagnosticCode =
  | "AJD-101" // MissingMetadataAnalyzer
  | "AJD-102" // SignalConsistencyAnalyzer
  | "AJD-103" // BasisCodeConsistencyAnalyzer
  | "AJD-104" // RewriteScopeAnalyzer
  | "AJD-105" // TaintPolicyAnalyzer
  | "AJD-106" // DefaultPolarityAnalyzer
  | string;  // Forward-compat: unknown codes pass through

/**
 * One diagnostic emitted by an analyzer. Mirrors SARIF Result shape
 * minus the heavy `locations.physicalLocation.region` (we work on
 * Pack objects, not source files, so locations are guard-keyed).
 */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  /** One-line summary. */
  readonly message: string;
  /** Long-form description (optional). */
  readonly description?: string;
  /** Guard index inside the matched phase, if applicable. */
  readonly guardId?: string;
  /** Phase (state/auth/business) the guard lives in. */
  readonly phase?: "state" | "auth" | "business";
  /** Free-form structured detail for tooling. */
  readonly detail?: Record<string, unknown>;
}

/**
 * The result of running every analyzer in the pipeline against a Pack.
 *
 * - `diagnostics`: every diagnostic emitted, ordered by analyzer
 *   sequence (deterministic).
 * - `summary`: error/warning/note counts.
 * - `passed`: convenience field; `summary.error === 0`.
 */
export interface AnalysisReport {
  readonly packId: string;
  readonly packVersion?: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly summary: {
    readonly error: number;
    readonly warning: number;
    readonly note: number;
  };
  readonly passed: boolean;
  /** ISO-8601 wall clock of the analysis run. Used only for output rendering. */
  readonly analyzedAt: string;
}

/**
 * Pluggable analyzer contract. Each analyzer receives the Pack and
 * returns its diagnostics. Stateless and pure — no I/O, no
 * `Date.now()`, no global state.
 */
export interface Analyzer {
  readonly name: string;
  readonly code: DiagnosticCode;
  analyze<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
  ): ReadonlyArray<Diagnostic>;
}

/**
 * Options for `analyzePolicy`. `severityOverrides` lets adopters tune
 * a noisy diagnostic without disabling it (e.g., downgrade AJD-101
 * from warning to note in a Pack with intentionally anonymous guards).
 */
export interface AnalyzeOptions {
  /** Override the default severity per diagnostic code. */
  readonly severityOverrides?: Readonly<Partial<Record<DiagnosticCode, DiagnosticSeverity>>>;
  /**
   * When true, escalate every `warning` to `error` for the purposes of
   * `report.passed`. Default false; CLI `--strict` flips it on.
   */
  readonly strict?: boolean;
  /** Wall clock for the `analyzedAt` field (test injection). */
  readonly now?: () => Date;
}
