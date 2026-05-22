/**
 * `adjudicate replay` — re-adjudicate stored AuditRecords against a
 * Pack and report divergence.
 *
 * Use case: a Pack author iterates on a policy, then needs to verify
 * that the change doesn't silently flip historical decisions. The
 * command reads a JSONL/JSON file of `AuditRecord`s (produced by
 * `adjudicate export --format json`), reconstructs each envelope, runs
 * `adjudicate()` against the *current* Pack policy, and uses the
 * shared `classify()` rule (`@adjudicate/core`) to detect drift.
 *
 * **Known limitation (v0.5):** the stored AuditRecord carries the
 * envelope but not the *state* at the time of adjudication. The CLI
 * replays each envelope against an empty / synthetic state (passed
 * through the Pack's optional `rehydrateState({})`). For full
 * state-aware replay, point operators to the admin-sdk `replay`
 * procedure which has direct Postgres access and richer state-
 * reconstruction primitives.
 */

import { promises as fs } from "node:fs";
import chalk from "chalk";
import { errorMessage } from "../lib/error-message.js";
import {
  adjudicate,
  classify,
  replayEnvelopeFromAudit,
  type AuditRecord,
  type Decision,
  type PolicyBundle,
  type ReplayMismatch,
} from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface ReplayOptions {
  readonly pack: string;
  /** Path to a JSON file containing an array of AuditRecord objects. */
  readonly records: string;
  /** Output format. Defaults to `text`. */
  readonly format?: "text" | "json";
  /** Test injection. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
}

interface LoadedPack {
  readonly id: string;
  readonly policy: PolicyBundle<string, unknown, unknown>;
  readonly rehydrateState?: (raw: unknown) => unknown;
}

export interface ReplayReport {
  readonly pack: string;
  readonly total: number;
  readonly matched: number;
  readonly mismatches: ReadonlyArray<ReplayMismatch>;
  readonly errored: ReadonlyArray<{ intentHash: string; error: string }>;
}

export async function runReplay(options: ReplayOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const format = options.format ?? "text";
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));

  const pack = await loadPack(options.pack, cwd, out);
  const records = await loadRecords(options.records, out);

  const report = runRecords(pack, records);

  out(
    format === "json"
      ? JSON.stringify(report, null, 2)
      : renderText(report),
  );

  if (report.mismatches.length > 0 || report.errored.length > 0) {
    process.exit(1);
  }
}

function runRecords(
  pack: LoadedPack,
  records: ReadonlyArray<AuditRecord>,
): ReplayReport {
  const mismatches: ReplayMismatch[] = [];
  const errored: Array<{ intentHash: string; error: string }> = [];
  let matched = 0;

  // v0.5 limitation: AuditRecord doesn't carry the state at the time
  // of adjudication. We synthesize an empty state, optionally piped
  // through the Pack's rehydrator so map-shaped Packs see the right
  // container type.
  const syntheticState = pack.rehydrateState ? pack.rehydrateState({}) : {};

  for (const record of records) {
    try {
      const envelope = replayEnvelopeFromAudit(record);
      const actual: Decision = adjudicate(envelope, syntheticState, pack.policy);
      const mismatch = classify(record.intentHash, record.decision, actual);
      if (mismatch === null) {
        matched++;
      } else {
        mismatches.push(mismatch);
      }
    } catch (e) {
      errored.push({
        intentHash: record.intentHash,
        error: errorMessage(e),
      });
    }
  }

  return {
    pack: pack.id,
    total: records.length,
    matched,
    mismatches,
    errored,
  };
}

function renderText(report: ReplayReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold("adjudicate replay"));
  lines.push("");
  lines.push(`  pack:       ${chalk.cyan(report.pack)}`);
  lines.push(`  records:    ${report.total}`);
  lines.push(`  matched:    ${chalk.green(String(report.matched))}`);
  lines.push(
    `  mismatches: ${report.mismatches.length > 0 ? chalk.red(String(report.mismatches.length)) : "0"}`,
  );
  lines.push(
    `  errored:    ${report.errored.length > 0 ? chalk.yellow(String(report.errored.length)) : "0"}`,
  );

  if (report.mismatches.length > 0) {
    lines.push("");
    lines.push(chalk.red.bold("Mismatches:"));
    for (const m of report.mismatches) {
      lines.push(
        `  ${chalk.dim(m.intentHash.slice(0, 12))}  ${chalk.bold(m.kind)}  expected=${m.expected.kind}  actual=${m.actual.kind}`,
      );
      if (m.basisDelta) {
        if (m.basisDelta.missing.length > 0) {
          lines.push(
            chalk.dim(`    missing basis: ${m.basisDelta.missing.join(", ")}`),
          );
        }
        if (m.basisDelta.extra.length > 0) {
          lines.push(
            chalk.dim(`    extra basis:   ${m.basisDelta.extra.join(", ")}`),
          );
        }
      }
    }
  }

  if (report.errored.length > 0) {
    lines.push("");
    lines.push(chalk.yellow.bold("Errors:"));
    for (const e of report.errored) {
      lines.push(`  ${chalk.dim(e.intentHash.slice(0, 12))}  ${e.error}`);
    }
  }

  lines.push("");
  lines.push(
    chalk.dim(
      "Note: state is replayed against a synthetic empty container. " +
        "For full state-aware replay use the admin-sdk replay procedure.",
    ),
  );
  return lines.join("\n");
}

async function loadPack(
  spec: string,
  cwd: string,
  out: (line: string) => void,
): Promise<LoadedPack> {
  let pack: unknown;
  try {
    pack = await loadPackFromModule(spec, cwd);
  } catch (e) {
    out(chalk.red("✗") + ` Failed to import pack: ${errorMessage(e)}`);
    process.exit(1);
  }
  if (!isLoadedPack(pack)) {
    out(chalk.red("✗") + ` No Pack export found in "${spec}".`);
    process.exit(1);
  }
  return pack;
}

async function loadRecords(
  filePath: string,
  out: (line: string) => void,
): Promise<ReadonlyArray<AuditRecord>> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (e) {
    out(chalk.red("✗") + ` Failed to read records file: ${errorMessage(e)}`);
    process.exit(1);
  }

  // Accept either JSON array or JSON Lines (one record per line).
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        out(chalk.red("✗") + ` Records file must contain an array.`);
        process.exit(1);
      }
      return parsed as ReadonlyArray<AuditRecord>;
    } catch (e) {
      out(chalk.red("✗") + ` Failed to parse records JSON: ${errorMessage(e)}`);
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
      out(
        chalk.red("✗") +
          ` Failed to parse line ${i + 1} of records file: ${errorMessage(e)}`,
      );
      process.exit(1);
    }
  }
  return records;
}

function isLoadedPack(v: unknown): v is LoadedPack {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    "policy" in v &&
    typeof (v as { id: unknown }).id === "string"
  );
}

