/**
 * AC-003 — `buildEnvelope()` produces a deterministic `intentHash`.
 *
 * Two envelopes constructed with the same `(version, kind, payload,
 * nonce, actor, taint)` MUST produce the same hash regardless of
 * `createdAt`. This is the v2 hash-stability contract (T8) — adopters
 * who rebuild envelopes on retry rely on it for ledger dedup.
 *
 * Mirrors `packages/core/tests/kernel/invariants/v2-hash-stability.property.test.ts`
 * but exercises the Pack's own intent kinds. Two assertions per sample:
 *
 *   1. Same inputs (including nonce) → same hash, even with different
 *      `createdAt`.
 *   2. Different `nonce` → different hash (else dedup is silently broken).
 *
 * The harness does NOT depend on the Pack's policy here — `buildEnvelope`
 * is a framework function. Iterating per-kind documents which kinds the
 * Pack actually exercises, and confirms the framework's hash function
 * is reachable for each declared kind. A failure here would indicate a
 * core regression, not a Pack regression — but reporting it from the
 * Pack's harness still lets adopters catch a corrupted framework
 * install before it bites in production.
 */

import { buildEnvelope } from "@adjudicate/core";
import type { PackV0, Taint } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, lcg, pick } from "../prng.js";

const TAINT_OPTIONS: ReadonlyArray<Taint> = ["SYSTEM", "TRUSTED", "UNTRUSTED"];

export const intentHashDeterministicCheck: ConformanceCheck = {
  id: "AC-003",
  name: "buildEnvelope() produces a deterministic intentHash (v2 hash stability)",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);

    const failures: string[] = [];
    let attempted = 0;

    for (const kind of pack.intents) {
      for (let i = 0; i < sampling; i++) {
        attempted++;
        const taint = pick(rng, TAINT_OPTIONS);
        const nonce = deterministicNonce(rng);
        const payload = { __conformanceProbe: true, seed: rng() } as P;
        const actor = { principal: "llm" as const, sessionId: "conformance" };

        // Property 1: same inputs + different createdAt → same hash.
        const envA = buildEnvelope({
          kind: kind as string,
          payload,
          actor,
          taint,
          nonce,
          createdAt: "2026-04-01T10:00:00.000Z",
        });
        const envB = buildEnvelope({
          kind: kind as string,
          payload,
          actor,
          taint,
          nonce,
          createdAt: "2026-12-31T23:59:59.999Z",
        });
        if (envA.intentHash !== envB.intentHash) {
          failures.push(
            `kind="${String(kind)}" intentHash differs across createdAt (nonce=${nonce}): ${envA.intentHash} vs ${envB.intentHash}`,
          );
          break;
        }

        // Property 2: different nonce → different hash.
        const otherNonce = deterministicNonce(rng);
        if (otherNonce === nonce) continue; // skip on unlikely collision
        const envC = buildEnvelope({
          kind: kind as string,
          payload,
          actor,
          taint,
          nonce: otherNonce,
          createdAt: "2026-04-01T10:00:00.000Z",
        });
        if (envC.intentHash === envA.intentHash) {
          failures.push(
            `kind="${String(kind)}" same intentHash across different nonces (${nonce} vs ${otherNonce})`,
          );
          break;
        }
      }
    }

    if (failures.length > 0) {
      return {
        id: intentHashDeterministicCheck.id,
        name: intentHashDeterministicCheck.name,
        passed: false,
        details: `Hash determinism violated: ${failures.join("; ")}`,
      };
    }
    return {
      id: intentHashDeterministicCheck.id,
      name: intentHashDeterministicCheck.name,
      passed: true,
      details: `Verified ${attempted} envelope-hash samples across ${pack.intents.length} intent kind(s).`,
    };
  },
};
