/**
 * `explainReplayReport` — operator-readable narration of replay outcomes.
 *
 * The `ReplayReport` (from `replay()`) and `ReplayIntegrityReport` (from
 * `replayWithIntegrity()`) are structurally sound for machine consumption
 * but unfriendly to operators triaging a real incident. This module
 * collapses both shapes into a single readable summary suitable for:
 *
 *   - on-call runbooks (one paragraph + bulleted root-cause list)
 *   - CI gates (one line: PASS/FAIL with counts)
 *   - audit-report appendices (multi-line breakdown by failure kind)
 *
 * Pure function. No I/O. Adopters compose the output into whatever
 * surface they need (console, Slack, PagerDuty, PDF).
 */

import type {
  ReplayBasisDelta,
  ReplayMismatch,
} from "@adjudicate/core";
import type { ReplayReport } from "./replay.js";
import type {
  IntegrityFailure,
  ReplayIntegrityReport,
} from "./replay-integrity.js";

export type ReplayExplainFormat = "summary" | "operator" | "ci-line";

export interface ExplainReplayOptions {
  readonly format?: ReplayExplainFormat;
  /**
   * Optional max number of mismatches/failures to render per axis. Default 5.
   * Operator summaries that include 500 mismatches are unreadable; the
   * caller can fetch the full structured report for the long tail.
   */
  readonly limit?: number;
}

function describeBasisDelta(delta: ReplayBasisDelta | undefined): string {
  if (delta === undefined) return "";
  const parts: string[] = [];
  if (delta.missing.length > 0) {
    parts.push(`missing [${delta.missing.join(", ")}]`);
  }
  if (delta.extra.length > 0) {
    parts.push(`extra [${delta.extra.join(", ")}]`);
  }
  return parts.length > 0 ? ` — ${parts.join("; ")}` : "";
}

function describeMismatch(m: ReplayMismatch): string {
  const head = `${m.intentHash.slice(0, 8)}… ${m.kind} (expected=${m.expected.kind} actual=${m.actual.kind})`;
  if (m.kind === "BASIS_DRIFT") return head + describeBasisDelta(m.basisDelta);
  if (m.kind === "REFUSAL_CODE_DRIFT" && m.expected.kind === "REFUSE" && m.actual.kind === "REFUSE") {
    return `${head} — expected refusal.code=${m.expected.refusal.code}, actual=${m.actual.refusal.code}`;
  }
  return head;
}

function describeIntegrityFailure(f: IntegrityFailure): string {
  const head = `${f.intentHash.slice(0, 8)}… ${f.kind}`;
  return `${head} (stored=${f.detail.stored.slice(0, 12)}…, derived=${f.detail.derived.slice(0, 12)}…)`;
}

/**
 * Render a one-line CI summary. Suitable for use in a GitHub Action's
 * status check or a shell pipeline gate.
 *
 *   ✓ replay PASS: 928/928 matched
 *   ✗ replay FAIL: 925/928 matched, 3 mismatches
 *   ✗ replay FAIL: 920/928 matched, 5 mismatches, 3 integrity failures
 */
function ciLine(
  report: ReplayReport | ReplayIntegrityReport,
): string {
  const integrityFailures =
    "integrityFailures" in report ? report.integrityFailures.length : 0;
  const pass =
    report.mismatches.length === 0 && integrityFailures === 0;
  const parts = [`${report.matched}/${report.total} matched`];
  if (report.mismatches.length > 0) {
    parts.push(`${report.mismatches.length} mismatches`);
  }
  if (integrityFailures > 0) {
    parts.push(`${integrityFailures} integrity failures`);
  }
  return `${pass ? "✓" : "✗"} replay ${pass ? "PASS" : "FAIL"}: ${parts.join(", ")}`;
}

/**
 * Render a one-paragraph operator summary. Suitable for runbook
 * "what does this report say?" expansion.
 */
function summary(report: ReplayReport | ReplayIntegrityReport): string {
  const integrityFailures =
    "integrityFailures" in report ? report.integrityFailures.length : 0;
  const preV4 = "preV4Records" in report ? report.preV4Records : 0;
  const pass =
    report.mismatches.length === 0 && integrityFailures === 0;

  if (pass) {
    if (preV4 > 0) {
      return `Replay clean: ${report.matched}/${report.total} records matched. ${preV4} records pre-date AuditRecord v4 (no auditHash to verify).`;
    }
    return `Replay clean: all ${report.matched}/${report.total} records matched and integrity intact.`;
  }
  const bits: string[] = [
    `${report.matched}/${report.total} records matched`,
  ];
  if (report.mismatches.length > 0) {
    const kinds = new Set(report.mismatches.map((m) => m.kind));
    bits.push(
      `${report.mismatches.length} replay mismatch${report.mismatches.length === 1 ? "" : "es"} (${[...kinds].join(", ")})`,
    );
  }
  if (integrityFailures > 0) {
    bits.push(
      `${integrityFailures} integrity failure${integrityFailures === 1 ? "" : "s"} (treat as security incident)`,
    );
  }
  return `Replay divergence detected: ${bits.join("; ")}.`;
}

/**
 * Render a multi-line operator format: headline + bulleted breakdown +
 * truncation note. Suitable for surfacing in the Operator Console or
 * an incident-channel paste.
 */
function operatorFormat(
  report: ReplayReport | ReplayIntegrityReport,
  limit: number,
): string {
  const lines: string[] = [summary(report)];

  if (report.mismatches.length > 0) {
    lines.push("");
    lines.push("Replay mismatches:");
    const shown = report.mismatches.slice(0, limit);
    for (const m of shown) lines.push(`  - ${describeMismatch(m)}`);
    if (report.mismatches.length > limit) {
      lines.push(
        `  … and ${report.mismatches.length - limit} more (truncated for readability)`,
      );
    }
  }

  if ("integrityFailures" in report && report.integrityFailures.length > 0) {
    lines.push("");
    lines.push("Integrity failures:");
    const shown = report.integrityFailures.slice(0, limit);
    for (const f of shown) lines.push(`  - ${describeIntegrityFailure(f)}`);
    if (report.integrityFailures.length > limit) {
      lines.push(
        `  … and ${report.integrityFailures.length - limit} more (truncated)`,
      );
    }
  }

  if ("preV4Records" in report && report.preV4Records > 0) {
    lines.push("");
    lines.push(
      `Note: ${report.preV4Records} records pre-date AuditRecord v4 (no auditHash to verify). Migration backfill recommended before strict trust gating.`,
    );
  }

  return lines.join("\n");
}

export function explainReplayReport(
  report: ReplayReport | ReplayIntegrityReport,
  options: ExplainReplayOptions = {},
): string {
  const format = options.format ?? "operator";
  const limit = options.limit ?? 5;
  switch (format) {
    case "ci-line":
      return ciLine(report);
    case "summary":
      return summary(report);
    case "operator":
      return operatorFormat(report, limit);
  }
}
