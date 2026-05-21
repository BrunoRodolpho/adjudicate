/**
 * AC-006 — `policy.default = "EXECUTE"` requires explicit opt-in.
 *
 * Mirrors the T4 #20 polarity check already enforced at boot time by
 * `assertPackConformance`. Reproducing it here means the conformance
 * harness's pass/fail surface covers the same ground without the
 * adopter needing to call `assertPackConformance` separately —
 * `runConformance(pack)` is the one entry point.
 *
 * The framework's recommended polarity is REFUSE. An EXECUTE default
 * silently authorizes any intent that no positive guard matched, which
 * is the most direct authority leak available to a Pack. Adopters who
 * legitimately need fail-open (read-only Packs: search, summary,
 * classification) opt in via `options.allowDefaultExecute`.
 */

import type { PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";

export const defaultPolarityCheck: ConformanceCheck = {
  id: "AC-006",
  name: "policy.default = \"EXECUTE\" requires { allowDefaultExecute: true } opt-in",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    if (pack.policy.default === "EXECUTE" && options.allowDefaultExecute !== true) {
      return {
        id: defaultPolarityCheck.id,
        name: defaultPolarityCheck.name,
        passed: false,
        details:
          `Pack "${pack.id}" declares policy.default = "EXECUTE" but ` +
          `runConformance() was not called with { allowDefaultExecute: true }. ` +
          `Read-only Packs that intentionally fail-open must opt in.`,
      };
    }
    return {
      id: defaultPolarityCheck.id,
      name: defaultPolarityCheck.name,
      passed: true,
      details:
        pack.policy.default === "REFUSE"
          ? `policy.default = "REFUSE" (recommended polarity).`
          : `policy.default = "EXECUTE" with explicit opt-in.`,
    };
  },
};
