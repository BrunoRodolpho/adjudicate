/**
 * `adjudicate repl` — interactive intent → decision shell.
 *
 * Operators paste an intent kind + payload JSON + state JSON; the REPL
 * builds an envelope, runs `adjudicate()`, and prints the colored
 * Decision. Pure adjudication only — no audit sink, no side effects.
 *
 * **Why `node:readline` (not `prompts`):**
 *   The brief permitted `prompts` (~30KB) for richer UX, but the v0.5
 *   contract is "paste JSON" — there is no multi-step interactive flow
 *   to justify a dep. `node:readline` is in the Node std-lib and lets
 *   us keep the CLI's dep footprint at zero net adds. Future versions
 *   may switch to `prompts` for autocomplete on intent kinds and
 *   inline JSON construction.
 *
 * Special commands:
 *   `.quit`, `.exit`   — leave the REPL
 *   `.intents`         — list the loaded Pack's intent kinds
 *   `.help`            — print the cheat sheet
 *
 * Empty input is a no-op; an unrecognized command falls through to be
 * treated as an intent kind.
 */

import * as readline from "node:readline";
import chalk from "chalk";
import {
  adjudicate,
  buildEnvelope,
  type Decision,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface ReplOptions {
  /** Pack module spec. */
  readonly pack: string;
  /** Test injection. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /**
   * Test injection. When supplied, the REPL reads commands from this
   * iterable instead of attaching to stdin. The REPL exits when the
   * iterable is exhausted (no `.quit` required).
   */
  readonly input?: AsyncIterable<string>;
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
}

interface LoadedPack {
  readonly id: string;
  readonly intents: ReadonlyArray<string>;
  readonly policy: PolicyBundle<string, unknown, unknown>;
  readonly rehydrateState?: (raw: unknown) => unknown;
}

export async function runRepl(options: ReplOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));

  let pack: unknown;
  try {
    pack = await loadPackFromModule(options.pack, cwd);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out(chalk.red("✗") + ` Failed to import pack: ${msg}`);
    process.exit(1);
  }
  if (!isLoadedPack(pack)) {
    out(chalk.red("✗") + ` No Pack export found in "${options.pack}".`);
    process.exit(1);
  }

  out(chalk.bold("adjudicate repl"));
  out(
    chalk.dim(`pack: ${pack.id}  ·  intents: ${pack.intents.length}`) +
      "\n" +
      chalk.dim("Type .help for commands, .quit to exit."),
  );

  const lines = options.input ?? readStdinLines();

  // The REPL has three states per cycle:
  //   awaiting-kind     → operator types the intent kind (or a command)
  //   awaiting-payload  → operator pastes payload JSON (single line)
  //   awaiting-state    → operator pastes state JSON (single line)
  // Each completes one adjudicate() call. Multi-line JSON paste is
  // outside scope — adopters paste single-line JSON for v0.5.
  let stage: "kind" | "payload" | "state" = "kind";
  let pendingKind: string | undefined;
  let pendingPayload: unknown;

  out("");
  out(chalk.cyan("kind > "));
  for await (const raw of lines) {
    const line = raw.trim();

    if (stage === "kind") {
      if (line === "" ) {
        out(chalk.cyan("kind > "));
        continue;
      }
      if (line === ".quit" || line === ".exit") break;
      if (line === ".help") {
        out(renderHelp());
        out(chalk.cyan("kind > "));
        continue;
      }
      if (line === ".intents") {
        out(pack.intents.map((k) => `  • ${k}`).join("\n"));
        out(chalk.cyan("kind > "));
        continue;
      }
      pendingKind = line;
      stage = "payload";
      out(chalk.cyan("payload (JSON) > "));
      continue;
    }

    if (stage === "payload") {
      try {
        pendingPayload = line === "" ? {} : JSON.parse(line);
      } catch (e) {
        out(chalk.red("✗") + ` Payload JSON parse error: ${asMessage(e)}`);
        stage = "kind";
        pendingKind = undefined;
        out(chalk.cyan("kind > "));
        continue;
      }
      stage = "state";
      out(chalk.cyan("state (JSON, blank = {}) > "));
      continue;
    }

    // stage === "state"
    let stateRaw: unknown;
    try {
      stateRaw = line === "" ? {} : JSON.parse(line);
    } catch (e) {
      out(chalk.red("✗") + ` State JSON parse error: ${asMessage(e)}`);
      stage = "kind";
      pendingKind = undefined;
      pendingPayload = undefined;
      out(chalk.cyan("kind > "));
      continue;
    }

    const state = pack.rehydrateState
      ? pack.rehydrateState(stateRaw)
      : stateRaw;

    const envelope = buildEnvelope({
      kind: pendingKind!,
      payload: pendingPayload,
      actor: { principal: "llm", sessionId: "repl" },
      taint: "UNTRUSTED",
      nonce: `repl-${Date.now()}`,
    });

    let decision: Decision;
    try {
      decision = adjudicate(envelope, state, pack.policy);
    } catch (e) {
      out(chalk.red("✗") + ` adjudicate() threw: ${asMessage(e)}`);
      stage = "kind";
      pendingKind = undefined;
      pendingPayload = undefined;
      out(chalk.cyan("\nkind > "));
      continue;
    }

    out(renderDecision(envelope, decision));
    stage = "kind";
    pendingKind = undefined;
    pendingPayload = undefined;
    out(chalk.cyan("\nkind > "));
  }

  out(chalk.dim("bye."));
}

