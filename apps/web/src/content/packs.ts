export interface PackCard {
  readonly id: string;
  readonly displayName: string;
  readonly tagline: string;
  readonly intents: ReadonlyArray<string>;
  readonly outcomesCovered: ReadonlyArray<
    "EXECUTE" | "REFUSE" | "REWRITE" | "DEFER" | "ESCALATE" | "REQUEST_CONFIRMATION"
  >;
  readonly status: "shipped" | "roadmap";
}

export const PACKS: ReadonlyArray<PackCard> = [
  {
    id: "pack-payments-pix",
    displayName: "Payments · PIX",
    tagline: "Brazil's instant-payment lifecycle. Async DEFER on the provider webhook signal.",
    intents: ["pix.charge.create", "pix.charge.confirm", "pix.charge.refund"],
    outcomesCovered: [
      "EXECUTE",
      "REFUSE",
      "REWRITE",
      "DEFER",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
    ],
    status: "shipped",
  },
  {
    id: "pack-identity-kyc",
    displayName: "Identity · KYC",
    tagline: "Multi-stage identity verification. Start → upload → vendor callback.",
    intents: ["kyc.start", "kyc.document.upload", "kyc.vendor.callback"],
    outcomesCovered: ["EXECUTE", "REFUSE", "DEFER", "ESCALATE"],
    status: "shipped",
  },
  {
    id: "pack-deployments-approval",
    displayName: "Deployments · Approval",
    tagline: "Production-deploy gates and destructive-rollback confirmation.",
    intents: [
      "deployment.approval.request",
      "deployment.rollback.execute",
      "deployment.approval.resolve",
    ],
    outcomesCovered: [
      "EXECUTE",
      "REFUSE",
      "REWRITE",
      "DEFER",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
    ],
    status: "shipped",
  },
  {
    id: "pack-procurement",
    displayName: "Procurement",
    tagline: "PO approval ladders with vendor-tier thresholds.",
    intents: [],
    outcomesCovered: [],
    status: "roadmap",
  },
  {
    id: "pack-healthcare",
    displayName: "Healthcare",
    tagline: "Prescription / referral gates with HIPAA-shaped audit.",
    intents: [],
    outcomesCovered: [],
    status: "roadmap",
  },
  {
    id: "pack-banking",
    displayName: "Banking",
    tagline: "Wire-transfer caps, SAR escalation, KYC re-verification.",
    intents: [],
    outcomesCovered: [],
    status: "roadmap",
  },
];
