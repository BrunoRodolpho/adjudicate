import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { detectWorkspace } from "../lib/workspace.js";

const REQUIRED_NODE_MAJOR = 20;

interface CheckResult {
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly message: string;
}

async function checkNode(): Promise<CheckResult> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= REQUIRED_NODE_MAJOR) {
    return {
      name: "Node version",
      status: "pass",
      message: `${process.versions.node} (≥ ${REQUIRED_NODE_MAJOR})`,
    };
  }
  return {
    name: "Node version",
    status: "fail",
    message: `${process.versions.node} (need ≥ ${REQUIRED_NODE_MAJOR})`,
  };
}

async function checkWorkspace(): Promise<CheckResult> {
  const ws = await detectWorkspace();
  if (ws.mode === "monorepo") {
    return {
      name: "Workspace",
      status: "pass",
      message: `monorepo at ${ws.rootDir}`,
    };
  }
  return {
    name: "Workspace",
    status: "warn",
    message:
      "standalone (no pnpm-workspace.yaml found walking up from cwd)",
  };
}

async function checkCoreBuilt(): Promise<CheckResult> {
  const ws = await detectWorkspace();
  if (ws.mode !== "monorepo") {
    return {
      name: "@adjudicate/core dist",
      status: "warn",
      message:
        "skipped (standalone — verify your @adjudicate/core install separately)",
    };
  }
  const corePath = path.join(
    ws.rootDir,
    "packages",
    "core",
    "dist",
    "index.js",
  );
  try {
    await fs.access(corePath);
    return {
      name: "@adjudicate/core dist",
      status: "pass",
      message: `built (${path.relative(ws.rootDir, corePath)})`,
    };
  } catch {
    return {
      name: "@adjudicate/core dist",
      status: "fail",
      message: "missing — run `pnpm -r build` from the workspace root",
    };
  }
}

/**
 * `adjudicate doctor` — environment verification.
 *
 * Phase 3a checks: Node version, workspace shape, @adjudicate/core
 * dist presence. Future expansions: Postgres URL connectivity (when
 * DATABASE_URL set), Redis URL connectivity (when REDIS_URL set), pnpm
 * version constraint, package metadata sanity.
 */
export async function runDoctor(): Promise<void> {
  const checks: CheckResult[] = [
    await checkNode(),
    await checkWorkspace(),
    await checkCoreBuilt(),
  ];

  console.log(chalk.bold("adjudicate doctor"));
  console.log();

  for (const c of checks) {
    const sym =
      c.status === "pass"
        ? chalk.green("✓")
        : c.status === "warn"
          ? chalk.yellow("⚠")
          : chalk.red("✗");
    console.log(sym, chalk.bold(c.name) + ":", c.message);
  }

  console.log();
  const failures = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  if (failures > 0) {
    console.log(chalk.red(`${failures} check(s) failed.`));
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(
      chalk.yellow(`${warnings} warning(s)`),
      chalk.dim("— may be expected depending on your setup."),
    );
    return;
  }
  console.log(chalk.green("Environment looks good."));
}
