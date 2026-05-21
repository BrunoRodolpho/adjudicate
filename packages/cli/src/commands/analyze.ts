/**
 * `adjudicate analyze` — runs the @adjudicate/analyze Tier 1 pipeline
 * against a Pack and emits an AnalysisReport.
 *
 * Per ADR-109, this is the v0.3.0 CLI entry point. Tier 2 + Tier 3
 * land in later versions; the CLI flags are forward-compatible.
 */

import {
  analyzePolicy,
  renderJson,
  renderSarif,
  renderText,
} from "@adjudicate/analyze";
import type { PackV0 } from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

export type AnalyzeFormat = "text" | "json" | "sarif";

export interface AnalyzeOptions {
  readonly pack: string;
  readonly format?: AnalyzeFormat;
  readonly strict?: boolean;
  /** Test injection. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Test injection. Defaults to process.stdout.write. */
  readonly stdout?: (line: string) => void;
}

export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const out = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const format: AnalyzeFormat = options.format ?? "text";

  const pack = (await loadPackFromModule(options.pack, cwd)) as PackV0<
    string,
    unknown,
    unknown,
    unknown
  >;
  const report = analyzePolicy({ pack, strict: options.strict });

  let rendered: string;
  switch (format) {
    case "text":
      rendered = renderText(report);
      break;
    case "json":
      rendered = renderJson(report);
      break;
    case "sarif":
      rendered = renderSarif(report);
      break;
    default:
      throw new Error(`Unknown format "${format as string}". Use text, json, or sarif.`);
  }
  out(rendered);

  // Exit non-zero if analysis failed.
  if (!report.passed) {
    process.exitCode = 1;
  }
}
