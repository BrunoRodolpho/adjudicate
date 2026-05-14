"use client";

import { FlowSteps, type FlowStep } from "./FlowSteps";

const STEPS: ReadonlyArray<FlowStep> = [
  {
    title: "Staging deploy at 25% ramp — EXECUTE",
    description:
      "Small staging ramp passes every phase and EXECUTEs immediately.",
    intentKind: "deployment.approval.request",
    payload: {
      service: "api",
      environment: "staging",
      gitSha: "deadbeefdeadbeef",
      rampPercent: 25,
    },
    expectedKind: "EXECUTE",
  },
  {
    title: "Staging deploy at 100% ramp — DEFER on CI",
    description:
      "High staging ramp DEFERs until the ci.green signal arrives.",
    intentKind: "deployment.approval.request",
    payload: {
      service: "api",
      environment: "staging",
      gitSha: "feedfacefeedface",
      rampPercent: 100,
    },
    expectedKind: "DEFER",
  },
  {
    title: "Production deploy at 100% — REWRITE clamp",
    description:
      "Production ramp gets clamped to the configured maximum (25%).",
    intentKind: "deployment.approval.request",
    payload: {
      service: "api",
      environment: "production",
      gitSha: "feedfacefeedface",
      rampPercent: 100,
    },
    expectedKind: "REWRITE",
  },
  {
    title: "Production deploy without approval — ESCALATE",
    description:
      "Production deploy without a prior approval record. Kernel routes to a human.",
    intentKind: "deployment.approval.request",
    payload: {
      service: "api",
      environment: "production",
      gitSha: "feedfacefeedface",
      rampPercent: 10,
    },
    expectedKind: "ESCALATE",
  },
  {
    title: "Rollback to production — REQUEST_CONFIRMATION",
    description:
      "Destructive rollback without a confirmation token. Kernel asks first.",
    intentKind: "deployment.rollback.execute",
    payload: {
      service: "api",
      environment: "production",
      toGitSha: "deadbeefdeadbeef",
    },
    expectedKind: "REQUEST_CONFIRMATION",
  },
];

export function DeploymentsFlow() {
  return <FlowSteps steps={STEPS} packName="Deployments · Approval" />;
}
