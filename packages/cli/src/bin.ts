#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runPackInit } from "./commands/pack-init.js";
import { runPackLint } from "./commands/pack-lint.js";

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
