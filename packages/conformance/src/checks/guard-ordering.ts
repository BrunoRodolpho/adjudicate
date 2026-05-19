/**
 * AC-005 — kernel guard evaluation order is structurally enforced:
 * `kill → schema → state → taint → auth → business → default`.
 *
 * The order is enforced inside `_adjudicateImpl` in `@adjudicate/core` —
 * the Pack itself cannot reorder phases. This check therefore exercises
 * the order indirectly via `adjudicateWithTrace` against the Pack's
 * policy and asserts two structural properties:
 *
 *   1. The phases recorded in any trace form a (not-necessarily-
 *      contiguous) subsequence of the canonical
 *      `kill → schema → state → taint → auth → business → default`
 *      ordering. Phases that didn't run (because an earlier phase
 *      short-circuited) are absent; phases that did run appear in the
 *      canonical order.
 *   2. For every taint-protected kind, an UNTRUSTED envelope MUST NOT
 *      cause an auth guard to be invoked. The auth phase entry must
 *      either be absent (because state or taint short-circuited) or,
 *      if present, must follow a taint phase entry that did not
 *      `match`. In particular: a taint refusal must precede any auth
 *      entry, never follow it. This is the T8 reorder guarantee.
 *
 * Mirrors `packages/core/tests/kernel/invariants/guard-order.test.ts` but
 * binds to the Pack's actual policy so doc drift in the framework
 * cannot silently pass a Pack-side check.
 */

import { buildEnvelope, canPropose } from "@adjudicate/core";
import { adjudicateWithTrace } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { emptyStateFor } from "../state.js";

const CANONICAL_ORDER: ReadonlyArray<string> = [
  "kill",
  "schema",
  "state",
  "taint",
  "auth",
  "business",
  "default",
];

function phaseOrderIsCanonical(phases: ReadonlyArray<string>): boolean {
  // The trace omits phases that don't run after a short-circuit. The
  // canonical order must be a subsequence of CANONICAL_ORDER with no
  // out-of-order phases.
  let canonicalIdx = 0;
  for (const phase of phases) {
    while (
      canonicalIdx < CANONICAL_ORDER.length &&
      CANONICAL_ORDER[canonicalIdx] !== phase
    ) {
      canonicalIdx++;
    }
    if (canonicalIdx >= CANONICAL_ORDER.length) return false;
  }
  return true;
}

export const guardOrderingCheck: ConformanceCheck = {
  id: "AC-005",
  name: "Kernel evaluates phases in canonical order: state → taint → auth → business",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    _options: ConformanceOptions,
  ): ConformanceResult {
    if (pack.intents.length === 0) {
      return {
        id: guardOrderingCheck.id,
        name: guardOrderingCheck.name,
        passed: true,
        details: "Pack declares no intents — invariant vacuously holds.",
      };
    }

    const failures: string[] = [];
    const emptyState = emptyStateFor(pack);

    // Property 1: phases recorded in the trace are a subsequence of the
    // canonical order. SYSTEM-taint envelope on every kind so the taint
    // gate always passes — letting the trace explore deeper phases.
    for (const kind of pack.intents) {
      const envelope = buildEnvelope({
        kind: kind as string,
        payload: { __conformanceProbe: true } as P,
        actor: { principal: "system", sessionId: "conformance" },
        taint: "SYSTEM",
        nonce: "ac-005-canonical",
        createdAt: "2026-05-18T12:00:00.000Z",
      }) as IntentEnvelope<K, P>;
      const { trace } = adjudicateWithTrace(envelope, emptyState, pack.policy);
      const phases = trace.map((e) => e.phase);
      if (!phaseOrderIsCanonical(phases)) {
        failures.push(
          `kind="${String(kind)}" trace phases out of order: ${phases.join("→")}`,
        );
      }
    }

    // Property 2: T8 reorder guarantee. For every taint-protected kind,
    // an UNTRUSTED envelope MUST NOT cause an auth guard to be invoked
    // before the taint gate. Stronger framing than "must short-circuit
    // at taint" — state guards may legitimately refuse first. The
    // property is `auth-phase-index > taint-phase-index` (when both
    // present), and `taint match → auth absent`.
    for (const kind of pack.intents) {
      if (canPropose("UNTRUSTED", kind, pack.policy.taint)) continue; // not protected
      const envelope = buildEnvelope({
        kind: kind as string,
        payload: { __conformanceProbe: true } as P,
        actor: { principal: "llm", sessionId: "conformance" },
        taint: "UNTRUSTED",
        nonce: "ac-005-t8",
        createdAt: "2026-05-18T12:00:00.000Z",
      }) as IntentEnvelope<K, P>;
      const { trace } = adjudicateWithTrace(envelope, emptyState, pack.policy);
      const taintIdx = trace.findIndex((e) => e.phase === "taint");
      const authIdx = trace.findIndex((e) => e.phase === "auth");
      const taintMatched =
        taintIdx >= 0 && trace[taintIdx]!.outcome === "match";

      // If neither taint nor auth ran (e.g., state guard short-circuited),
      // the T8 property is vacuously preserved — no auth ran on an
      // UNTRUSTED envelope.
      if (taintIdx < 0 && authIdx < 0) continue;

      if (authIdx >= 0 && taintIdx >= 0 && authIdx <= taintIdx) {
        failures.push(
          `kind="${String(kind)}" UNTRUSTED envelope: auth entry at index ${authIdx} appears at or before taint entry at index ${taintIdx} (T8 violation)`,
        );
        continue;
      }
      if (taintMatched && authIdx >= 0) {
        failures.push(
          `kind="${String(kind)}" UNTRUSTED envelope reached auth phase despite taint phase matching (T8 violation)`,
        );
      }
    }

    if (failures.length > 0) {
      return {
        id: guardOrderingCheck.id,
        name: guardOrderingCheck.name,
        passed: false,
        details: `Guard ordering violated: ${failures.join("; ")}`,
      };
    }
    return {
      id: guardOrderingCheck.id,
      name: guardOrderingCheck.name,
      passed: true,
      details: `Verified canonical phase order across ${pack.intents.length} intent kind(s).`,
    };
  },
};
