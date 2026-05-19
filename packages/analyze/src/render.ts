/**
 * Output renderers for AnalysisReport.
 *
 * Three formats:
 *   - `text` — developer-facing, colored if TTY; line-per-diagnostic.
 *   - `json` — programmatic; full structural representation.
 *   - `sarif` — SARIF 2.1.0 for GitHub Code Scanning / GitLab Code Quality.
 */

import type { AnalysisReport, Diagnostic } from "./types.js";

export function renderText(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push(`Pack: ${report.packId}${report.packVersion ? ` @ ${report.packVersion}` : ""}`);
  lines.push(`Analyzed at: ${report.analyzedAt}`);
  lines.push("");
  if (report.diagnostics.length === 0) {
    lines.push("✓ No diagnostics. Pack passes Tier 1 analysis.");
    return lines.join("\n");
  }
  for (const d of report.diagnostics) {
    const icon = d.severity === "error" ? "✗" : d.severity === "warning" ? "⚠" : "ℹ";
    const where = d.guardId ? ` [${d.phase}: ${d.guardId}]` : "";
    lines.push(`${icon} ${d.code} (${d.severity})${where}: ${d.message}`);
    if (d.description) {
      for (const wrap of wrapLines(d.description, 76)) {
        lines.push(`    ${wrap}`);
      }
    }
  }
  lines.push("");
  lines.push(
    `Summary: ${report.summary.error} error(s), ${report.summary.warning} warning(s), ${report.summary.note} note(s)`,
  );
  lines.push(report.passed ? "✓ Pack passes." : "✗ Pack has errors.");
  return lines.join("\n");
}

function wrapLines(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur.length === 0 ? w : `${cur} ${w}`;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export function renderJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * SARIF 2.1.0 output. Maps each Diagnostic to a `Result` with:
 *   - `ruleId`: the AJD code
 *   - `level`: SARIF severity (error/warning/note)
 *   - `message.text`: the diagnostic message
 *   - `properties`: full diagnostic detail for tooling
 *
 * GitHub Code Scanning ingests this directly; PR annotations show inline.
 */
export function renderSarif(report: AnalysisReport): string {
  const sarif = {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/cos02/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "@adjudicate/analyze",
            informationUri: "https://github.com/BrunoRodolpho/adjudicate",
            version: "0.2.0",
            rules: collectRules(report.diagnostics),
          },
        },
        results: report.diagnostics.map((d) => ({
          ruleId: d.code,
          level: sarifLevel(d.severity),
          message: {
            text: d.message,
            markdown: d.description ?? d.message,
          },
          properties: {
            phase: d.phase,
            guardId: d.guardId,
            ...(d.detail ?? {}),
          },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function sarifLevel(severity: Diagnostic["severity"]): string {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function collectRules(
  diagnostics: ReadonlyArray<Diagnostic>,
): ReadonlyArray<Record<string, unknown>> {
  const seen = new Map<string, Record<string, unknown>>();
  for (const d of diagnostics) {
    if (seen.has(d.code)) continue;
    seen.set(d.code, {
      id: d.code,
      shortDescription: { text: d.message },
      fullDescription: { text: d.description ?? d.message },
      defaultConfiguration: { level: sarifLevel(d.severity) },
    });
  }
  return [...seen.values()];
}
