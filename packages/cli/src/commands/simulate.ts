import chalk from "chalk";
import {
  adjudicateWithTrace,
  buildEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";
import {
  loadIntentAndState,
  loadScenario,
  ScenarioParseError,
  type Scenario,
} from "../lib/scenario.js";
import {
  render,
  type SimulationFormat,
  type SimulationOutput,
} from "../lib/simulate-renderer.js";
import {
  computeExitCode,
  listScenarios,
  renderDiffJson,
  renderDiffText,
  runDiff,
} from "../lib/simulate-diff.js";

export interface SimulateOptions {
  readonly pack: string;
  readonly scenario?: string;
  readonly intent?: string;
  readonly state?: string;
  /** Directory of `*.json` scenario files. Triggers diff mode. */
  readonly scenarios?: string;
  readonly format?: SimulationFormat;
  /** Test injection point. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Test injection point. Defaults to process.stdout writes. */
  readonly stdout?: (line: string) => void;
}

/**
 * `simulate` — run envelopes against a Pack's policy and render the
 * resulting Decision(s).
 *
 * Three input modes (exactly one is required):
 *   --scenarios <dir>            diff mode: walk all `*.json` in <dir>,
 *                                run each, render a summary table.
 *                                Exits 2 on any mismatch, 1 on errors.
 *   --scenario <file>            single bundled JSON (intent + state
 *                                + optional expected).
 *   --intent <file> --state <f>  single, from two files. Useful when
 *                                the same state is reused across many
 *                                intent fixtures.
 *
 * The pack argument is anything `import()` accepts:
 *   - npm package name (resolves via Node's module resolution):
 *       --pack @adjudicate/pack-payments-pix
 *   - relative or absolute path (converted to file:// URL):
 *       --pack ./packages/pack-payments-pix/dist/index.js
 *       --pack /abs/path/to/pack/src/index.ts
 */
export async function runSimulate(options: SimulateOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const format: SimulationFormat = options.format ?? "text";
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));

  validateModeSelection(options);

  const pack = await loadAndAssertPack(options.pack, cwd);

  if (options.scenarios) {
    await runDiffMode(pack, options.scenarios, format, out);
    return;
  }

  await runSingleMode(pack, options, format, out);
}

function validateModeSelection(options: SimulateOptions): void {
  const hasScenarios = !!options.scenarios;
  const hasScenario = !!options.scenario;
  const hasIntentState = !!options.intent && !!options.state;
  const modesSelected =
    Number(hasScenarios) + Number(hasScenario) + Number(hasIntentState);

  if (modesSelected !== 1) {
    fail(
      "Specify exactly one of: --scenarios <dir>, --scenario <file>, or --intent <file> --state <file>.",
    );
  }
  if (
    (options.intent && !options.state) ||
    (options.state && !options.intent)
  ) {
    fail("--intent and --state must be provided together.");
  }
}

async function loadAndAssertPack(
  spec: string,
  cwd: string,
): Promise<LoadedPack> {
  let pack: unknown;
  try {
    pack = await loadPackFromModule(spec, cwd);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    fail(`Failed to import pack "${spec}": ${e.message}`);
  }
  if (!pack || !isLoadedPack(pack)) {
    fail(
      `No Pack export found in "${spec}". The CLI looks for a default export OR a named export with intents+policy+contract.`,
    );
  }
  return pack;
}

async function runSingleMode(
  pack: LoadedPack,
  options: SimulateOptions,
  format: SimulationFormat,
  out: (line: string) => void,
): Promise<void> {
  let scenario: Scenario;
  try {
    scenario = options.scenario
      ? await loadScenario(options.scenario)
      : await loadIntentAndState(options.intent!, options.state!);
  } catch (err) {
    if (err instanceof ScenarioParseError) {
      fail(err.message);
    }
    const e = err instanceof Error ? err : new Error(String(err));
    fail(`Failed to load scenario: ${e.message}`);
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

  const state = pack.rehydrateState
    ? pack.rehydrateState(scenario.state)
    : scenario.state;

  const { decision, trace } = adjudicateWithTrace(
    envelope,
    state,
    pack.policy as PolicyBundle<string, unknown, unknown>,
  );

  const output: SimulationOutput = {
    pack: { id: pack.id },
    envelope,
    decision,
    trace,
    ...(scenario.expected ? { expected: scenario.expected } : {}),
  };

  out(render(output, format));

  if (scenario.expected && scenario.expected.kind !== decision.kind) {
    process.exit(2);
  }
}

async function runDiffMode(
  pack: LoadedPack,
  scenariosDir: string,
  format: SimulationFormat,
  out: (line: string) => void,
): Promise<void> {
  let scenarioPaths: string[];
  try {
    scenarioPaths = await listScenarios(scenariosDir);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    fail(`Failed to read scenarios dir "${scenariosDir}": ${e.message}`);
  }

  const report = await runDiff(pack, scenarioPaths);
  out(
    format === "json"
      ? renderDiffJson(report, { id: pack.id })
      : renderDiffText(report, { id: pack.id }),
  );

  const exitCode = computeExitCode(report.summary);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

interface LoadedPack {
  readonly id: string;
  readonly policy: unknown;
  /**
   * Optional adopter-supplied rehydrator. Tools that feed in
   * JSON-serializable state (CLI `simulate`, audit replay) call this
   * to convert into the Pack's runtime state shape (e.g., Records →
   * Maps). Absent on Packs whose state survives JSON round-tripping.
   */
  readonly rehydrateState?: (raw: unknown) => unknown;
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

function fail(message: string): never {
  console.error(chalk.red("✗"), message);
  process.exit(1);
}
