/**
 * AC-008 against the REAL plan-014 packs — non-vacuity on production guards.
 *
 * These are the packs whose self-confirm bypasses plan 014 DELETED
 * (`executeConfirmedRevoke` in access-governance, `allowConfirmedRollback` in
 * deployments-approval). Both bypasses sat in the BUSINESS stage behind STATE
 * guards that REFUSE a domain-incomplete payload/state:
 *
 *   - `deployment.rollback.execute` — `refuseEmptyGitSha` needs `toGitSha`
 *     (a payload field). A valid payload sample reaches business.
 *   - `access.revoke` — `requireActiveGrantForRevoke` needs an active grant in
 *     STATE (`state.grants`). A valid payload + state sample reaches business.
 *
 * Each test feeds AC-008 the domain-valid baseline so the probe REACHES
 * business (proven by the absence of a NOT-EXERCISED note for that kind) and
 * asserts the pack PASSES — i.e. no payload field self-confirms an EXECUTE.
 * If the deleted bypass were ever reintroduced, the baseline→variant
 * differential would flip to EXECUTE and AC-008 would fail. This is the
 * non-vacuous regression backstop for the deletion.
 */

import { describe, expect, it } from "vitest";
import { accessGovernancePack } from "@adjudicate/pack-access-governance";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { noPayloadSelfConfirmationCheck } from "../src/index.js";

describe("AC-008 against real plan-014 packs", () => {
  it("deployment.rollback.execute is EXERCISED and does NOT self-confirm", () => {
    const result = noPayloadSelfConfirmationCheck.run(deploymentsApprovalPack, {
      seed: 42,
      sampling: 20,
      validPayloadSamples: {
        "deployment.rollback.execute": {
          service: "api",
          environment: "production",
          toGitSha: "deadbeefdeadbeef",
        },
      },
    });
    expect(result.passed).toBe(true);
    // Non-vacuous: the rollback kind reached the business stage and was probed.
    expect(result.details).not.toMatch(/deployment\.rollback\.execute/);
    expect(result.details).toMatch(/business-reaching intent kind/);
  });

  it("access.revoke is EXERCISED and does NOT self-confirm", () => {
    const result = noPayloadSelfConfirmationCheck.run(accessGovernancePack, {
      seed: 42,
      sampling: 20,
      validPayloadSamples: {
        // db.prod is a KNOWN_RESOURCE_ID; principal matches the grant key below.
        "access.revoke": { resourceId: "db.prod", principal: "alice" },
      },
      validStateSamples: {
        // An active grant keyed `db.prod::alice` with no expiresAt (never
        // expires), so `requireActiveGrantForRevoke` + `refuseExpiredGrant`
        // pass and the revoke reaches the business stage (confirmRevoke).
        "access.revoke": {
          reviews: {},
          grants: {
            "db.prod::alice": { principal: "alice", resourceId: "db.prod", privilegeLevel: 1 },
          },
        },
      },
    });
    expect(result.passed).toBe(true);
    // Non-vacuous: access.revoke reached business and was probed (no gap note).
    expect(result.details).not.toMatch(/access\.revoke/);
    expect(result.details).toMatch(/business-reaching intent kind/);
  });
});
