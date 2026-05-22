/**
 * `adjudicate scenarios generate` — emit canonical scenario JSON
 * fixtures from a Pack.
 *
 * Generates `--count <N>` (default 3) scenario files per intent kind
 * declared on the Pack. The output shape matches what `adjudicate
 * simulate --scenario <file>` consumes:
 *
 *   { intent: { kind, payload, actor, taint, nonce, createdAt }, state }
 *
 * The generator uses a seeded LCG (same construction as
 * @adjudicate/conformance/prng) so the same `--seed` always yields
 * byte-identical fixtures. Payload values are generic — keys discovered
 * from the kind, values are primitive defaults — because the CLI has
 * no per-Pack schema introspection. Pack authors who need richer
 * payload shapes can post-process the generated files or layer a
 * domain-specific generator on top.
 *
 * State is empty (`{}`) by default, or piped through
 * `pack.rehydrateState({})` if the Pack supplies one, so Map-shaped
 * states are reconstituted to the right container type.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { errorMessage } from "../lib/error-message.js";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface ScenariosGenerateOptions {
  /** Pack module spec. */
  readonly pack: string;
  /** Output directory (must exist). */
  readonly output: string;
  /** Number of fixtures per intent kind. Default 3. */
  readonly count?: number;
  /** PRNG seed. Default 42. */
  readonly seed?: number;
  /** Test injection. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
}

interface LoadedPack {
  readonly id: string;
  readonly intents: ReadonlyArray<string>;
  readonly rehydrateState?: (raw: unknown) => unknown;
}

interface GeneratedScenario {
  readonly intent: {
    readonly kind: string;
    readonly payload: unknown;
    readonly actor: { readonly principal: "llm"; readonly sessionId: string };
    readonly taint: "UNTRUSTED";
    readonly nonce: string;
    readonly createdAt: string;
  };
  readonly state: unknown;
}

export async function runScenariosGenerate(
  options: ScenariosGenerateOptions,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const count = options.count ?? 3;
  const seed = options.seed ?? 42;
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));

  if (!options.output) {
    fail("--output <dir> is required.");
  }

  // The output dir must exist — the CLI does not implicitly mkdir
  // because that would silently mask typos in the path argument.
  try {
    const stat = await fs.stat(options.output);
    if (!stat.isDirectory()) {
      fail(`--output "${options.output}" is not a directory.`);
    }
  } catch {
    fail(
      `--output dir "${options.output}" does not exist. Create it first.`,
    );
  }

  const pack = await loadPack(options.pack, cwd);

  const rng = lcg(seed);
  const state = pack.rehydrateState ? pack.rehydrateState({}) : {};
  const stateJson = stateToJson(state);

  let written = 0;
  for (const kind of pack.intents) {
    for (let i = 1; i <= count; i++) {
      const scenario = generateScenario(rng, kind, i, stateJson);
      const filename = `${sanitize(kind)}-${i}.json`;
      const filePath = path.join(options.output, filename);
      await fs.writeFile(filePath, JSON.stringify(scenario, null, 2), "utf8");
      written++;
    }
  }

  out(
    chalk.green("✓") +
      ` Wrote ${written} scenario fixture(s) to ${options.output}` +
      chalk.dim(` (seed=${seed}, count=${count}/kind)`),
  );
}

function generateScenario(
  rng: Rng,
  kind: string,
  index: number,
  state: unknown,
): GeneratedScenario {
  return {
    intent: {
      kind,
      payload: generatePayload(rng, kind),
      actor: { principal: "llm", sessionId: `gen-${index}` },
      taint: "UNTRUSTED",
      nonce: deterministicNonce(rng),
      createdAt: deterministicTimestamp(rng),
    },
    state,
  };
}

/**
 * Synthesize a generic payload. We don't know the Pack's payload
 * shapes — adopters who want schema-aware values layer a Zod-driven
 * generator on top. The defaults below give a non-empty, JSON-safe
 * payload that exercises the envelope path through `adjudicate()`.
 */
function generatePayload(rng: Rng, kind: string): Record<string, unknown> {
  return {
    seq: Math.floor(rng() * 1000),
    id: `${kind}-${Math.floor(rng() * 1_000_000).toString(36)}`,
    amount: Math.floor(rng() * 100_000),
    note: "generated",
  };
}

function stateToJson(state: unknown): unknown {
  // Maps don't survive JSON.stringify — flatten them to plain objects.
  if (state instanceof Map) {
    return Object.fromEntries(state.entries());
  }
  if (state && typeof state === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) {
      out[k] = v instanceof Map ? Object.fromEntries(v.entries()) : v;
    }
    return out;
  }
  return state;
}

function sanitize(kind: string): string {
  // Intent kinds are dotted; keep them filename-safe.
  return kind.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function loadPack(spec: string, cwd: string): Promise<LoadedPack> {
  let pack: unknown;
  try {
    pack = await loadPackFromModule(spec, cwd);
  } catch (e) {
    fail(`Failed to import pack: ${errorMessage(e)}`);
  }
  if (!isLoadedPack(pack)) {
    fail(`No Pack export found in "${spec}".`);
  }
  return pack;
}

function isLoadedPack(v: unknown): v is LoadedPack {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    "intents" in v &&
    Array.isArray((v as { intents: unknown }).intents)
  );
}


function fail(message: string): never {
  console.error(chalk.red("✗"), message);
  process.exit(1);
}

// ─── Seeded PRNG ───────────────────────────────────────────────────────────
//
// LCG copied (not imported) from @adjudicate/conformance/prng to keep
// the CLI free of a runtime dep on the conformance harness — adopters
// who never run `scenarios generate` should not transitively pull in
// fast-check and friends via that package.

type Rng = () => number;

function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function deterministicNonce(rng: Rng): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += hex[Math.floor(rng() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-";
  }
  return s;
}

function deterministicTimestamp(rng: Rng): string {
  const minuteOffset = Math.floor(rng() * 1440);
  const baseMs = Date.UTC(2026, 4, 18, 0, 0, 0, 0);
  return new Date(baseMs + minuteOffset * 60_000).toISOString();
}
