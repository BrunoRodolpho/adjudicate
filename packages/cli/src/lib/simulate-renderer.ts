/**
 * Output renderers for `adjudicate simulate`.
 *
 * Two formats:
 *
 *   - `json` — machine-readable. The full `{ decision, trace, envelope,
 *     expected? }` payload. Stable shape; safe to pipe into other tools
 *     and (Phase 6.4) into the diff harness.
 *
 *   - `text` — human-readable. Rounded-box ANSI layout with four
 *     sections: header (decision kind), Intent metadata, Trace
 *     (per-guard evaluation), Basis (accumulated + match), and
 *     decision-specific Detail (refusal / prompt / signal / rewrite).
 *
 * Both renderers receive the same `SimulationOutput` payload — swapping
 * renderers (or adding new formats) doesn't ripple through `simulate.ts`.
 *
 * # Visual width
 *
 * The text renderer takes a fixed total width (defaults to the
 * terminal width, clamped to [70, 120]). It computes string lengths
 * with ANSI escape codes stripped, so chalk-styled text aligns
 * correctly. Long values are word-wrapped to the inner column.
 *
 * # Color
 *
 * `chalk` auto-disables under `NO_COLOR=1` or non-TTY stdout. The box
 * drawing characters remain regardless — every modern terminal renders
 * Unicode rounded-box correctly.
 */

import chalk from "chalk";
import type {
  AdjudicationTraceEntry,
  Decision,
  DecisionBasis,
  IntentEnvelope,
} from "@adjudicate/core";

export interface SimulationOutput {
  readonly pack: { readonly id: string };
  readonly envelope: IntentEnvelope;
  readonly decision: Decision;
  readonly trace: ReadonlyArray<AdjudicationTraceEntry>;
  readonly expected?: { readonly kind: Decision["kind"] };
}

export type SimulationFormat = "text" | "json";

export interface RenderOptions {
  /** Total output width (border-to-border). Defaults to terminal width clamped to [70, 120]. */
  readonly width?: number;
}

export function render(
  output: SimulationOutput,
  format: SimulationFormat,
  options: RenderOptions = {},
): string {
  return format === "json"
    ? renderJson(output)
    : renderText(output, options);
}

function renderJson(output: SimulationOutput): string {
  return JSON.stringify(output, null, 2);
}

// ─── Width handling ────────────────────────────────────────────────────────

const DEFAULT_WIDTH_FALLBACK = 80;
const MIN_WIDTH = 70;
const MAX_WIDTH = 120;

function resolveWidth(explicit?: number): number {
  let candidate = explicit;
  if (candidate === undefined) {
    const cols =
      typeof process !== "undefined" ? process.stdout?.columns : undefined;
    candidate =
      typeof cols === "number" && cols > 0 ? cols : DEFAULT_WIDTH_FALLBACK;
  }
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, candidate));
}

