/**
 * `adjudicate analyze-composition` — multi-pack composition conflict analysis
 * (ADR-140). OFFLINE / CI only. Loads the declared set of Packs and reports
 * cross-pack conflicts (REWRITE overlap, DEFER signal collision, taint
 * contradiction, capability overlap). Exits non-zero when the merge gate fails.
 */
import { analyzeComposition, type CompositionReport } from "@adjudicate/analyze";
import type { PackV0 } from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface AnalyzeCompositionOptions {
  readonly packs: ReadonlyArray<string>;
  readonly format?: "text" | "json";
  /** Test injection. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Test injection. Defaults to process.stdout.write. */
  readonly stdout?: (line: string) => void;
}

export function renderCompositionText(report: CompositionReport): string {
  const lines: string[] = [
    `Composition of ${report.packIds.length} pack(s): ${report.packIds.join(", ")}`,
  ];
  if (report.conflicts.length === 0) {
    lines.push("✓ no cross-pack conflicts");
  } else {
    for (const c of report.conflicts) {
      lines.push(`${c.severity === "error" ? "✗" : "•"} [${c.code}] ${c.message}`);
    }
  }
  lines.push(
    `summary: ${report.summary.error} error, ${report.summary.warning} warning, ` +
      `${report.summary.note} note — ${report.passed ? "PASS" : "FAIL"}`,
  );
  return lines.join("\n");
}

export async function runAnalyzeComposition(options: AnalyzeCompositionOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const out = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  if (options.packs.length < 2) {
    throw new Error("analyze-composition needs at least two --pack modules to compare.");
  }
  const packs = (await Promise.all(
    options.packs.map((p) => loadPackFromModule(p, cwd)),
  )) as PackV0<string, unknown, unknown, unknown>[];
  const report = analyzeComposition(packs);
  out(options.format === "json" ? JSON.stringify(report, null, 2) : renderCompositionText(report));
  if (!report.passed) process.exitCode = 1;
}
