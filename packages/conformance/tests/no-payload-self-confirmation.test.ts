/**
 * AC-008 — payload self-confirmation check (plan 014).
 *
 * Non-vacuity is proven by POSITIVE and NEGATIVE fixtures, including the
 * load-bearing "behind a state guard" regression:
 *
 *   - POSITIVE (no state guard): a Pack whose business guard EXECUTEs whenever
 *     a truthy `confirmationToken` rides on the payload MUST fail.
 *   - POSITIVE (behind a state guard requiring a domain field): the SAME
 *     bypass, but gated behind a state guard that REFUSEs a payload missing a
 *     required domain field — the exact shape the deleted
 *     `executeConfirmedRevoke` / `allowConfirmedRollback` had. With a
 *     domain-valid baseline supplied via `validPayloadSamples`, AC-008 reaches
 *     the business stage and MUST fail. (Without the fix it passed vacuously.)
 *   - NEGATIVE: a clean Pack (no payload field flips a decision to EXECUTE) and
 *     the lighthouse PIX Pack MUST pass.
 *   - NOT-EXERCISED: a state-gated Pack with NO `validPayloadSamples` is
 *     reported as a coverage gap, never a silent clean pass.
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

const baseOptions = { seed: 42, sampling: 20 };

/**
 * POSITIVE fixture (no state guard) — a Pack that self-confirms: it EXECUTEs an
 * otherwise-REFUSED intent the moment the model puts a truthy
 * `confirmationToken` on the payload. The bypass sits in the business stage
 * with no state guard ahead of it, so the empty-payload baseline reaches
 * business directly.
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
 * POSITIVE fixture (behind a state guard) — the MAJOR-2 regression. The same
 * self-confirm bypass, but a STATE guard ahead of it REFUSEs any payload
 * missing the required `resourceId` domain field. A synthetic probe payload is
 * REFUSED at the state stage; only a domain-valid baseline reaches business.
 * This is the exact gating shape the deleted bypasses had
 * (`requireActiveGrantForRevoke`, `refuseEmptyGitSha`).
 */
function makeBehindStateGuardPack(): PackV0<"thing.delete", unknown, unknown, unknown> {
  const requireResourceId = (envelope: { payload: unknown }) => {
    const p = envelope.payload as { resourceId?: string };
    return p.resourceId
      ? null
      : decisionRefuse(refuse("STATE", "missing_resource", "resourceId required."), [
          basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
        ]);
  };
  const selfConfirm = (envelope: { payload: unknown }) => {
    const p = envelope.payload as { confirmationToken?: unknown };
    return p.confirmationToken
      ? decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])
      : null;
  };
  const policy: PolicyBundle<"thing.delete", unknown, unknown> = {
    stateGuards: [requireResourceId],
    authGuards: [],
    taint: permissiveTaint,
    business: [selfConfirm],
    default: "REFUSE",
  };
  return {
    id: "pack-behind-state-guard",
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
 * always REFUSEs in the business stage (after reaching it), so there is no
 * self-confirmation differential.
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

describe("AC-008 payload self-confirmation check", () => {
  it("has id AC-008 (AC-007 is reserved for plan 035)", () => {
    expect(noPayloadSelfConfirmationCheck.id).toBe("AC-008");
  });

  it("POSITIVE: a Pack that EXECUTEs on a truthy confirmationToken FAILS the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeSelfConfirmingPack(), baseOptions);
    expect(result.id).toBe("AC-008");
    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/self-confirmation field "confirmationToken"/);
    expect(result.details).toMatch(/EXECUTEs/);
  });

  // ── MAJOR-2 acceptance bar ────────────────────────────────────────────────
  it("POSITIVE (regression): a self-confirm bypass BEHIND a state guard FAILS when a domain-valid baseline is supplied", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeBehindStateGuardPack(), {
      ...baseOptions,
      // Domain-valid baseline that passes the `requireResourceId` state guard
      // and reaches the business stage where the self-confirm guard lives.
      validPayloadSamples: { "thing.delete": { resourceId: "r1" } },
    });
    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/self-confirmation field "confirmationToken"/);
    expect(result.details).toMatch(/domain-valid baseline/);
  });

  it("NOT-EXERCISED: the state-gated Pack with no validPayloadSamples is a surfaced coverage gap, not a silent pass", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeBehindStateGuardPack(), baseOptions);
    // No business-reaching baseline → cannot prove a bypass, but the gap is
    // reported explicitly rather than masquerading as verified coverage.
    expect(result.passed).toBe(true);
    expect(result.details).toMatch(/NOT EXERCISED/);
    expect(result.details).toMatch(/thing\.delete/);
  });

  it("NEGATIVE: a clean Pack (no self-confirm differential) PASSES the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(makeCleanPack(), baseOptions);
    expect(result.passed).toBe(true);
    expect(result.details).not.toMatch(/bypass/);
  });

  it("NEGATIVE: the lighthouse PIX Pack PASSES the check", () => {
    const result = noPayloadSelfConfirmationCheck.run(paymentsPixPack, baseOptions);
    expect(result.passed).toBe(true);
  });

  it("the self-confirming Pack also fails the full default suite via runConformance", () => {
    const report = runConformance(makeSelfConfirmingPack(), { allowDefaultExecute: false, sampling: 20 });
    expect(report.passed).toBe(false);
    const ac008 = report.results.find((r) => r.id === "AC-008");
    expect(ac008?.passed).toBe(false);
  });

  it("is deterministic — two runs of the same fixture produce identical results", () => {
    const opts = { ...baseOptions, validPayloadSamples: { "thing.delete": { resourceId: "r1" } } };
    const a = noPayloadSelfConfirmationCheck.run(makeBehindStateGuardPack(), opts);
    const b = noPayloadSelfConfirmationCheck.run(makeBehindStateGuardPack(), opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
