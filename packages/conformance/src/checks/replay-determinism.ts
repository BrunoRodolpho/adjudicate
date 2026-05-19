/**
 * AC-002 — Replay determinism. `adjudicate()` is a pure function of
 * `(envelope, state, policy)`. Re-adjudicating the same envelope twice
 * against the Pack's policy MUST produce a Decision that matches by
 * kind, flat-set basis, and (for REFUSE) refusal code. If this property
 * fails the replay harness's foundational claim is invalid for this
 * Pack — audit replay would surface false-positive mismatches.
 *
 * Mirrors `packages/core/tests/kernel/invariants/replay-determinism.property.test.ts`
 * but runs against the Pack's own policy. The classifier rule is inlined
 * here (same shape as `@adjudicate/audit`) to avoid a dependency cycle —
 * `@adjudicate/conformance` MUST stay a peer-dep of `@adjudicate/core`
 * only.
 *
 * **Methodology.** For each kind, build a fresh envelope and run
 * `adjudicate()` twice with the same `(envelope, {}, policy)` triple.
 * Compare Decisions structurally. Vary taint across SYSTEM/TRUSTED/
 * UNTRUSTED so kinds that demand TRUSTED don't all short-circuit at
 * the taint gate — the property must hold on every path through the
 * kernel, not only on the easy REFUSE-default path.
 */

import { buildEnvelope } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import type {
  Decision,
  DecisionBasis,
  IntentEnvelope,
  PackV0,
  Taint,
} from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg, pick } from "../prng.js";
import { emptyStateFor } from "../state.js";

const TAINT_OPTIONS: ReadonlyArray<Taint> = ["SYSTEM", "TRUSTED", "UNTRUSTED"];

function flat(basis: readonly DecisionBasis[]): readonly string[] {
  return basis.map((b) => `${b.category}:${b.code}`).sort();
}

/**
 * Match rule: equal kind + flat-set basis + (for REFUSE) refusal code.
 * Duplicated from `@adjudicate/audit/replay.classify` to keep this
 * package a clean peer of `@adjudicate/core` (no audit dependency).
 */
function decisionsMatch(a: Decision, b: Decision): boolean {
  if (a.kind !== b.kind) return false;
  const flatA = flat(a.basis);
  const flatB = flat(b.basis);
  if (flatA.length !== flatB.length) return false;
  for (let i = 0; i < flatA.length; i++) {
    if (flatA[i] !== flatB[i]) return false;
  }
  if (a.kind === "REFUSE" && b.kind === "REFUSE") {
    if (a.refusal.code !== b.refusal.code) return false;
  }
  return true;
}

export const replayDeterminismCheck: ConformanceCheck = {
  id: "AC-002",
  name: "Replay determinism — adjudicate() is a pure function of (envelope, state, policy)",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);

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
        let a: Decision;
        let b: Decision;
        try {
          a = adjudicate(envelope, emptyState, pack.policy);
          b = adjudicate(envelope, emptyState, pack.policy);
        } catch (err) {
          failures.push(
            `kind="${String(kind)}" threw outside the kernel: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
        if (!decisionsMatch(a, b)) {
          failures.push(
            `kind="${String(kind)}" produced divergent Decisions on repeated adjudication (kinds: ${a.kind} vs ${b.kind}; nonce=${envelope.nonce})`,
          );
          break;
        }
      }
    }

    if (failures.length > 0) {
      return {
        id: replayDeterminismCheck.id,
        name: replayDeterminismCheck.name,
        passed: false,
        details: `Replay determinism violated: ${failures.join("; ")}`,
      };
    }
    return {
      id: replayDeterminismCheck.id,
      name: replayDeterminismCheck.name,
      passed: true,
      details: `Verified ${attempted} envelope replays across ${pack.intents.length} intent kind(s).`,
    };
  },
};
