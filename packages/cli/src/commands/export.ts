/**
 * `adjudicate export` — convert AuditRecord JSONL fixtures to JSON or
 * CSV.
 *
 * v0.5 scope: read from a local JSONL file (`--source`). Postgres-
 * backed reading is post-v0.6 (the admin-sdk replay procedure already
 * has direct DB access; a CLI wrapper waits until adopters request
 * it). Parquet is out of scope — the writer libraries are heavy and
 * not justified for v0.5.
 *
 * Filtering:
 *   --since <iso>     keep records with recordedAt >= since
 *   --until <iso>     keep records with recordedAt < until
 *
 * Output columns (CSV):
 *   intent_hash, kind, decision_kind, recorded_at, duration_ms
 *
 * Strings are CSV-quoted with double-quote escaping per RFC 4180.
 */

import { promises as fs } from "node:fs";
import chalk from "chalk";
import type { AuditRecord } from "@adjudicate/core";
import { errorMessage } from "../lib/error-message.js";

export type ExportFormat = "json" | "csv" | "parquet";

export interface ExportOptions {
  /** Source file (JSON array or JSONL). */
  readonly source: string;
  /** Format. Defaults to `json`. */
  readonly format?: ExportFormat;
  /** Output file. If omitted, writes to stdout. */
  readonly output?: string;
  /** ISO-8601 lower bound on `recordedAt` (inclusive). */
  readonly since?: string;
  /** ISO-8601 upper bound on `recordedAt` (exclusive). */
  readonly until?: string;
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
  /** Test injection. Defaults to `process.stderr.write`. */
  readonly stderr?: (line: string) => void;
}

export async function runExport(options: ExportOptions): Promise<void> {
  const format: ExportFormat = options.format ?? "json";
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err =
    options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  if (format === "parquet") {
    err(
      chalk.yellow("⚠") +
        " Parquet export requires a Parquet writer dep — defer to v0.6.\n" +
        "  Use --format json or --format csv for now.",
    );
    process.exit(1);
  }

  const records = await loadSource(options.source, err);
  const filtered = applyFilters(records, options.since, options.until);

  const rendered = format === "csv" ? renderCsv(filtered) : renderJson(filtered);

  if (options.output) {
    await fs.writeFile(options.output, rendered, "utf8");
    out(chalk.green("✓") + ` Wrote ${filtered.length} record(s) to ${options.output}`);
  } else {
    out(rendered);
  }
}

function applyFilters(
  records: ReadonlyArray<AuditRecord>,
  since: string | undefined,
  until: string | undefined,
): ReadonlyArray<AuditRecord> {
  if (!since && !until) return records;
  const sinceMs = since ? Date.parse(since) : -Infinity;
  const untilMs = until ? Date.parse(until) : Infinity;
  return records.filter((r) => {
    const t = Date.parse(r.at);
    return t >= sinceMs && t < untilMs;
  });
}

function renderJson(records: ReadonlyArray<AuditRecord>): string {
  return JSON.stringify(records, null, 2);
}

const CSV_COLUMNS = [
  "intent_hash",
  "kind",
  "decision_kind",
  "recorded_at",
  "duration_ms",
] as const;

function renderCsv(records: ReadonlyArray<AuditRecord>): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(","));
  for (const r of records) {
    lines.push(
      [
        quote(r.intentHash),
        quote(r.envelope.kind),
        quote(r.decision.kind),
        quote(r.at),
        String(r.durationMs),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function quote(s: string): string {
  // RFC 4180: wrap with double quotes, escape inner quotes by doubling.
  return `"${s.replace(/"/g, '""')}"`;
}

async function loadSource(
  filePath: string,
  err: (line: string) => void,
): Promise<ReadonlyArray<AuditRecord>> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (e) {
    err(chalk.red("✗") + ` Failed to read source: ${errorMessage(e)}`);
    process.exit(1);
  }

  const trimmed = text.trim();
  if (trimmed === "") return [];

  // Accept JSON array OR JSON Lines.
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        err(chalk.red("✗") + " Source array expected.");
        process.exit(1);
      }
      return parsed as ReadonlyArray<AuditRecord>;
    } catch (e) {
      err(chalk.red("✗") + ` JSON parse error: ${errorMessage(e)}`);
      process.exit(1);
    }
  }

  const records: AuditRecord[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    try {
      records.push(JSON.parse(line) as AuditRecord);
    } catch (e) {
      err(
        chalk.red("✗") + ` JSONL parse error at line ${i + 1}: ${errorMessage(e)}`,
      );
      process.exit(1);
    }
  }
  return records;
}
