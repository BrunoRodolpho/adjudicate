import { attachAuditMetadata, type AuditRecord } from "@adjudicate/core";
import {
  createHallucinationMetadataProvider,
  createLexicalGroundednessScorer,
} from "@adjudicate/observability";
import { kycStartDefer } from "./kyc-start-defer";
import { pixRefundExecute } from "./pix-refund-execute";
import { pixRefundAlreadyRefunded } from "./pix-refund-already-refunded";
import { pixChargeCreateDefer } from "./pix-charge-create-defer";
import { pixLargeRefundEscalate } from "./pix-large-refund-escalate";
import { pixMediumRefundConfirm } from "./pix-medium-refund-confirm";
import { pixOvershootRefundRewrite } from "./pix-overshoot-refund-rewrite";
import { COMMAND_RISK_MOCKS } from "./command-risk";

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
/**
 * Demonstrate the v5 hallucination metadata (ADR-124) on the reference data so
 * the HallucinationBadge renders real buckets. Production attaches this in the
 * agent loop via `adjudicateAndAudit({ metadataProvider })`; here we run the
 * shipped REFERENCE scorer (`createLexicalGroundednessScorer`) over each turn's
 * claim/evidence and attach the result with `attachAuditMetadata` (metadata is
 * excluded from the auditHash, so the record's intentHash/auditHash are intact).
 */
const scoreMeta = createHallucinationMetadataProvider({
  scorer: createLexicalGroundednessScorer(),
}).metadataProvider;

function withHallucination(record: AuditRecord, claim: string, evidence: string): AuditRecord {
  // Feed the scorer a transient copy carrying this turn's claim/evidence; attach
  // the score to the ORIGINAL record so its displayed payload is unchanged.
  const probe = {
    ...record,
    envelope: {
      ...record.envelope,
      payload: { ...(record.envelope.payload as Record<string, unknown>), claim, evidence },
    },
  } as AuditRecord;
  const meta = scoreMeta(probe);
  return meta ? attachAuditMetadata(record, meta) : record;
}

/**
 * The seven decision-outcome fixtures. This is the stream the behavioral-drift
 * detector warms from — DRIFT_CONFIG's windows (baseline 3 / recent 4) are sized
 * for exactly these seven records, so drift behavior must stay scoped to this
 * set. Additive surfaces that need extra audit records (e.g. command-risk) join
 * `ALL_MOCKS` below WITHOUT perturbing the drift demo.
 */
export const DECISION_OUTCOME_MOCKS: readonly AuditRecord[] = [
  // Grounded: the assertion is fully supported by the evidence → low score.
  withHallucination(
    pixRefundExecute,
    "refund approved as a duplicate charge",
    "charge was a duplicate; the refund within thresholds was approved",
  ),
  pixRefundAlreadyRefunded,
  pixChargeCreateDefer,
  // Hallucinated: the assertion is not supported by the evidence → high score.
  withHallucination(
    pixLargeRefundEscalate,
    "preauthorized worldwide instantly guaranteed no review",
    "large refund exceeds threshold; escalated to a human reviewer",
  ),
  pixMediumRefundConfirm,
  pixOvershootRefundRewrite,
  kycStartDefer,
] as const;

export const ALL_MOCKS: readonly AuditRecord[] = [
  ...DECISION_OUTCOME_MOCKS,
  // Command-risk demo records (ADR-134) so the Command Risk panel + blocked
  // list render. Each carries ONLY the closed-enum category — never a raw
  // (possibly secret-bearing) command. Appended after the decision-outcome
  // stream so the drift detector (which reads DECISION_OUTCOME_MOCKS) is
  // unaffected.
  ...COMMAND_RISK_MOCKS,
] as const;

export {
  kycStartDefer,
  pixRefundExecute,
  pixRefundAlreadyRefunded,
  pixChargeCreateDefer,
  pixLargeRefundEscalate,
  pixMediumRefundConfirm,
  pixOvershootRefundRewrite,
  COMMAND_RISK_MOCKS,
};
