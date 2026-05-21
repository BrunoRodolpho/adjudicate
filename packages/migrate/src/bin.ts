#!/usr/bin/env node
/**
 * `adjudicate-migrate` CLI entry. Usage:
 *
 *     adjudicate-migrate <codemod-id> <glob...> [--dry-run]
 *
 * Examples:
 *
 *     adjudicate-migrate name-guard-to-with-metadata "src/**\/*.ts"
 *     adjudicate-migrate name-guard-to-with-metadata "src/**\/*.ts" --dry-run
 *
 * The CLI is deliberately minimal — no flag parsing library, no colour
 * output, no progress bar. Codemods are run rarely (one per deprecation
 * window) and adopters typically pipe the report into review tooling.
 */

import { listCodemods, runCodemod } from "./runner.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    return 0;
  }

  if (argv[0] === "list") {
    for (const c of listCodemods()) {
      console.log(`${c.id}\t${c.description}`);
    }
    return 0;
  }

  const id = argv[0]!;
  const dryRun = argv.includes("--dry-run");
  const globs = argv.slice(1).filter((a) => a !== "--dry-run");

  if (globs.length === 0) {
    console.error("error: at least one glob is required");
    printUsage();
    return 2;
  }

  const report = await runCodemod({ id, globs, dryRun });

  for (const change of report.changes) {
    if (change.kind === "skip") {
      console.warn(`SKIP ${change.file}:${change.line} — ${change.reason ?? "(no reason)"}`);
    } else {
      console.log(`REWRITE ${change.file}:${change.line}`);
    }
  }
  console.log(
    `\n${report.filesChanged} file(s) ${dryRun ? "would be" : ""} changed; ${report.changes.length} change(s).`,
  );
  return 0;
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  adjudicate-migrate list");
  console.log("  adjudicate-migrate <codemod-id> <glob...> [--dry-run]");
  console.log("");
  console.log("Available codemods:");
  for (const c of listCodemods()) {
    console.log(`  ${c.id}  —  ${c.description}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