function renderHelp(): string {
  return [
    chalk.bold("commands"),
    "  .quit, .exit        leave the REPL",
    "  .intents            list this Pack's intent kinds",
    "  .help               this help text",
    "",
    chalk.bold("flow"),
    "  1. Type an intent kind (e.g. pix.charge.refund)",
    "  2. Paste single-line JSON payload",
    "  3. Paste single-line JSON state (blank = {})",
    "",
    "  Actor and taint default to {llm, sess=repl}/UNTRUSTED.",
    "  Adjudication is pure — no audit sink is invoked.",
  ].join("\n");
}

function renderDecision(env: IntentEnvelope, d: Decision): string {
  const badge = decisionBadge(d.kind);
  const lines: string[] = [];
  lines.push("");
  lines.push(`${badge}  ${chalk.dim(env.intentHash.slice(0, 12))}`);
  switch (d.kind) {
    case "EXECUTE":
      break;
    case "REFUSE":
      lines.push(
        chalk.red("  refusal:") + ` ${d.refusal.code} — ${d.refusal.userFacing}`,
      );
      break;
    case "ESCALATE":
      lines.push(chalk.yellow("  to:    ") + ` ${d.to}`);
      lines.push(chalk.yellow("  reason:") + ` ${d.reason}`);
      break;
    case "REQUEST_CONFIRMATION":
      lines.push(chalk.cyan("  prompt:") + ` ${d.prompt}`);
      break;
    case "DEFER":
      lines.push(chalk.magenta("  signal:  ") + d.signal);
      lines.push(chalk.magenta("  timeoutMs:") + ` ${d.timeoutMs}`);
      break;
    case "REWRITE":
      lines.push(chalk.green("  reason:") + ` ${d.reason}`);
      break;
  }
  if (d.basis.length > 0) {
    const flat = d.basis.map((b) => `${b.category}:${b.code}`).join(", ");
    lines.push(chalk.dim("  basis: ") + flat);
  }
  return lines.join("\n");
}

function decisionBadge(kind: Decision["kind"]): string {
  switch (kind) {
    case "EXECUTE":
      return chalk.bgGreen.black.bold(" EXECUTE ");
    case "REFUSE":
      return chalk.bgRed.white.bold(" REFUSE ");
    case "ESCALATE":
      return chalk.bgYellow.black.bold(" ESCALATE ");
    case "REQUEST_CONFIRMATION":
      return chalk.bgCyan.black.bold(" REQUEST_CONFIRMATION ");
    case "DEFER":
      return chalk.bgMagenta.white.bold(" DEFER ");
    case "REWRITE":
      return chalk.bgBlue.white.bold(" REWRITE ");
  }
}

async function* readStdinLines(): AsyncIterable<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  for await (const line of rl) {
    yield line;
  }
}

function isLoadedPack(v: unknown): v is LoadedPack {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    "policy" in v &&
    "intents" in v &&
    Array.isArray((v as { intents: unknown }).intents)
  );
}

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
