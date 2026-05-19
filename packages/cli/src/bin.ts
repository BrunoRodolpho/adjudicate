#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyze, type AnalyzeFormat } from "./commands/analyze.js";
import { runDoctor } from "./commands/doctor.js";
import { runPackInit } from "./commands/pack-init.js";
import { runPackLint } from "./commands/pack-lint.js";
import { runSimulate } from "./commands/simulate.js";
import type { SimulationFormat } from "./lib/simulate-renderer.js";

const program = new Command();

program
  .name("adjudicate")
  .description(
    "adjudicate framework CLI — Pack lifecycle commands for policy authors",
  )
  .version("0.1.0-experimental");

const pack = program
  .command("pack")
  .description("Pack lifecycle commands");

pack
  .command("init <name>")
  .description("Scaffold a new Pack with the canonical layout")
  .option(
    "--target <dir>",
    "Override the parent directory the Pack is created under",
  )
  .action(async (name: string, options: { target?: string }) => {
    await runPackInit(name, { target: options.target });
  });

pack
  .command("lint [path]")
  .description(
    "Validate a Pack at <path> (default: cwd) against kernel conformance",
  )
  .action(async (packPath: string | undefined) => {
    await runPackLint(packPath);
  });

program
  .command("doctor")
  .description("Verify the local environment for adjudicate development")
  .action(async () => {
    await runDoctor();
  });

program
  .command("simulate")
  .description(
    "Run envelopes against a Pack's policy. Single (--scenario / --intent+--state) or diff (--scenarios <dir>)",
  )
  .requiredOption(
    "--pack <module>",
    "Pack module spec — npm package name or relative/absolute path",
  )
  .option(
    "--scenarios <dir>",
    "Directory of *.json scenarios. Diff mode: each is run and compared to its expected.kind; exits 2 on any mismatch, 1 on errors",
  )
  .option(
    "--scenario <file>",
    "Single bundled scenario JSON (intent + state + optional expected)",
  )
  .option("--intent <file>", "Intent JSON (must be paired with --state)")
  .option("--state <file>", "State JSON (must be paired with --intent)")
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(
    async (options: {
      pack: string;
      scenario?: string;
      scenarios?: string;
      intent?: string;
      state?: string;
      format?: string;
    }) => {
      const format = (options.format ?? "text") as SimulationFormat;
      if (format !== "text" && format !== "json") {
        console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
        process.exit(1);
      }
      await runSimulate({
        pack: options.pack,
        scenario: options.scenario,
        scenarios: options.scenarios,
        intent: options.intent,
        state: options.state,
        format,
      });
    },
  );

program
  .command("analyze")
  .description(
    "Run @adjudicate/analyze Tier 1 static analysis against a Pack",
  )
  .requiredOption(
    "--pack <module>",
    "Pack module spec — npm package name or relative/absolute path",
  )
  .option(
    "--format <text|json|sarif>",
    "Output format. text for developer, json for tooling, sarif for CI",
    "text",
  )
  .option(
    "--strict",
    "Escalate warnings to errors; analyze exits non-zero on any warning",
    false,
  )
  .action(
    async (options: { pack: string; format?: string; strict?: boolean }) => {
      const format = (options.format ?? "text") as AnalyzeFormat;
      if (format !== "text" && format !== "json" && format !== "sarif") {
        console.error(`✗ Unknown --format value "${options.format}". Use text, json, or sarif.`);
        process.exit(1);
      }
      await runAnalyze({
        pack: options.pack,
        format,
        strict: options.strict ?? false,
      });
    },
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
