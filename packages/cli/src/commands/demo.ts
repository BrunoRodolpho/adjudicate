/**
 * `adjudicate demo` — zero-config tour of the six Decision kinds.
 *
 * A THIN preset over the existing `simulate --scenarios` machinery. It
 * bundles its own Pack (`./demo-pack.js`) and six scenario fixtures
 * (`templates/demo/scenarios/*.json`, resolved relative to the bin) and
 * runs each one through the SAME adjudication + renderer the `simulate`
 * command uses — so every outcome (EXECUTE / REFUSE / ESCALATE /
 * REQUEST_CONFIRMATION / DEFER / REWRITE) prints in colour. No API key,
 * no network, no Docker.
 *
 * This adds NO new render logic: per-scenario output goes through
 * `render()` from `simulate-renderer` (the rounded-box layout whose
 * `decisionStyle` colours all six kinds) and the closing roll-up goes
 * through `renderDiffText` / `renderDiffJson` from `simulate-diff` (the
 * same summary `simulate --scenarios` prints).
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import {
  adjudicateWithTrace,
  buildEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { loadScenario, ScenarioParseError } from "../lib/scenario.js";
import {
  render,
  type SimulationFormat,
  type SimulationOutput,
} from "../lib/simulate-renderer.js";
import {
  listScenarios,
  renderDiffJson,
  renderDiffText,
  runDiff,
} from "../lib/simulate-diff.js";
import { vacationPack } from "./demo-pack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DemoOptions {
  readonly format?: SimulationFormat;
  /** Test injection point. Defaults to process.stdout writes. */
  readonly stdout?: (line: string) => void;
  /**
   * Test injection point: override the bundled scenarios directory.
   * Defaults to the dir shipped next to the bin.
   */
  readonly scenariosDir?: string;
}

/**
 * Resolve the bundled scenarios directory relative to this module.
 *
 * Templates ship adjacent to the source. After build this module lives at
 * `dist/commands/demo.js`; in dev (`tsx`) at `src/commands/demo.ts`. From
 * either, `../../templates/demo/scenarios` reaches the fixtures, exactly
 * like `lib/template.ts` resolves its template root.
 */
function bundledScenariosDir(): string {
  return path.resolve(__dirname, "..", "..", "templates", "demo", "scenarios");
}

export async function runDemo(options: DemoOptions = {}): Promise<void> {
  const format: SimulationFormat = options.format ?? "text";
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const scenariosDir = options.scenariosDir ?? bundledScenariosDir();

  const scenarioPaths = await listScenarios(scenariosDir);

  // Text mode: render each scenario's full Decision box (colour via the
  // shared `decisionStyle`), then a closing diff-style summary. JSON mode:
  // emit just the machine-readable diff report, mirroring how `simulate`
  // keeps `--format json` output a single parseable document.
  if (format === "text") {
    for (const scenarioPath of scenarioPaths) {
      out(await renderScenarioBox(scenarioPath));
      out("");
    }
  }

  const report = await runDiff(
    { id: vacationPack.id, policy: vacationPack.policy },
    scenarioPaths,
  );
  out(
    format === "json"
      ? renderDiffJson(report, { id: vacationPack.id })
      : renderDiffText(report, { id: vacationPack.id }),
  );
}

async function renderScenarioBox(scenarioPath: string): Promise<string> {
  let scenario;
  try {
    scenario = await loadScenario(scenarioPath);
  } catch (err) {
    if (err instanceof ScenarioParseError) {
      return chalk.red(err.message);
    }
    const e = err instanceof Error ? err : new Error(String(err));
    return chalk.red(`Failed to load scenario "${scenarioPath}": ${e.message}`);
  }

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

  const { decision, trace } = adjudicateWithTrace(
    envelope,
    scenario.state,
    vacationPack.policy as PolicyBundle<string, unknown, unknown>,
  );

  const output: SimulationOutput = {
    pack: { id: vacationPack.id },
    envelope,
    decision,
    trace,
    ...(scenario.expected ? { expected: scenario.expected } : {}),
  };

  return render(output, "text");
}
