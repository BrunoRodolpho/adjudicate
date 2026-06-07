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
  | "AJD-104" // RewriteScopeAnalyzer (Tier 1 — declaration check)
  | "AJD-105" // TaintPolicyAnalyzer
  | "AJD-106" // DefaultPolarityAnalyzer
  | "AJD-201" // RewriteScopeAstAnalyzer (Tier 2 — AST mutation check)
  | "AJD-202" // BasisCodeAstAnalyzer (Tier 2 — reserved)
  | "AJD-301" // PolicyCoherenceAnalyzer (Tier 3 — structural coherence)
  | string;  // Forward-compat: unknown codes pass through

/**
 * One diagnostic emitted by an analyzer. Mirrors SARIF Result shape.
 * Tier 1 analyzers only populate guard-keyed location (`phase`, `guardId`).
 * Tier 2 analyzers also populate `sourceLocation` so editors and
 * GitHub Code Scanning can deep-link to the offending source span.
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
  /**
   * Source location for Tier 2 (AST) diagnostics. Absent on Tier 1.
   * `file` is an absolute or workspace-relative path; `line`/`column`
   * are 1-indexed to match SARIF + IDE conventions.
   */
  readonly sourceLocation?: SourceLocation;
  /** Suggested fix text the analyzer can recommend (Tier 2). */
  readonly fixHint?: string;
}

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** Optional end position. */
  readonly endLine?: number;
  readonly endColumn?: number;
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
 * Tier 2 analyzer: walks source files in addition to inspecting the Pack
 * value. Tier 2 analyzers MUST be deterministic (same inputs → same
 * diagnostics) and SHOULD prefer low false-positive rates over coverage.
 *
 * `sourceFiles` is a pre-parsed `ts-morph` view of the relevant source.
 * Loaded by `analyzePolicy({ sourceFiles })`; absent for the Tier 1-only
 * `analyzePolicy({ pack })` path.
 */
export interface Tier2Analyzer {
  readonly name: string;
  readonly code: DiagnosticCode;
  /**
   * `sourceFiles` is `ReadonlyArray<unknown>` so this interface does not
   * leak `ts-morph` types to consumers that only use Tier 1. The
   * concrete analyzer narrows to `SourceFile[]` at the boundary.
   */
  analyze<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    sourceFiles: ReadonlyArray<unknown>,
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
  /**
   * Source-file globs (resolved by the caller into `ts-morph` SourceFile
   * objects) for Tier 2 analyzers. Absent → Tier 1 only.
   */
  readonly sourceFiles?: ReadonlyArray<unknown>;
  /** Tier 2 analyzers to run when `sourceFiles` is supplied. */
  readonly tier2Analyzers?: ReadonlyArray<Tier2Analyzer>;
  /**
   * Planner probe fixtures (state/context pairs) for Tier 3 (AJD-301). Absent →
   * Tier 3 is skipped. `ReadonlyArray<unknown>` so this interface does not
   * leak the `PlannerProbe` generic; the analyzer re-narrows.
   */
  readonly plannerProbes?: ReadonlyArray<unknown>;
  /** Tier 3 analyzers to run when `plannerProbes` is supplied. */
  readonly tier3Analyzers?: ReadonlyArray<Tier3AnalyzerLike>;
}

/** Structural Tier-3 analyzer shape (avoids a circular import of tier3.ts). */
export interface Tier3AnalyzerLike {
  readonly name: string;
  readonly code: DiagnosticCode;
  analyze(pack: unknown, probes: ReadonlyArray<unknown>): ReadonlyArray<Diagnostic>;
}
