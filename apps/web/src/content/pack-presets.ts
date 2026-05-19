import type { DecisionKind } from "@adjudicate/core";

/**
 * Per-Pack scenario presets for the Decision Lab. Each preset loads an
 * intent kind + payload (and optional state) into the lab and is known
 * to produce a specific decision kind when adjudicated.
 *
 * Source: payloads borrowed from the Flow tabs' canned scenarios so the
 * presets are guaranteed to produce the expected decision (the same
 * kernel runs both surfaces).
 *
 * The Decision Lab existing preset row (six chips keyed by decision
 * kind, all using the Deployments Pack) is preserved; this file adds
 * a complementary per-Pack row that lets visitors see how each Pack
 * reaches different decisions.
 */

export interface PackPreset {
  readonly label: string;
  readonly description: string;
  readonly intentKind: string;
  readonly payload: Record<string, unknown>;
  readonly state?: unknown;
  readonly expectedKind: DecisionKind;
}

export const PACK_PRESETS: Record<string, ReadonlyArray<PackPreset>> = {
  "payments-pix": [
    {
      label: "Create charge → DEFER",
      description: "PIX charge create parks on the provider webhook.",
      intentKind: "pix.charge.create",
      payload: {
        amountCentavos: 1500,
        payerDocument: "12345678900",
        description: "Coffee, two espressos",
      },
      expectedKind: "DEFER",
    },
    {
      label: "Refund overshoot → REWRITE",
      description:
        "Merchant requests R$ 30 refund on a R$ 15 charge. Kernel clamps the refund.",
      intentKind: "pix.charge.refund",
      payload: {
        chargeId: "ch_synthetic_1",
        refundCentavos: 3000,
        reason: "customer complaint",
      },
      state: {
        charges: {
          ch_synthetic_1: {
            id: "ch_synthetic_1",
            amountCentavos: 1500,
            status: "confirmed",
            createdAt: "2026-05-13T11:00:00.000Z",
            confirmedAt: "2026-05-13T11:01:00.000Z",
          },
        },
      },
      expectedKind: "REWRITE",
    },
    {
      label: "Mid-amount refund → REQUEST_CONFIRMATION",
      description:
        "Refund crosses the confirm threshold; kernel asks for re-confirmation.",
      intentKind: "pix.charge.refund",
      payload: {
        chargeId: "ch_synthetic_2",
        refundCentavos: 60000,
        reason: "user dispute",
      },
      state: {
        charges: {
          ch_synthetic_2: {
            id: "ch_synthetic_2",
            amountCentavos: 100000,
            status: "confirmed",
            createdAt: "2026-05-13T11:00:00.000Z",
            confirmedAt: "2026-05-13T11:01:00.000Z",
          },
        },
      },
      expectedKind: "REQUEST_CONFIRMATION",
    },
  ],
  "identity-kyc": [
    {
      label: "Start KYC → DEFER",
      description: "User initiates KYC; kernel parks on the documents-uploaded signal.",
      intentKind: "kyc.start",
      payload: {
        userId: "u_synth_1",
        sessionId: "kyc_synth_1",
      },
      expectedKind: "DEFER",
    },
    {
      label: "Upload document → DEFER",
      description: "Document upload parks on the vendor's verification result.",
      intentKind: "kyc.document.upload",
      payload: {
        sessionId: "kyc_synth_1",
        documentType: "passport",
        documentRef: "blob_xyz",
      },
      expectedKind: "DEFER",
    },
  ],
  "deployments-approval": [
    {
      label: "Staging at 25% → EXECUTE",
      description: "Small staging ramp passes every phase.",
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
      label: "Production at 100% → REWRITE",
      description: "Production ramp clamped to MAX_PRODUCTION_RAMP_PERCENT (25%).",
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
      label: "Production w/o approval → ESCALATE",
      description:
        "Production deploy without a recorded approval routes to a human.",
      intentKind: "deployment.approval.request",
      payload: {
        service: "api",
        environment: "production",
        gitSha: "feedfacefeedface",
        rampPercent: 10,
      },
      expectedKind: "ESCALATE",
    },
  ],
};

/** Pretty display name keyed by Pack id. */
export const PACK_DISPLAY_NAME: Record<string, string> = {
  "payments-pix": "Payments · PIX",
  "identity-kyc": "Identity · KYC",
  "deployments-approval": "Deployments · Approval",
};
