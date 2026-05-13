/**
 * Diff mode for `adjudicate simulate`.
 *
 * Walks a directory of scenario JSON files, runs each against the
 * supplied Pack, compares the resulting Decision.kind against the
 * scenario's `expected.kind`, and renders a summary.
 *
 * Per-scenario outcomes:
 *   - "match"        decision.kind === expected.kind
 *   - "mismatch"     decision.kind !== expected.kind
 *   - "advisory"     scenario has no `expected` (informational)
 *   - "error"        scenario failed to load (malformed JSON, schema
 *                    validation error, etc.)
 *
 * Exit code policy (returned via `computeExitCode`):
 *   - 0  no mismatches, no errors
 *   - 2  one or more mismatches (mirrors the single-scenario mode's
 *        non-zero exit on `expected` mismatch)
 *   - 1  one or more load/parse errors (no mismatches)
 *
 * Mismatch always wins over error in the exit code — if you have both,
 * the policy regression is the more actionable signal.
 *
 * File discovery: top-level `.json` files only (no recursion). Sorted
 * alphabetically for stable output. Hidden files (`.foo.json`) and
 * non-JSON entries are skipped silently.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import {
  adjudicateWithTrace,
  buildEnvelope,
  type Decision,
  type PolicyBundle,
} from "@adjudicate/core";
import {
  loadScenario,
  ScenarioParseError,
  type Scenario,
} from "./scenario.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ScenarioStatus = "match" | "mismatch" | "advisory" | "error";

export interface ScenarioResult {
  readonly scenario: string;
  readonly status: ScenarioStatus;
  readonly decision?: Decision["kind"];
  readonly expected?: Decision["kind"];
  readonly error?: string;
}

export interface DiffSummary {
  readonly total: number;
  readonly matched: number;
  readonly changed: number;
  readonly advisory: number;
  readonly errors: number;
}

export interface DiffReport {
  readonly results: ReadonlyArray<ScenarioResult>;
  readonly summary: DiffSummary;
}

// ─── Discovery ─────────────────────────────────────────────────────────────

/**
 * List scenario file paths under `dir` — top-level `*.json` files only,
 * hidden files excluded, sorted alphabetically by basename.
 */
export async function listScenarios(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith(".json") &&
        !e.name.startsWith("."),
    )
    .map((e) => e.name)
    .sort();
  return files.map((f) => path.join(dir, f));
}

// ─── Orchestration ─────────────────────────────────────────────────────────

interface LoadedPack {
  readonly id: string;
  readonly policy: unknown;
  readonly rehydrateState?: (raw: unknown) => unknown;
}

export async function runDiff(
  pack: LoadedPack,
  scenarioPaths: ReadonlyArray<string>,
): Promise<DiffReport> {
  const results: ScenarioResult[] = [];

  for (const scenarioPath of scenarioPaths) {
    const scenarioName = scenarioNameFromPath(scenarioPath);
    let scenario: Scenario;
    try {
      scenario = await loadScenario(scenarioPath);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      results.push({
        scenario: scenarioName,
        status: "error",
        error: e instanceof ScenarioParseError
          ? `Scenario validation failed: ${e.issues.length} issue${e.issues.length === 1 ? "" : "s"}`
          : e.message,
      });
      continue;
    }

    let decisionKind: Decision["kind"];
    try {
      const envelope = buildEnvelope({
        kind: scenario.intent.kind,
        payload: scenario.intent.payload,
        actor: scenario.intent.actor,
        taint: scenario.intent.taint,
        nonce: scenario.intent.nonce,
        ...(scenario.intent.createdAt !== undefined
          ? { createdAt: scenario.intent.createdAt }
          : {}),
      });
      const state = pack.rehydrateState
        ? pack.rehydrateState(scenario.state)
        : scenario.state;
      const { decision } = adjudicateWithTrace(
        envelope,
        state,
        pack.policy as PolicyBundle<string, unknown, unknown>,
      );
      decisionKind = decision.kind;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      results.push({
        scenario: scenarioName,
        status: "error",
        error: `Adjudication threw: ${e.message}`,
      });
      continue;
    }

    if (scenario.expected === undefined) {
      results.push({
        scenario: scenarioName,
        status: "advisory",
        decision: decisionKind,
      });
      continue;
    }

    if (scenario.expected.kind === decisionKind) {
      results.push({
        scenario: scenarioName,
        status: "match",
        decision: decisionKind,
        expected: scenario.expected.kind,
      });
    } else {
      results.push({
        scenario: scenarioName,
        status: "mismatch",
        decision: decisionKind,
        expected: scenario.expected.kind,
      });
    }
  }

  return {
    results,
    summary: summarize(results),
  };
}

