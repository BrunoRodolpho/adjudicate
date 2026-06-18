/**
 * pack-deployments-approval scenarios.
 *
 * Pins one scenario per Decision kind so the Pack stays a working
 * lighthouse for the six-outcome algebra. If a guard rewrite changes
 * outcomes here, the change is intentional or the test breaks.
 */

import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope } from "@adjudicate/core";
import {
  approvalKey,
  deploymentPolicyBundle,
  type DeploymentApproval,
  type DeploymentState,
} from "../src/index.js";

const ctx = { requesterId: "alice@example" };

function emptyState(): DeploymentState {
  return { approvals: new Map() };
}

function envRequest(
  service: string,
  environment: "staging" | "production",
  gitSha: string,
  rampPercent?: number,
) {
  return buildEnvelope({
    kind: "deployment.approval.request",
    payload: {
      service,
      environment,
      gitSha,
      ...(rampPercent !== undefined ? { rampPercent } : {}),
    },
    actor: { principal: "user", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: `n-${service}-${environment}-${gitSha}`,
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

function envRollback(
  service: string,
  environment: "staging" | "production",
  toGitSha: string,
) {
  return buildEnvelope({
    kind: "deployment.rollback.execute",
    payload: {
      service,
      environment,
      toGitSha,
    },
    actor: { principal: "user", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: `n-rollback-${service}-${environment}-${toGitSha}`,
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

void ctx;

describe("pack-deployments-approval — Decision algebra coverage", () => {
  it("EXECUTE: staging deploy at default ramp", () => {
    const decision = adjudicate(
      envRequest("api", "staging", "deadbeefdeadbeef", 25),
      emptyState(),
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("REFUSE: invalid environment", () => {
    const env = buildEnvelope({
      kind: "deployment.approval.request",
      payload: {
        service: "api",
        environment: "mars" as unknown as "staging",
        gitSha: "deadbeef",
      },
      actor: { principal: "user", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-invalid-env",
      createdAt: "2026-05-13T12:00:00.000Z",
    });
    const decision = adjudicate(env, emptyState(), deploymentPolicyBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("deployment.environment_invalid");
  });

  it("REWRITE: production ramp clamped to MAX_PRODUCTION_RAMP_PERCENT", () => {
    const decision = adjudicate(
      envRequest("api", "production", "feedfacefeedface", 100),
      emptyState(),
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("REWRITE");
    if (decision.kind !== "REWRITE") return;
    const newPayload = decision.rewritten.payload as { rampPercent: number };
    expect(newPayload.rampPercent).toBe(25);
  });

  it("DEFER: staging high-ramp deploy waits on CI signal", () => {
    const decision = adjudicate(
      envRequest("api", "staging", "feedfacefeedface", 100),
      emptyState(),
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("DEFER");
    if (decision.kind !== "DEFER") return;
    expect(decision.signal).toBe("ci.green");
  });

  it("ESCALATE: production deploy without prior approval", () => {
    const decision = adjudicate(
      envRequest("api", "production", "feedfacefeedface", 10),
      emptyState(),
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("ESCALATE");
    if (decision.kind !== "ESCALATE") return;
    expect(decision.to).toBe("human");
  });

  it("EXECUTE: production deploy with approval present", () => {
    const approval: DeploymentApproval = {
      service: "api",
      environment: "production",
      gitSha: "feedfacefeedface",
      approver: "bob@example",
      decision: "approved",
      at: "2026-05-13T11:59:00.000Z",
    };
    const state: DeploymentState = {
      approvals: new Map([
        [approvalKey(approval.service, approval.environment, approval.gitSha), approval],
      ]),
    };
    const decision = adjudicate(
      envRequest("api", "production", "feedfacefeedface", 10),
      state,
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("REFUSE: production deploy whose approval was rejected", () => {
    const approval: DeploymentApproval = {
      service: "api",
      environment: "production",
      gitSha: "feedfacefeedface",
      approver: "bob@example",
      decision: "rejected",
      at: "2026-05-13T11:59:00.000Z",
    };
    const state: DeploymentState = {
      approvals: new Map([
        [approvalKey(approval.service, approval.environment, approval.gitSha), approval],
      ]),
    };
    const decision = adjudicate(
      envRequest("api", "production", "feedfacefeedface", 10),
      state,
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("deployment.approval_rejected");
  });

  it("REQUEST_CONFIRMATION: production rollback without confirmation token", () => {
    const decision = adjudicate(
      envRollback("api", "production", "deadbeefdeadbeef"),
      emptyState(),
      deploymentPolicyBundle,
    );
    expect(decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  // Plan 014: a model-supplied confirmation token can no longer self-confirm a
  // rollback into EXECUTE. A production rollback always REQUEST_CONFIRMATIONs; the
  // EXECUTE transition is owned solely by the kernel's intentHash-bound receipt
  // path. Putting a stray `confirmationToken` on the payload has no effect.
  it("REQUEST_CONFIRMATION: a model-supplied confirmation token never self-confirms a rollback", () => {
    const env = buildEnvelope({
      kind: "deployment.rollback.execute",
      payload: {
        service: "api",
        environment: "production",
        toGitSha: "deadbeefdeadbeef",
        // A token the proposer minted itself — must NOT lower friction to EXECUTE.
        confirmationToken: "tok-confirmed",
      },
      actor: { principal: "user", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-rollback-self-confirm",
      createdAt: "2026-05-13T12:00:00.000Z",
    });
    const decision = adjudicate(env, emptyState(), deploymentPolicyBundle);
    expect(decision.kind).toBe("REQUEST_CONFIRMATION");
  });
});
