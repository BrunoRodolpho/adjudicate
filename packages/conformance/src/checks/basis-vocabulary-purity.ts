/**
 * AC-004 — every basis code emitted by the Pack belongs to
 * `BASIS_CODES[category]` (the framework's closed vocabulary). REFUSE
 * decisions may additionally carry a refusal `code` outside the closed
 * vocabulary — those are the Pack's domain refusal codes and must be
 * declared in `pack.basisCodes`.
 *
 * Mirrors `packages/core/tests/kernel/invariants/basis-vocabulary-purity.property.test.ts`
 * and the runtime `withBasisAudit` wrapper, but framed as a one-shot
 * conformance check. The wrapper records drift as telemetry but does
 * not block — this check fails the Pack if drift is observable on any
 * sampled envelope, so adopters surface the issue in CI instead of
 * waiting for it to appear in a metrics dashboard.
 *
 * **Methodology.** Build envelopes across all declared intent kinds and
 * across all taint levels (so REFUSE / REWRITE / DEFER / ESCALATE paths
 * are exercised, not only EXECUTE). Inspect each Decision's `basis[]`:
 *   - Every `basis.code` MUST be in `BASIS_CODES[basis.category]`.
 *   - REFUSE decisions MUST also have `refusal.code` in
 *     `pack.basisCodes ∪ KERNEL_REFUSAL_CODES`.
 */

import {
  buildEnvelope,
  isKnownBasisCode,
  KERNEL_REFUSAL_CODES,
} from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0, Taint } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg, pick } from "../prng.js";
import { emptyStateFor } from "../state.js";

// `guard_panic` is now part of `KERNEL_REFUSAL_CODES` in core — see
// `packages/core/src/pack-conformance.ts`. The pre-merge overlay this
// module carried is no longer needed.

const TAINT_OPTIONS: ReadonlyArray<Taint> = ["SYSTEM", "TRUSTED", "UNTRUSTED"];

export const basisVocabularyPurityCheck: ConformanceCheck = {
  id: "AC-004",
  name: "Every emitted basis code is in BASIS_CODES; REFUSE codes are declared in Pack.basisCodes",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);

    const declaredCodes = new Set<string>(pack.basisCodes);
    const failures: string[] = [];
    let attempted = 0;
    const emptyState = emptyStateFor(pack);

    for (const kind of pack.intents) {
      for (let i = 0; i < sampling; i++) {
        attempted++;
        const taint = pick(rng, TAINT_OPTIONS);
        const envelope = buildEnvelope({
          kind: kind as string,
          payload: { __conformanceProbe: true, seed: rng() } as P,
          actor: { principal: "llm", sessionId: "conformance" },
          taint,
          nonce: deterministicNonce(rng),
          createdAt: deterministicTimestamp(rng),
        }) as IntentEnvelope<K, P>;
        let decision;
        try {
          decision = adjudicate(envelope, emptyState, pack.policy);
        } catch (err) {
          failures.push(
            `kind="${String(kind)}" threw outside the kernel: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
        for (const b of decision.basis) {
          if (!isKnownBasisCode(b)) {
            failures.push(
              `kind="${String(kind)}" emitted unknown basis code "${b.category}:${String(b.code)}"`,
            );
            // First drift per kind is enough.
            break;
          }
        }
        if (decision.kind === "REFUSE") {
          const code = decision.refusal.code;
          if (
            !declaredCodes.has(code) &&
            !KERNEL_REFUSAL_CODES.has(code)
          ) {
            failures.push(
              `kind="${String(kind)}" emitted REFUSE code "${code}" outside Pack.basisCodes ∪ KERNEL_REFUSAL_CODES`,
            );
            break;
          }
        }
      }
    }

    if (failures.length > 0) {
      return {
        id: basisVocabularyPurityCheck.id,
        name: basisVocabularyPurityCheck.name,
        passed: false,
        details: `Basis vocabulary drift: ${failures.join("; ")}`,
      };
    }
    return {
      id: basisVocabularyPurityCheck.id,
      name: basisVocabularyPurityCheck.name,
      passed: true,
      details: `Verified ${attempted} Decisions against BASIS_CODES across ${pack.intents.length} intent kind(s).`,
    };
  },
};