// ANSI escape stripper for visual-width math. Chalk styles use the
// `[...m` SGR family; this regex covers it.
const ANSI_ESCAPE = /\[[0-9;]*m/g;

function visualWidth(s: string): number {
  return s.replace(ANSI_ESCAPE, "").length;
}

function padRight(s: string, width: number): string {
  const pad = Math.max(0, width - visualWidth(s));
  return s + " ".repeat(pad);
}

function truncate(s: string, maxWidth: number): string {
  if (visualWidth(s) <= maxWidth) return s;
  return s.slice(0, Math.max(0, maxWidth - 1)) + "…";
}

function wrap(s: string, width: number): string[] {
  if (visualWidth(s) <= width) return [s];
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (current.length === 0) {
      current = w;
      continue;
    }
    if (visualWidth(current) + 1 + visualWidth(w) <= width) {
      current = `${current} ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.map((line) => truncate(line, width));
}

// ─── Box drawing ───────────────────────────────────────────────────────────

const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  separatorLeft: "├",
  separatorRight: "┤",
} as const;

function boxTopWithTitle(title: string, width: number): string {
  // ╭─ TITLE ────────────╮
  const titleVisible = ` ${title} `;
  const titleWidth = visualWidth(titleVisible);
  const leftDash = 1; // one ─ between corner and title
  const rightFill = width - 2 - leftDash - titleWidth; // 2 for corners
  return (
    BOX.topLeft +
    BOX.horizontal.repeat(leftDash) +
    titleVisible +
    BOX.horizontal.repeat(Math.max(0, rightFill)) +
    BOX.topRight
  );
}

function boxBottom(width: number): string {
  return (
    BOX.bottomLeft +
    BOX.horizontal.repeat(width - 2) +
    BOX.bottomRight
  );
}

function boxSeparator(width: number): string {
  return (
    BOX.separatorLeft +
    BOX.horizontal.repeat(width - 2) +
    BOX.separatorRight
  );
}

function boxRow(content: string, width: number): string {
  // │ content padded │ — total content area = width - 4
  const inner = width - 4;
  const padded = padRight(truncate(content, inner), inner);
  return `${BOX.vertical} ${padded} ${BOX.vertical}`;
}

function boxBlank(width: number): string {
  return boxRow("", width);
}

// ─── Text renderer ─────────────────────────────────────────────────────────

function renderText(output: SimulationOutput, options: RenderOptions): string {
  const width = resolveWidth(options.width);
  const inner = width - 4;
  const lines: string[] = [];

  // Header
  const decisionLabel = `${chalk.bold("DECISION:")} ${decisionStyle(output.decision.kind)}`;
  lines.push(boxTopWithTitle(decisionLabel, width));
  lines.push(boxBlank(width));

  // Intent section
  for (const row of intentRows(output, inner)) {
    lines.push(boxRow(row, width));
  }
  if (output.expected) {
    lines.push(boxBlank(width));
    for (const row of expectedRows(output, inner)) {
      lines.push(boxRow(row, width));
    }
  }
  lines.push(boxBlank(width));

  // Trace section
  lines.push(boxSeparator(width));
  lines.push(boxRow(chalk.bold("Trace"), width));
  lines.push(boxBlank(width));
  for (const row of traceRows(output.trace, inner)) {
    lines.push(boxRow(row, width));
  }
  lines.push(boxBlank(width));

  // Basis section
  lines.push(boxSeparator(width));
  lines.push(boxRow(chalk.bold("Basis"), width));
  lines.push(boxBlank(width));
  for (const row of basisRows(output.decision.basis, inner)) {
    lines.push(boxRow(row, width));
  }
  lines.push(boxBlank(width));

  // Decision-specific detail
  const detail = detailRows(output.decision, inner);
  if (detail.length > 0) {
    lines.push(boxSeparator(width));
    lines.push(boxRow(chalk.bold(detailHeading(output.decision.kind)), width));
    lines.push(boxBlank(width));
    for (const row of detail) {
      lines.push(boxRow(row, width));
    }
    lines.push(boxBlank(width));
  }

  // Footer
  lines.push(boxBottom(width));
  return lines.join("\n");
}

// ─── Section content ───────────────────────────────────────────────────────

function intentRows(output: SimulationOutput, inner: number): string[] {
  const { pack, envelope } = output;
  const labelCol = 11;
  const valueCol = inner - labelCol;
  const rows: string[] = [];
  rows.push(label("Pack", labelCol) + truncate(pack.id, valueCol));
  rows.push(label("Kind", labelCol) + truncate(envelope.kind, valueCol));
  rows.push(
    label("Actor", labelCol) +
      truncate(`${envelope.actor.principal}/${envelope.actor.sessionId}`, valueCol),
  );
  rows.push(label("Taint", labelCol) + taintStyle(envelope.taint));
  rows.push(label("Nonce", labelCol) + truncate(envelope.nonce, valueCol));
  rows.push(
    label("Hash", labelCol) +
      chalk.dim(truncate(envelope.intentHash, valueCol)),
  );
  return rows;
}

function expectedRows(output: SimulationOutput, inner: number): string[] {
  const expected = output.expected;
  if (!expected) return [];
  const matched = expected.kind === output.decision.kind;
  const label = "Expected";
  const labelCol = 11;
  const valueCol = inner - labelCol;
  const verdict = matched
    ? chalk.green(`${expected.kind} — match`)
    : chalk.yellow(
        `${expected.kind} — MISMATCH (got ${output.decision.kind})`,
      );
  return [padRight(chalk.dim(label), labelCol) + truncate(verdict, valueCol)];
}

function traceRows(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
  inner: number,
): string[] {
  const phaseCol = 13;
  const nameCol = Math.max(20, inner - phaseCol - 8); // 8 for outcome
  const rows: string[] = [];
  for (const entry of trace) {
    const phaseLabel =
      entry.index !== undefined
        ? `${entry.phase}[${entry.index}]`
        : entry.phase;
    const name = entry.guardName ?? "";
    const outcomeText =
      entry.outcome === "match"
        ? chalk.cyan.bold("MATCH")
        : chalk.dim("pass");
    rows.push(
      `  ${padRight(chalk.dim(phaseLabel), phaseCol)}${padRight(truncate(name, nameCol), nameCol)}${outcomeText}`,
    );
  }
  return rows;
}

function basisRows(
  basis: ReadonlyArray<DecisionBasis>,
  inner: number,
): string[] {
  const indent = 2;
  const categoryCol = 11;
  const valueCol = inner - indent - categoryCol - 2;
  const rows: string[] = [];
  for (const b of basis) {
    rows.push(
      `  ${padRight(chalk.dim(b.category), categoryCol)}/ ${truncate(b.code, valueCol)}`,
    );
    if (b.detail !== undefined) {
      for (const detailLine of formatDetail(b.detail, inner - 2 - categoryCol - 2)) {
        rows.push(`  ${" ".repeat(categoryCol + 2)}${detailLine}`);
      }
    }
  }
  return rows;
}

function formatDetail(detail: unknown, width: number): string[] {
  if (detail === null || detail === undefined) return [];
  if (typeof detail !== "object") {
    return wrap(chalk.dim(String(detail)), width);
  }
  const entries = Object.entries(detail as Record<string, unknown>);
  const keyWidth = Math.min(
    14,
    entries.reduce((m, [k]) => Math.max(m, k.length), 0),
  );
  const out: string[] = [];
  for (const [k, v] of entries) {
    const valueStr =
      typeof v === "string" ? v : JSON.stringify(v);
    const valueWidth = width - keyWidth - 2;
    const valueWrapped = wrap(chalk.dim(valueStr), valueWidth);
    out.push(`${padRight(chalk.dim(`${k}:`), keyWidth + 2)}${valueWrapped[0]!}`);
    for (const continuation of valueWrapped.slice(1)) {
      out.push(`${" ".repeat(keyWidth + 2)}${continuation}`);
    }
  }
  return out;
}

function detailHeading(kind: Decision["kind"]): string {
  switch (kind) {
    case "REFUSE":
      return "Refusal";
    case "ESCALATE":
      return "Escalation";
    case "REQUEST_CONFIRMATION":
      return "Prompt";
    case "DEFER":
      return "Defer";
    case "REWRITE":
      return "Rewrite";
    case "EXECUTE":
      return "Detail";
  }
}

function detailRows(decision: Decision, inner: number): string[] {
  const labelCol = 11;
  const valueCol = inner - labelCol - 2;
  switch (decision.kind) {
    case "REFUSE": {
      const rows = [
        `  ${padRight(chalk.dim("kind"), labelCol)}${truncate(decision.refusal.kind, valueCol)}`,
        `  ${padRight(chalk.dim("code"), labelCol)}${truncate(decision.refusal.code, valueCol)}`,
      ];
      for (const line of wrap(decision.refusal.userFacing, valueCol)) {
        rows.push(`  ${padRight(chalk.dim("user-facing"), labelCol)}${line}`);
      }
      if (decision.refusal.detail !== undefined) {
        for (const line of wrap(chalk.dim(decision.refusal.detail), valueCol)) {
          rows.push(`  ${padRight(chalk.dim("detail"), labelCol)}${line}`);
        }
      }
      return rows;
    }
    case "ESCALATE":
      return [
        `  ${padRight(chalk.dim("to"), labelCol)}${truncate(decision.to, valueCol)}`,
        ...wrap(decision.reason, valueCol).map(
          (line, i) =>
            `  ${padRight(i === 0 ? chalk.dim("reason") : "", labelCol)}${line}`,
        ),
      ];
    case "REQUEST_CONFIRMATION":
      return wrap(decision.prompt, valueCol + labelCol).map(
        (line) => `  ${line}`,
      );
    case "DEFER":
      return [
        `  ${padRight(chalk.dim("signal"), labelCol)}${truncate(decision.signal, valueCol)}`,
        `  ${padRight(chalk.dim("timeoutMs"), labelCol)}${String(decision.timeoutMs)}`,
      ];
    case "REWRITE":
      return [
        ...wrap(decision.reason, valueCol + labelCol).map(
          (line, i) =>
            `  ${padRight(i === 0 ? chalk.dim("reason") : "", labelCol)}${line}`,
        ),
        `  ${padRight(chalk.dim("new kind"), labelCol)}${truncate(decision.rewritten.kind, valueCol)}`,
        `  ${padRight(chalk.dim("new hash"), labelCol)}${chalk.dim(truncate(decision.rewritten.intentHash, valueCol))}`,
      ];
    case "EXECUTE":
      return [];
  }
}

// ─── Style helpers ─────────────────────────────────────────────────────────

function label(text: string, width: number): string {
  return padRight(chalk.dim(text), width);
}

function decisionStyle(kind: Decision["kind"]): string {
  switch (kind) {
    case "EXECUTE":
      return chalk.green.bold(kind);
    case "REFUSE":
      return chalk.red.bold(kind);
    case "ESCALATE":
      return chalk.yellow.bold(kind);
    case "REQUEST_CONFIRMATION":
      return chalk.cyan.bold(kind);
    case "DEFER":
      return chalk.blue.bold(kind);
    case "REWRITE":
      return chalk.magenta.bold(kind);
  }
}

function taintStyle(taint: string): string {
  switch (taint) {
    case "SYSTEM":
      return chalk.green(taint);
    case "TRUSTED":
      return chalk.yellow(taint);
    case "UNTRUSTED":
      return chalk.red(taint);
    default:
      return taint;
  }
}
