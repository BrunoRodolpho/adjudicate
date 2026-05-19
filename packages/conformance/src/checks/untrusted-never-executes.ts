/**
 * AC-001 — UNTRUSTED inputs never yield EXECUTE for taint-protected intents.
 *
 * This is the load-bearing zero-trust property: for every intent kind the
 * Pack declares where `policy.taint.minimumFor(kind)` requires `TRUSTED`
 * or `SYSTEM`, no UNTRUSTED-tainted envelope may produce an EXECUTE
 * Decision. If this check fails once, the Pack has a path by which
 * user-origin content escalates authority.
 *
 * Mirrors `packages/core/tests/kernel/invariants/untrusted-never-executes.property.test.ts`
 * but exercises the Pack's own `policy.taint` and `policy` rather than
 * a synthetic high-trust policy. Sampling is via the seeded LCG —
 * `Math.random()` is banned.
 *
 * **Methodology.** For each intent kind in `pack.intents` whose
 * `minimumFor()` requires TRUSTED or SYSTEM, generate `sampling`
 * UNTRUSTED-tainted envelopes (deterministic payload + nonce + timestamp)
 * and assert `adjudicate(env, {}, policy).kind !== "EXECUTE"`. Empty
 * state is intentional — the taint gate runs before state guards under
 * the T8 reorder, so an UNTRUSTED envelope can never reach business
 * guards regardless of state shape.
 */

import { buildEnvelope, canPropose } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg } from "../prng.js";
import { emptyStateFor } from "../state.js";

export const untrustedNeverExecutesCheck: ConformanceCheck = {
  id: "AC-001",
  name: "UNTRUSTED inputs never yield EXECUTE for taint-protected intents",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);

    // Find every kind whose taint policy demands TRUSTED or SYSTEM —
    // those are the kinds where an UNTRUSTED EXECUTE would be a leak.
    const protectedKinds: K[] = [];
    for (const kind of pack.intents) {
      // canPropose returns false when an UNTRUSTED envelope is below the
      // minimum. We probe with UNTRUSTED — if the policy refuses it, the
      // kind is taint-protected.
      if (!canPropose("UNTRUSTED", kind, pack.policy.taint)) {
        protectedKinds.push(kind);
      }
    }

    if (protectedKinds.length === 0) {
      return {
        id: untrustedNeverExecutesCheck.id,
        name: untrustedNeverExecutesCheck.name,
        passed: true,
        details: `No taint-protected intent kinds declared — invariant vacuously holds.`,
      };
    }

    const failures: string[] = [];
    let attempted = 0;
    const emptyState = emptyStateFor(pack);

    for (const kind of protectedKinds) {
      for (let i = 0; i < sampling; i++) {
        attempted++;
        // Cast: `buildEnvelope` returns `IntentEnvelope<string, P>` when
        // the kind input is widened to `string`. We restore the Pack's
        // narrower `K` so the envelope re-enters the kernel's typed API.
        const envelope = buildEnvelope({
          kind: kind as string,
          payload: { __conformanceProbe: true, seed: rng() } as P,
          actor: { principal: "llm", sessionId: "conformance" },
          taint: "UNTRUSTED",
          nonce: deterministicNonce(rng),
          createdAt: deterministicTimestamp(rng),
        }) as IntentEnvelope<K, P>;
        // The taint gate runs ahead of auth guards (T8) but AFTER state
        // guards — so a state guard with a stricter precondition could
        // legitimately refuse before the taint gate fires. Either way
        // the outcome is "not EXECUTE", which is what this invariant
        // tests. Empty state comes from the Pack's own `rehydrateState`
        // when available (so its guards see the shape they expect).
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
        if (decision.kind === "EXECUTE") {
          failures.push(
            `kind="${String(kind)}" with UNTRUSTED taint produced EXECUTE (nonce=${envelope.nonce})`,
          );
          // First failure per kind is enough; keep walking other kinds.
          break;
        }
      }
    }

    if (failures.length > 0) {
      return {
        id: untrustedNeverExecutesCheck.id,
        name: untrustedNeverExecutesCheck.name,
        passed: false,
        details: `Taint protection violated for ${failures.length} intent kind(s): ${failures.join("; ")}`,
      };
    }
    return {
      id: untrustedNeverExecutesCheck.id,
      name: untrustedNeverExecutesCheck.name,
      passed: true,
      details: `Verified ${attempted} UNTRUSTED envelopes across ${protectedKinds.length} taint-protected kind(s).`,
    };
  },
};
