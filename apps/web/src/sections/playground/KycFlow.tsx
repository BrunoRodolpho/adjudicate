"use client";

import { FlowSteps, type FlowStep } from "./FlowSteps";

const STEPS: ReadonlyArray<FlowStep> = [
  {
    title: "Start a KYC session — DEFER on user uploads",
    description:
      "User initiates KYC. Kernel parks on the documents-uploaded signal.",
    intentKind: "kyc.start",
    payload: {
      userId: "u_synth_1",
      sessionId: "kyc_synth_1",
    },
    expectedKind: "DEFER",
  },
  {
    title: "Document upload — DEFER on vendor callback",
    description:
      "User uploads. Kernel parks on the vendor's verification result.",
    intentKind: "kyc.document.upload",
    payload: {
      sessionId: "kyc_synth_1",
      documentType: "passport",
      blobId: "blob_xyz",
    },
    expectedKind: "DEFER",
  },
];

export function KycFlow() {
  return <FlowSteps steps={STEPS} packName="Identity · KYC" />;
}
