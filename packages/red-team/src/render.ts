import type { RedTeamReport } from "./runner.js";

/** Human-readable text report. */
export function renderRedTeamText(report: RedTeamReport): string {
  const { summary } = report;
  const lines: string[] = [];
  lines.push(`Red-team · ${report.pack.id}`);
  lines.push(
    `  ${summary.total} scenarios · ${summary.defended} defended · ${summary.escaped} escaped · ${summary.errors} errors`,
  );
  lines.push("  escapes by vector:");
  for (const [vector, count] of Object.entries(summary.escapesByVector)) {
    lines.push(`    ${vector}: ${count}`);
  }
  const escapes = report.results.filter((r) => r.status === "escaped");
  if (escapes.length > 0) {
    lines.push("  ESCAPED:");
    for (const e of escapes) {
      lines.push(
        `    ✗ ${e.name} → ${e.decision} (expected one of ${e.acceptable.join("/")})`,
      );
    }
  }
  const errored = report.results.filter((r) => r.status === "error");
  for (const e of errored) {
    lines.push(`    ! ${e.name} → error: ${e.error}`);
  }
  return lines.join("\n");
}

/** Stable JSON report. */
export function renderRedTeamJson(report: RedTeamReport): string {
  return JSON.stringify(report, null, 2);
}
