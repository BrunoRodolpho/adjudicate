import type { AuditRecord } from "@adjudicate/core";
import { kycStartDefer } from "./kyc-start-defer";
import { pixRefundExecute } from "./pix-refund-execute";
import { pixRefundAlreadyRefunded } from "./pix-refund-already-refunded";
import { pixChargeCreateDefer } from "./pix-charge-create-defer";
import { pixLargeRefundEscalate } from "./pix-large-refund-escalate";
import { pixMediumRefundConfirm } from "./pix-medium-refund-confirm";
import { pixOvershootRefundRewrite } from "./pix-overshoot-refund-rewrite";

/**
 * Decision-outcome fixtures driving the mock gateway.
 *
 * The six PIX fixtures cover every Decision kind end-to-end through
 * the trace UI. The KYC fixture (Phase 4) proves the multi-Pack
 * registry routes a non-PIX intent kind correctly: clicking Replay on
 * `kyc.start` resolves the KYC adapter and re-adjudicates against the
 * KYC policy, not PIX.
 *
 * Each fixture exercises the kernel helpers (`buildEnvelope`,
 * `buildAuditRecord`, `decisionExecute|Refuse|Defer|Escalate|...`) so
 * `intentHash` and `planFingerprint` shapes match production.
 */
export const ALL_MOCKS: readonly AuditRecord[] = [
  pixRefundExecute,
  pixRefundAlreadyRefunded,
  pixChargeCreateDefer,
  pixLargeRefundEscalate,
  pixMediumRefundConfirm,
  pixOvershootRefundRewrite,
  kycStartDefer,
] as const;

export {
  kycStartDefer,
  pixRefundExecute,
  pixRefundAlreadyRefunded,
  pixChargeCreateDefer,
  pixLargeRefundEscalate,
  pixMediumRefundConfirm,
  pixOvershootRefundRewrite,
};
