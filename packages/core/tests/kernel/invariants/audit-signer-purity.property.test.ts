/**
 * Invariant (092 / §D replayability + §7 pre-image exclusion):
 *
 *   Attaching a `signer` to the audit build path must NOT perturb the pure
 *   decision OR the tamper-evident `auditHash`. The signature is computed AFTER
 *   the hash and is EXCLUDED from the pre-image, so a signed record and an
 *   otherwise-identical unsigned record MUST share a byte-identical `auditHash`
 *   (and decision), and the signed record MUST still re-run the pure kernel to
 *   the SAME decision (replayability).
 *
 * If this ever fails, signing has leaked into the pre-image — a production
 * regression that would FALSE-tamper every signed record on verify-on-read.
 *
 * Property strategy: fuzz (taint × default × payload shape); for each, build a
 * signed and an unsigned AuditRecord over the same envelope/decision/clock and
 * assert auditHash + decision are bit-identical, the signed record verifies, and
 * a forged signature flips verify to invalid_signature.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  adjudicate,
  buildAuditRecord,
  buildEnvelope,
  hashBindAuditSigner,
  verifyAuditRecord,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defaultArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function bundleFor(def: "REFUSE" | "EXECUTE"): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business: [],
    default: def,
  };
}

function env(
  taint: Taint,
  nonce: string,
  payload: Record<string, unknown>,
): IntentEnvelope {
  return buildEnvelope({
    kind: "inv.signer",
    payload,
    actor: { principal: "llm", sessionId: "s-inv" },
    taint,
    nonce,
    createdAt: "2026-06-18T00:00:00.000Z",
  }) as IntentEnvelope;
}

describe("092 invariant — signing is pure-decision- and auditHash-neutral", () => {
  it("a signed record shares the auditHash + decision of its unsigned twin", () => {
    fc.assert(
      fc.property(
        taintArb,
        defaultArb,
        fc.string({ minLength: 1, maxLength: 8 }),
        jsonSafePayloadArb,
        (taint, def, nonce, payload) => {
          const e = env(taint, nonce, payload);
          const bundle = bundleFor(def);
          const decision = adjudicate(e, {}, bundle);

          const common = {
            envelope: e,
            decision,
            durationMs: 7,
            at: "2026-06-18T00:00:01.000Z",
          } as const;

          const unsigned = buildAuditRecord({ ...common });
          const signed = buildAuditRecord({
            ...common,
            signer: hashBindAuditSigner("kms://inv-key"),
          });

          // Pre-image exclusion: signing must not move the hash or the decision.
          expect(signed.auditHash).toBe(unsigned.auditHash);
          expect(signed.decision).toEqual(unsigned.decision);
          expect(unsigned.signature).toBeUndefined();
          expect(signed.signature).toBeDefined();

          // The signed record verifies on BOTH axes …
          expect(verifyAuditRecord(signed).verified).toBe(true);

          // … and a forged signature (hash intact) flips to invalid_signature,
          // proving the signature axis is genuinely exercised, not vacuous.
          const forged = {
            ...signed,
            signature: { ...signed.signature!, value: "f".repeat(64) },
          };
          const v = verifyAuditRecord(forged);
          expect(v.verified).toBe(false);
          if (v.verified === false) expect(v.reason).toBe("invalid_signature");

          // Replayability (§D-5): re-running the pure kernel over the recorded
          // envelope reproduces the SAME decision regardless of signing.
          const replayed = adjudicate(signed.envelope, {}, bundle);
          expect(replayed.kind).toBe(decision.kind);
        },
      ),
      { numRuns: 500 },
    );
  });
});
