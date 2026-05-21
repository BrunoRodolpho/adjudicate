/**
 * `runConformance(pack, options) → ConformanceReport`.
 *
 * The single public entry point of `@adjudicate/conformance`. Adopters
 * who want to verify their Pack against the framework's invariant suite
 * call this — at boot time, in CI, or both:
 *
 * ```ts
 * import { runConformance } from "@adjudicate/conformance";
 * import { myPack } from "./my-pack";
 *
 * const report = runConformance(myPack);
 * if (!report.passed) {
 *   for (const r of report.results) {
 *     if (!r.passed) console.error(`[${r.id}] ${r.name}: ${r.details}`);
 *   }
 *   process.exit(1);
 * }
 * ```
 *
 * Determinism: same `(pack, options)` MUST produce a byte-identical
 * `ConformanceReport`. The harness threads a seeded LCG through every
 * check that samples envelopes; `Math.random()` is banned in this
 * package. Same seed → same envelopes → same Decisions → same report.
 *
 * Defence in depth: every check is invoked inside a try/catch so a bug
 * in one check cannot crash the harness — the failing check produces a
 * `passed: false` with the thrown message in `details`, and the rest
 * of the suite still runs.
 */

import type { PackV0 } from "@adjudicate/core";
import { DEFAULT_CHECKS } from "./checks.js";
import type {
  ConformanceCheck,
  ConformanceOptions,
  ConformanceReport,
  ConformanceResult,
} from "./types.js";

export function runConformance<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  options: ConformanceOptions = {},
): ConformanceReport {
  const checks: ReadonlyArray<ConformanceCheck> =
    options.checks ?? DEFAULT_CHECKS;
  const results: ConformanceResult[] = [];

  for (const check of checks) {
    let result: ConformanceResult;
    try {
      result = check.run(pack, options);
    } catch (err) {
      // Defence in depth — a check that throws still produces a clean
      // failed result instead of bringing down the harness. Bugs in a
      // check should not be a quiet pass.
      result = {
        id: check.id,
        name: check.name,
        passed: false,
        details: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    results.push(result);
  }

  let passedCount = 0;
  let failedCount = 0;
  for (const r of results) {
    if (r.passed) passedCount++;
    else failedCount++;
  }

  return {
    packId: pack.id,
    results,
    passed: failedCount === 0,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
    },
  };
}
