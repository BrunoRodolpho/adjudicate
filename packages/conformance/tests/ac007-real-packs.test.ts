/**
 * AC-007 against the REAL plan-201 packs — §D #8 owner-predicate wiring.
 *
 * Plan 201 closed the tracked 035-F1 gap: `pack-cli-agent`, `pack-identity-kyc`,
 * and `pack-incident-response` previously shipped mutating UNTRUSTED-min kinds
 * with `authGuards: []`, so AC-007 FAILED on them. 201 wired
 * `createAuthorityGuard` into each pack's `authGuards`. These tests pin that
 * close:
 *
 *   - each pack now PASSES AC-007 (an owner predicate gates its mutating
 *     UNTRUSTED-min kind(s)), AND
 *   - a "if the wiring is reverted → AC-007 fails" backstop (empty the
 *     `authGuards`) so a future regression that drops the guard reddens this
 *     suite, not just the canary baseline (the stronger-backstop lesson, 014-F1).
 *
 * AC-007 is STATIC/structural (no `adjudicate()`, no PRNG, no clock), so these
 * assertions are deterministic.
 */
import { describe, expect, it } from "vitest";
import type { PackV0, PolicyBundle } from "@adjudicate/core";
import { cliAgentPack } from "@adjudicate/pack-cli-agent";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";
import { incidentResponsePack } from "@adjudicate/pack-incident-response";
import { untrustedMutatingNeedsOwnerCheck } from "../src/index.js";

type AnyPack = PackV0<string, unknown, unknown, unknown>;

const PACKS: ReadonlyArray<{
  readonly name: string;
  readonly pack: AnyPack;
  readonly gatedKinds: ReadonlyArray<string>;
}> = [
  {
    name: "pack-cli-agent",
    pack: cliAgentPack as unknown as AnyPack,
    gatedKinds: ["terminal.run"],
  },
  {
    name: "pack-identity-kyc",
    pack: IdentityKycPack as unknown as AnyPack,
    gatedKinds: ["kyc.start", "kyc.document.upload"],
  },
  {
    name: "pack-incident-response",
    pack: incidentResponsePack as unknown as AnyPack,
    gatedKinds: ["incident.remediation.execute", "incident.escalate"],
  },
];

describe("AC-007 against real plan-201 packs (§D #8 owner predicate)", () => {
  for (const { name, pack, gatedKinds } of PACKS) {
    it(`${name} PASSES AC-007 — its mutating UNTRUSTED-min kinds carry an owner predicate`, () => {
      const result = untrustedMutatingNeedsOwnerCheck.run(pack, {});
      expect(result.passed).toBe(true);
      expect(result.id).toBe("AC-007");
      // Non-vacuous: the pass message reports it VERIFIED a predicate over real
      // mutating UNTRUSTED-min kinds (not the "no candidate / vacuously holds" arm).
      expect(result.details).toMatch(/Verified an owner predicate/);
    });

    it(`${name} REGRESSION BACKSTOP — emptying authGuards re-opens the AC-007 violation`, () => {
      // Prove the wiring is load-bearing: with authGuards: [] the SAME pack fails
      // AC-007 and the offending kinds are named. If a future change drops the
      // guard, this assertion (and the real pack's test above) goes red.
      const reverted: AnyPack = {
        ...pack,
        policy: {
          ...(pack.policy as PolicyBundle<string, unknown, unknown>),
          authGuards: [],
        },
      };
      const result = untrustedMutatingNeedsOwnerCheck.run(reverted, {});
      expect(result.passed).toBe(false);
      for (const kind of gatedKinds) {
        expect(result.details).toContain(kind);
      }
    });
  }
});
