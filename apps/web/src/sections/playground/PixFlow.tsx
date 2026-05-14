"use client";

import { FlowSteps, type FlowStep } from "./FlowSteps";

const STEPS: ReadonlyArray<FlowStep> = [
  {
    title: "Create a PIX charge — DEFER on provider webhook",
    description:
      "An UNTRUSTED merchant request to create a charge. The kernel parks it on the payment.confirmed signal.",
    intentKind: "pix.charge.create",
    payload: {
      amountCentavos: 1500,
      payerDocument: "12345678900",
      description: "Coffee, two espressos",
    },
    expectedKind: "DEFER",
  },
  {
    title: "Refund an overshoot — REWRITE clamp",
    description:
      "Merchant requests R$ 30 refund on a R$ 15 charge. The kernel rewrites the refund down to the original amount.",
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
    title: "Refund a medium amount — REQUEST_CONFIRMATION",
    description:
      "Refund crosses the confirm threshold. The kernel asks for an explicit re-confirmation before EXECUTE.",
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
];

export function PixFlow() {
  return <FlowSteps steps={STEPS} packName="Payments · PIX" />;
}
