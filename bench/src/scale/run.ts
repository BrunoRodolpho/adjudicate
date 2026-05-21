/**
 * Production-simulation harness CLI driver.
 *
 *   pnpm -F @adjudicate/bench tsx src/scale/run.ts [scenario] [--out <path>]
 *
 * scenarios:
 *   - audit-bus-light  (CI-safe, used by tests)
 *   - audit-bus-heavy  (operational evidence)
 *   - kill-light       (CI-safe, used by tests)
 *   - kill-heavy       (operational evidence)
 *   - all              (default — runs all four and emits one artifact)
 *
 * Output: machine-readable JSON written to stdout or `--out <file>`.
 * The format is committed to `docs/perf/scale-baselines.json` after each
 * RC certification run.
 */

import { writeFileSync } from "node:fs";
import { runAuditEventBusScale, type AuditEventBusScaleConfig } from "./audit-event-bus-scale.js";
import { runKillSwitchScale, type KillSwitchScaleConfig } from "./kill-switch-scale.js";
import type { BenchArtifact } from "./types.js";

const SCENARIOS: Record<string, () => Promise<BenchArtifact>> = {
  "audit-bus-light": () =>
    runAuditEventBusScale({
      subscribers: 32,
      records: 200,
      burstSize: 25,
      slowFraction: 0.1,
      slowConsumerMs: 0,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 1,
      dropRate: 0,
      reconnectCycles: 1,
      malformedInjections: 5,
      seed: 1,
      scenario: "audit-bus-light",
    }),
  "audit-bus-heavy": () =>
    runAuditEventBusScale({
      subscribers: 500,
      records: 5000,
      burstSize: 100,
      slowFraction: 0.05,
      slowConsumerMs: 1,
      pubsubLatencyMs: 1,
      pubsubJitterMs: 4,
      dropRate: 0.001,
      reconnectCycles: 2,
      malformedInjections: 50,
      seed: 42,
      scenario: "audit-bus-heavy",
    }),
  "kill-light": () =>
    runKillSwitchScale({
      replicas: 8,
      transitions: 16,
      pollMs: 100,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 2,
      dropRate: 0,
      partitionMs: 50,
      reconnectCycles: 1,
      crashes: 1,
      lateBoots: 1,
      seed: 7,
      scenario: "kill-light",
    }),
  "kill-heavy": () =>
    runKillSwitchScale({
      replicas: 64,
      transitions: 100,
      pollMs: 100,
      pubsubLatencyMs: 2,
      pubsubJitterMs: 6,
      dropRate: 0.005,
      partitionMs: 200,
      reconnectCycles: 3,
      crashes: 5,
      lateBoots: 4,
      seed: 1337,
      scenario: "kill-heavy",
    }),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let scenario = "all";
  let outPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--out" || a === "-o") {
      outPath = args[++i] ?? null;
    } else if (!a.startsWith("--")) {
      scenario = a;
    }
  }

  const targetNames =
    scenario === "all" ? Object.keys(SCENARIOS) : [scenario];
  const artifacts: BenchArtifact[] = [];
  for (const name of targetNames) {
    const runner = SCENARIOS[name];
    if (!runner) {
      console.error(`unknown scenario: ${name}`);
      process.exit(2);
    }
    artifacts.push(await runner());
  }

  const report = {
    generatedAt: new Date().toISOString(),
    repoVersion: process.env.GITHUB_SHA ?? "local",
    artifacts,
  };

  const json = JSON.stringify(report, null, 2);
  if (outPath) {
    writeFileSync(outPath, json + "\n", "utf-8");
    console.error(`scale report written to ${outPath}`);
  } else {
    process.stdout.write(json + "\n");
  }
}

await main();
