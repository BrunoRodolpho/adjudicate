/**
 * Composite release-candidate invariant pipeline.
 *
 * Runs the chain of checks the v1.0 RC pipeline gates publishing on:
 *
 *   1. Lint (workspace-wide).
 *   2. Typecheck (the `lint` script's `tsc --noEmit` phase).
 *   3. Test suite (every workspace package).
 *   4. Version consistency (`scripts/check-versions.ts`).
 *   5. Freeze-matrix consistency (`scripts/check-freeze-matrix.ts`).
 *   6. Cross-runtime hash vectors (the in-tree `cross-runtime-hash-vectors.test.ts`
 *      is included in the test suite — this step verifies the spec file
 *      itself is present and parseable).
 *   7. Scale harness smoke tests (the CI-light variants under
 *      `bench/src/scale/scale.test.ts`).
 *
 * Each step prints its own status; the script exits non-zero on the
 * first failure. Designed to run in CI but also locally.
 *
 *   pnpm rc:check
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? "scripts", "..");

interface Step {
  readonly name: string;
  readonly run: () => Promise<{ ok: boolean; details?: string }>;
}

function runPnpm(args: string[]): { ok: boolean; details?: string } {
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status === 0) return { ok: true };
  return { ok: false, details: `pnpm ${args.join(" ")} exited with status ${result.status}` };
}

function runTsx(script: string): { ok: boolean; details?: string } {
  return runPnpm(["tsx", script]);
}

const steps: Step[] = [
  {
    name: "lint (typecheck + eslint)",
    async run() {
      return runPnpm(["lint"]);
    },
  },
  {
    name: "test suite (every workspace)",
    async run() {
      return runPnpm(["test"]);
    },
  },
  {
    name: "version consistency",
    async run() {
      return runTsx("scripts/check-versions.ts");
    },
  },
  {
    name: "freeze-matrix consistency",
    async run() {
      return runTsx("scripts/check-freeze-matrix.ts");
    },
  },
  {
    name: "kernel dep allowlist (@adjudicate/core)",
    async run() {
      const ALLOWED_DEPS = new Set([
        "@adjudicate/canonical",
        "@noble/hashes",
        "zod",
      ]);
      const corePkgPath = join(ROOT, "packages", "core", "package.json");
      const raw = readFileSync(corePkgPath, "utf-8");
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
      const deps = Object.keys(pkg.dependencies ?? {});
      const violations = deps.filter((d) => !ALLOWED_DEPS.has(d));
      if (violations.length > 0) {
        return {
          ok: false,
          details: `@adjudicate/core has unlisted dependencies: ${violations.join(", ")}. ` +
            `Update the ALLOWED_DEPS set in scripts/rc-checks.ts only after deliberate kernel review.`,
        };
      }
      console.log(`  kernel deps clean: ${deps.join(", ")}`);
      return { ok: true };
    },
  },
  {
    name: "cross-runtime hash vectors spec presence",
    async run() {
      try {
        const raw = readFileSync(
          join(ROOT, "docs", "specs", "canonical-hash-vectors.json"),
          "utf-8",
        );
        const parsed = JSON.parse(raw) as { vectors?: unknown[] };
        if (!Array.isArray(parsed.vectors) || parsed.vectors.length === 0) {
          return { ok: false, details: "canonical-hash-vectors.json has no vectors" };
        }
        console.log(`  ${parsed.vectors.length} cross-runtime vectors present`);
        return { ok: true };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return { ok: false, details: e.message };
      }
    },
  },
  {
    name: "scale harness smoke (bench/src/scale)",
    async run() {
      return runPnpm(["-F", "@adjudicate/bench", "test"]);
    },
  },
];

let failed = false;
for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const result = await step.run();
  if (!result.ok) {
    console.error(`FAILED: ${step.name}`);
    if (result.details) console.error(`  ${result.details}`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error("\nrc-checks: FAIL");
  process.exit(1);
}
console.log("\nrc-checks: PASS");
