/**
 * Release-gating extensions (Item 14): regression-score ESCALATE, carbon-budget
 * region REWRITE, model/prompt-change REQUEST_CONFIRMATION — plus precedence,
 * replay-determinism, and taint preservation.
 */
import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Decision, type Taint } from "@adjudicate/core";
import {
  deploymentPolicyBundle,
  GREENEST_REGION,
  greenestRegion,
  rehydrateDeploymentState,
  type DeploymentApproval,
} from "../src/index.js";

const at = "2026-06-06T12:00:00.000Z";

function run(payload: Record<string, unknown>, approvals: Record<string, DeploymentApproval> = {}, taint: Taint = "UNTRUSTED") {
  const env = buildEnvelope({
    kind: "deployment.approval.request",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: `n-${Math.random()}`,
    createdAt: at,
  });
  return adjudicate(env, rehydrateDeploymentState({ approvals }), deploymentPolicyBundle);
}

describe("release gates", () => {
  it("greenestRegion is the lowest-rank region", () => {
    expect(greenestRegion()).toBe(GREENEST_REGION);
    expect(GREENEST_REGION).toBe("us-west-1");
  });

  it("ESCALATE when aiEvalScore is below the threshold", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", aiEvalScore: 70, rampPercent: 10 });
    expect(d.kind).toBe("ESCALATE");
    if (d.kind === "ESCALATE") expect(d.to).toBe("human");
  });

  it("score at/above threshold does NOT escalate (comparator boundary)", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", aiEvalScore: 80, rampPercent: 10 });
    expect(d.kind).not.toBe("ESCALATE");
  });

  it("REWRITE clamps a dirty region to the greenest (taint preserved)", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", region: "us-east-1", rampPercent: 10 });
    expect(d.kind).toBe("REWRITE");
    if (d.kind === "REWRITE") {
      expect((d.rewritten.payload as { region: string }).region).toBe(GREENEST_REGION);
      expect(d.rewritten.taint).toBe("UNTRUSTED");
    }
  });

  it("greenest region is a no-op (no REWRITE)", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", region: GREENEST_REGION, rampPercent: 10 });
    expect(d.kind).not.toBe("REWRITE");
  });

  it("carbon clamp NEVER crosses a residency zone (EU stays EU — GDPR)", () => {
    // eu-west-1 (rank 2) → greenest EU is eu-north-1 (rank 1), NOT us-west-1 (rank 0).
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", region: "eu-west-1", rampPercent: 10 });
    expect(d.kind).toBe("REWRITE");
    if (d.kind === "REWRITE") {
      expect((d.rewritten.payload as { region: string }).region).toBe("eu-north-1");
    }
  });

  it("a region already greenest in its zone is a no-op (eu-north-1)", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", region: "eu-north-1", rampPercent: 10 });
    expect(d.kind).not.toBe("REWRITE");
  });

  it("an unknown/unclassified region is left untouched (fail-safe, never relocated)", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", region: "moon-base-1", rampPercent: 10 });
    expect(d.kind).not.toBe("REWRITE");
  });

  it("REQUEST_CONFIRMATION when the bundled model differs from the last approved release", () => {
    const approvals = {
      "staging/api/old1234": {
        service: "api",
        environment: "staging" as const,
        gitSha: "old1234",
        approver: "bob",
        decision: "approved" as const,
        at: "2026-06-01T00:00:00.000Z",
        modelId: "m@1",
      },
    };
    const d = run({ service: "api", environment: "staging", gitSha: "new5678", modelId: "m@2", rampPercent: 10 }, approvals);
    expect(d.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("PRECEDENCE: low score + dirty region → ESCALATE (regression) wins over REWRITE", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", aiEvalScore: 70, region: "us-east-1", rampPercent: 10 });
    expect(d.kind).toBe("ESCALATE");
  });

  it("replay-determinism: same input → identical decision", () => {
    const flat = (d: Decision) => `${d.kind}|${d.basis.map((b) => `${b.category}:${b.code}`).sort().join(",")}`;
    const payload = { service: "api", environment: "staging", gitSha: "abc12345", region: "us-east-1", rampPercent: 10 };
    const env = buildEnvelope({ kind: "deployment.approval.request", payload, actor: { principal: "llm", sessionId: "s" }, taint: "UNTRUSTED", nonce: "fixed", createdAt: at });
    const state = rehydrateDeploymentState({ approvals: {} });
    expect(flat(adjudicate(env, state, deploymentPolicyBundle))).toBe(flat(adjudicate(env, state, deploymentPolicyBundle)));
  });
});

describe("regression-escalate signal — FROZEN escalate-only contract (101 §3)", () => {
  // The deployment regression-score guard is the on-path escalate-only signal:
  // a sub-threshold score escalates and is structurally NON-DOWNGRADABLE — the
  // kernel's first-non-null short-circuit means no later clamp/allow guard can
  // turn the ESCALATE into EXECUTE/REWRITE/REQUEST_CONFIRMATION (§C monotonicity).
  it("a sub-threshold score ESCALATEs even when a REWRITE (dirty region) is also present", () => {
    const d = run({ service: "api", environment: "staging", gitSha: "abc12345", aiEvalScore: 79, region: "us-east-1", rampPercent: 10 });
    expect(d.kind).toBe("ESCALATE"); // beats clampToGreenestRegion REWRITE
  });

  it("a sub-threshold score ESCALATEs even when a REQUEST_CONFIRMATION (model change) is also present", () => {
    const approvals = {
      "staging/api/old1234": {
        service: "api",
        environment: "staging" as const,
        gitSha: "old1234",
        approver: "bob",
        decision: "approved" as const,
        at: "2026-06-01T00:00:00.000Z",
        modelId: "m@1",
      },
    };
    // Both the regression-escalate AND the model-change-confirm guards would fire;
    // the escalate signal is ordered first, so the signal wins.
    const d = run({ service: "api", environment: "staging", gitSha: "new5678", modelId: "m@2", aiEvalScore: 50, rampPercent: 10 }, approvals);
    expect(d.kind).toBe("ESCALATE");
  });

  it("the signal escalates and never authorizes EXECUTE across the sub-threshold band", () => {
    // Sweep the entire failing-eval band; every sub-threshold score must ESCALATE
    // (with a dirty region present that would otherwise REWRITE), and never EXECUTE.
    for (let score = 0; score < 80; score += 5) {
      const d = run({ service: "api", environment: "staging", gitSha: "abc12345", aiEvalScore: score, region: "us-east-1", rampPercent: 10 });
      expect(d.kind).toBe("ESCALATE");
      expect(d.kind).not.toBe("EXECUTE");
    }
  });
});
