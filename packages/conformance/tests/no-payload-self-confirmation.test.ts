/**
 * AC-007 — payload self-confirmation check (plan 014).
 *
 * Non-vacuity is proven by a POSITIVE and a NEGATIVE fixture:
 *
 *   - POSITIVE: a Pack whose business guard EXECUTEs whenever a truthy
 *     `confirmationToken` rides on the payload — the exact deleted
 *     `executeConfirmedRevoke` / `allowConfirmedRollback` bypass — MUST fail.
 *   - NEGATIVE: a clean Pack (no payload field flips a decision to EXECUTE),
 *     and the lighthouse PIX Pack, MUST pass.
 *
 * The check is behavioral (PackV0 carries no runtime payload schema), so the
 * fixtures wire real guards rather than declaring a schema.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  refuse,
  type PackV0,
  type TaintPolicy,
} from "@adjudicate/core";
import type { PolicyBundle } from "@adjudicate/core/kernel";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import { noPayloadSelfConfirmationCheck, runConformance } from "../src/index.js";

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const options = { seed: 42, sampling: 20 };

/**
 * POSITIVE fixture — a Pack that self-confirms: it EXECUTEs an otherwise-REFUSED
 * intent the moment the model puts a truthy `confirmationToken` on the payload.
 * This is the friction-lowering bypass AC-007 must catch.
 */
function makeSelfConfirmingPack(): PackV0<"thing.delete", unknown, unknown, unknown> {
  const selfConfirm = (envelope: { payload: unknown }) => {
    const p = envelope.payload as { confirmationToken?: unknown };
    return p.confirmationToken
      ? decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])
      : null;
  };
  const policy: PolicyBundle<"thing.delete", unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [selfConfirm],
    default: "REFUSE",
  };
  return {
    id: "pack-self-confirming",
    version: "0.1.0",
    contract: "v0",
    intents: ["thing.delete"],
    policy,
    planner: { listAllowedTools: () => [], listAllowedKinds: () => [] },
    basisCodes: [],
  };
}

/**
 * NEGATIVE fixture — a clean Pack: no payload field can produce EXECUTE. It
 * always REFUSEs, so there is no self-confirmation differential.
 */
function makeCleanPack(): PackV0<"thing.delete", unknown, unknown, unknown> {
  const alwaysRefuse = () =>
    decisionRefuse(refuse("BUSINESS_RULE", "denied", "Always refused."), [
      basis("business", BASIS_CODES.business.RULE_VIOLATED),
    ]);
  const policy: PolicyBundle<"thing.delete", unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [alwaysRefuse],
    default: "REFUSE",
  };
  return {
    id: "pack-clean",
    version: "0.1.0",
    contract: "v0",
    intents: ["thing.delete"],
    policy,
    planner: { listAllowedTools: () => [], listAllowedKinds: () => [] },
    basisCodes: [],
  };
}

describe("AC-007 payload self-confirmation check", () => {
  it("POSITIVE: a Pack that EXECUTEs on a truthy confirmationToken FAILS the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeSelfConfirmingPack(), options);
    expect(result.id).toBe("AC-007");
    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/self-confirmation field "confirmationToken"/);
    expect(result.details).toMatch(/EXECUTEs/);
  });

  it("NEGATIVE: a clean Pack (no self-confirm differential) PASSES the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeCleanPack(), options);
    expect(result.passed).toBe(true);
  });

  it("NEGATIVE: the lighthouse PIX Pack PASSES the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(paymentsPixPack, options);
    expect(result.passed).toBe(true);
  });

  it("the self-confirming Pack also fails the full default suite via runConformance", () => {
    const report = runConformance(makeSelfConfirmingPack(), { allowDefaultExecute: false, sampling: 20 });
    expect(report.passed).toBe(false);
    const ac007 = report.results.find((r) => r.id === "AC-007");
    expect(ac007?.passed).toBe(false);
  });

  it("is deterministic — two runs of the same fixture produce identical results", () => {
    const a = noPayloadSelfConfirmationCheck.run(makeSelfConfirmingPack(), options);
    const b = noPayloadSelfConfirmationCheck.run(makeSelfConfirmingPack(), options);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