function scenarioNameFromPath(p: string): string {
  return path.basename(p, ".json");
}

function summarize(results: ReadonlyArray<ScenarioResult>): DiffSummary {
  let matched = 0;
  let changed = 0;
  let advisory = 0;
  let errors = 0;
  for (const r of results) {
    switch (r.status) {
      case "match":
        matched++;
        break;
      case "mismatch":
        changed++;
        break;
      case "advisory":
        advisory++;
        break;
      case "error":
        errors++;
        break;
    }
  }
  return { total: results.length, matched, changed, advisory, errors };
}

export function computeExitCode(summary: DiffSummary): 0 | 1 | 2 {
  if (summary.changed > 0) return 2;
  if (summary.errors > 0) return 1;
  return 0;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

export function renderDiffJson(
  report: DiffReport,
  pack: { readonly id: string },
): string {
  return JSON.stringify(
    { pack: { id: pack.id }, summary: report.summary, results: report.results },
    null,
    2,
  );
}

export function renderDiffText(
  report: DiffReport,
  pack: { readonly id: string },
): string {
  const lines: string[] = [];
  const nameCol = Math.max(
    20,
    Math.min(
      40,
      report.results.reduce((m, r) => Math.max(m, r.scenario.length), 0),
    ),
  );
  const kindCol = 22;

  lines.push(chalk.dim(`pack: ${pack.id}`));
  lines.push("");

  for (const r of report.results) {
    const marker = statusMarker(r.status);
    const name = padRight(r.scenario, nameCol);
    const kind = r.decision ? decisionStyle(r.decision) : chalk.red("ERROR");
    const kindPadded = padRight(kind, kindCol);
    const trailing = formatTrailing(r);
    lines.push(`${marker} ${name}  ${kindPadded}${trailing}`);
  }

  if (report.results.length === 0) {
    lines.push(chalk.dim("(no scenarios found)"));
  }

  lines.push("");
  const parts: string[] = [];
  if (report.summary.matched > 0)
    parts.push(chalk.green(`${report.summary.matched} matched`));
  if (report.summary.changed > 0)
    parts.push(chalk.red(`${report.summary.changed} changed`));
  if (report.summary.advisory > 0)
    parts.push(chalk.dim(`${report.summary.advisory} advisory`));
  if (report.summary.errors > 0)
    parts.push(chalk.yellow(`${report.summary.errors} error${report.summary.errors === 1 ? "" : "s"}`));
  if (parts.length === 0) parts.push(chalk.dim("0 scenarios"));
  lines.push(parts.join(chalk.dim(" · ")));

  return lines.join("\n");
}

function statusMarker(status: ScenarioStatus): string {
  switch (status) {
    case "match":
      return chalk.green("✓");
    case "mismatch":
      return chalk.red("✗");
    case "advisory":
      return chalk.dim("○");
    case "error":
      return chalk.yellow("!");
  }
}

function formatTrailing(r: ScenarioResult): string {
  switch (r.status) {
    case "match":
      return r.expected ? chalk.dim(`(expected ${r.expected})`) : "";
    case "mismatch":
      return chalk.dim(`(expected `) + chalk.red(r.expected ?? "") + chalk.dim(`)`);
    case "advisory":
      return chalk.dim("(no expected)");
    case "error":
      return r.error ? chalk.dim(`${r.error}`) : "";
  }
}

function decisionStyle(kind: Decision["kind"]): string {
  switch (kind) {
    case "EXECUTE":
      return chalk.green(kind);
    case "REFUSE":
      return chalk.red(kind);
    case "ESCALATE":
      return chalk.yellow(kind);
    case "REQUEST_CONFIRMATION":
      return chalk.cyan(kind);
    case "DEFER":
      return chalk.blue(kind);
    case "REWRITE":
      return chalk.magenta(kind);
  }
}

// ANSI-aware right-padding (same helper as simulate-renderer; duplicated
// here to avoid a cross-file dependency on what's otherwise an internal
// helper. Keeping ~6 LOC duplicated beats exporting an internal helper.)
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\[[0-9;]*m/g;

function padRight(s: string, width: number): string {
  const visible = s.replace(ANSI_ESCAPE, "").length;
  return s + " ".repeat(Math.max(0, width - visible));
}
