/**
 * `adjudicate visualize` — emit a standalone HTML document that
 * renders a Pack's PolicyBundle as a four-phase static graph.
 *
 * No JavaScript at runtime: the output is pure SVG inside a single
 * HTML file. Operators can `open policy.html` or paste into a wiki
 * — there is nothing to install.
 *
 * Layout: rows for the four guard categories in evaluation order
 *   state → taint → auth → business
 * Each guard is rendered as a labeled node carrying its kind
 * (threshold / state_defer / system_taint / rewrite / opaque /
 * anonymous) and a colored badge per Decision kind it can emit.
 *
 * The styling intentionally mirrors `apps/web` GuardMetadata visuals
 * — dark background, monospace font — so operators get a consistent
 * mental model whether they're reading the marketing site or the
 * static CLI export.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import {
  describePolicyBundle,
  type GuardDescriptor,
  type PolicyBundleDescriptor,
  type PolicyPhase,
  type PolicyBundle,
} from "@adjudicate/core/kernel";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface VisualizeOptions {
  /** Pack module spec (npm name or path). */
  readonly pack: string;
  /** Output HTML file path. Defaults to `policy.html` in cwd. */
  readonly output?: string;
  /** Test injection. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
}

interface LoadedPack {
  readonly id: string;
  readonly version?: string;
  readonly policy: PolicyBundle<string, unknown, unknown>;
}

export async function runVisualize(options: VisualizeOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const output = options.output ?? path.join(cwd, "policy.html");
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));

  let pack: unknown;
  try {
    pack = await loadPackFromModule(options.pack, cwd);
  } catch (e) {
    fail(`Failed to import pack "${options.pack}": ${asMessage(e)}`);
  }
  if (!isLoadedPack(pack)) {
    fail(
      `No Pack export found in "${options.pack}". Expected default or named export with intents+policy+contract.`,
    );
  }

  const descriptor = describePolicyBundle(pack.policy);
  const html = renderHtml(pack, descriptor);
  await fs.writeFile(output, html, "utf8");
  out(chalk.green("✓") + ` Wrote ${output}`);
}

// ─── HTML rendering ────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 64;
const COL_GAP = 32;
const ROW_GAP = 80;
const ROW_LABEL_W = 100;
const PADDING = 32;

const PHASE_ORDER: ReadonlyArray<PolicyPhase> = [
  "state",
  "taint",
  "auth",
  "business",
];

const PHASE_COLOR: Record<PolicyPhase, string> = {
  state: "#7dd3fc", // sky-300
  taint: "#fda4af", // rose-300
  auth: "#fcd34d", // amber-300
  business: "#a78bfa", // violet-400
};

const DECISION_COLOR: Record<string, string> = {
  EXECUTE: "#22c55e",
  REFUSE: "#ef4444",
  ESCALATE: "#f59e0b",
  REQUEST_CONFIRMATION: "#0ea5e9",
  DEFER: "#a855f7",
  REWRITE: "#14b8a6",
};

function renderHtml(
  pack: LoadedPack,
  desc: PolicyBundleDescriptor,
): string {
  const rows = PHASE_ORDER.map((phase) => {
    const phaseDesc = desc.phases.find((p) => p.phase === phase);
    return {
      phase,
      guards: phaseDesc?.guards ?? [],
    };
  });

  const maxCols = Math.max(1, ...rows.map((r) => r.guards.length));
  const svgWidth =
    ROW_LABEL_W + PADDING * 2 + maxCols * NODE_W + (maxCols - 1) * COL_GAP;
  const svgHeight = PADDING * 2 + rows.length * NODE_H + (rows.length - 1) * ROW_GAP;

  const nodes = rows
    .flatMap((row, rowIndex) =>
      row.guards.map((guard, colIndex) =>
        renderNode(guard, row.phase, rowIndex, colIndex),
      ),
    )
    .join("\n");

  const rowLabels = rows
    .map((row, rowIndex) => renderRowLabel(row.phase, rowIndex))
    .join("\n");

  const arrows = renderArrows(rows.length);

  const legend = renderLegend(svgWidth, svgHeight);

  const versionSuffix = pack.version ? ` ${escapeXml(pack.version)}` : "";
  const title = `${escapeXml(pack.id)}${versionSuffix} — policy graph`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f17;
      --fg: #e2e8f0;
      --muted: #64748b;
      --node-bg: #1e293b;
      --node-border: #334155;
      --default-${desc.default.toLowerCase()}: 1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 24px;
    }
    header { margin-bottom: 16px; }
    h1 { font-size: 16px; margin: 0 0 4px 0; }
    .meta { color: var(--muted); font-size: 12px; }
    .canvas {
      background: #050810;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px;
      overflow: auto;
    }
    text { fill: var(--fg); font-family: inherit; }
    .node-label { font-size: 12px; font-weight: 600; }
    .node-kind { font-size: 10px; fill: var(--muted); }
    .phase-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .badge-text { font-size: 9px; fill: #0b0f17; font-weight: 700; }
    .legend-text { font-size: 11px; fill: var(--fg); }
    .legend-muted { font-size: 11px; fill: var(--muted); }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <div class="meta">
      kernel order: state → taint → auth → business&nbsp;·&nbsp;
      default: <strong>${desc.default}</strong>
    </div>
  </header>
  <div class="canvas">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
      ${arrows}
      ${rowLabels}
      ${nodes}
      ${legend}
    </svg>
  </div>
</body>
</html>
`;
}

function renderRowLabel(phase: PolicyPhase, rowIndex: number): string {
  const y = PADDING + rowIndex * (NODE_H + ROW_GAP) + NODE_H / 2 + 4;
  const color = PHASE_COLOR[phase];
  return `<text class="phase-label" x="${PADDING}" y="${y}" fill="${color}">${phase}</text>`;
}

function renderNode(
  guard: GuardDescriptor,
  phase: PolicyPhase,
  rowIndex: number,
  colIndex: number,
): string {
  const x = PADDING + ROW_LABEL_W + colIndex * (NODE_W + COL_GAP);
  const y = PADDING + rowIndex * (NODE_H + ROW_GAP);
  const name = guardDisplayName(guard);
  const kind = guardKind(guard);
  const emits = guardEmits(guard);
  const badges = emits
    .map((kind, i) => renderBadge(x + 8 + i * 56, y + NODE_H - 18, kind))
    .join("");
  const stripe = PHASE_COLOR[phase];

  return `<g class="node">
  <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6" fill="var(--node-bg)" stroke="var(--node-border)" stroke-width="1" />
  <rect x="${x}" y="${y}" width="4" height="${NODE_H}" rx="2" fill="${stripe}" />
  <text class="node-label" x="${x + 12}" y="${y + 20}">${escapeXml(truncate(name, 26))}</text>
  <text class="node-kind" x="${x + 12}" y="${y + 36}">kind: ${kind}</text>
  ${badges}
</g>`;
}

function renderBadge(x: number, y: number, kind: string): string {
  const color = DECISION_COLOR[kind] ?? "#94a3b8";
  const label = kind.length > 6 ? kind.slice(0, 6) : kind;
  return `<g><rect x="${x}" y="${y}" width="52" height="14" rx="3" fill="${color}" /><text class="badge-text" x="${x + 26}" y="${y + 10}" text-anchor="middle">${escapeXml(label)}</text></g>`;
}

function renderArrows(rowCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < rowCount - 1; i++) {
    const x = PADDING + ROW_LABEL_W + NODE_W / 2;
    const y1 = PADDING + i * (NODE_H + ROW_GAP) + NODE_H;
    const y2 = PADDING + (i + 1) * (NODE_H + ROW_GAP);
    lines.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 6}" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 4" />`,
      `<polygon points="${x - 4},${y2 - 6} ${x + 4},${y2 - 6} ${x},${y2}" fill="#1e293b" />`,
    );
  }
  return lines.join("\n      ");
}

function renderLegend(svgWidth: number, svgHeight: number): string {
  const x = svgWidth - 200;
  const yBase = svgHeight - 64;
  const items = Object.entries(DECISION_COLOR);
  const swatches = items
    .map(([kind, color], i) => {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const cx = x + col * 100;
      const cy = yBase + row * 14;
      return `<rect x="${cx}" y="${cy}" width="10" height="10" rx="2" fill="${color}" /><text class="legend-text" x="${cx + 14}" y="${cy + 9}">${escapeXml(kind)}</text>`;
    })
    .join("");
  return `<g>${swatches}</g>`;
}

// ─── Guard inspection ──────────────────────────────────────────────────────

function guardDisplayName(guard: GuardDescriptor): string {
  if (guard.kind === "anonymous") return "(anonymous)";
  return guard.metadata.name ?? "(unnamed)";
}

function guardKind(guard: GuardDescriptor): string {
  if (guard.kind === "anonymous") return "anonymous";
  const desc = guard.metadata.description;
  return desc?.kind ?? "opaque";
}

function guardEmits(guard: GuardDescriptor): ReadonlyArray<string> {
  if (guard.kind === "anonymous") return [];
  const desc = guard.metadata.description;
  if (!desc) return [];
  if (desc.kind === "threshold" && desc.emits) return [desc.emits];
  if (desc.kind === "state_defer") return ["DEFER"];
  if (desc.kind === "system_taint") return ["REFUSE"];
  if (desc.kind === "rewrite") return ["REWRITE"];
  return [];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fail(message: string): never {
  console.error(chalk.red("✗"), message);
  process.exit(1);
}
