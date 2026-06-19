/**
 * Hand-authored payload schemas for the 8 intent kinds the Decision Lab
 * can route to. Transcribed from JSDoc in the Pack `types.ts` files:
 *   - packages/pack-payments-pix/src/types.ts
 *   - packages/pack-identity-kyc/src/types.ts
 *   - packages/pack-deployments-approval/src/types.ts
 *
 * Hand-authored is correct at this scale. If a Pack adds a 4th intent
 * kind, transcribe the JSDoc here. If a payload field changes shape,
 * update both the Pack types and this file (typecheck won't catch the
 * drift — these are documentation strings, not enforced schemas).
 */

export interface PayloadFieldDoc {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

export interface IntentSchema {
  readonly intentKind: string;
  readonly fields: ReadonlyArray<PayloadFieldDoc>;
}

export const INTENT_SCHEMAS: Record<string, IntentSchema> = {
  // ── Payments · PIX ────────────────────────────────────────────────
  "pix.charge.create": {
    intentKind: "pix.charge.create",
    fields: [
      { name: "amountCentavos", type: "number (integer)", description: "Amount in centavos. Hard rule: never floats." },
      { name: "payerDocument", type: "string", description: "CPF (11 digits) or CNPJ (14 digits), digits only." },
      { name: "description", type: "string", description: "Free-text description shown to payer in their bank app." },
    ],
  },
  "pix.charge.confirm": {
    intentKind: "pix.charge.confirm",
    fields: [
      { name: "chargeId", type: "string", description: "Charge id from a prior pix.charge.create." },
      { name: "providerTxId", type: "string", description: "Provider's transaction id (idempotency key for the webhook)." },
      { name: "confirmedAt", type: "string (ISO-8601)", description: "Timestamp from the provider." },
    ],
  },
  "pix.charge.refund": {
    intentKind: "pix.charge.refund",
    fields: [
      { name: "chargeId", type: "string", description: "Charge id from a prior pix.charge.create." },
      { name: "refundCentavos", type: "number (integer)", description: "Refund amount in centavos. May be REWRITTEN if it exceeds original." },
      { name: "reason", type: "string", description: "Free-text reason shown in audit trail." },
    ],
  },
  // ── Identity · KYC ────────────────────────────────────────────────
  "kyc.start": {
    intentKind: "kyc.start",
    fields: [
      { name: "sessionId", type: "string", description: "Caller-supplied unique session id." },
      { name: "userId", type: "string", description: "Internal user id the session is being run for." },
    ],
  },
  "kyc.document.upload": {
    intentKind: "kyc.document.upload",
    fields: [
      { name: "sessionId", type: "string", description: "Session id from a prior kyc.start." },
      { name: "documentType", type: "\"passport\" | \"drivers_license\" | \"national_id\"", description: "Type of document being uploaded." },
      { name: "documentRef", type: "string", description: "Blob storage reference for the uploaded scan." },
    ],
  },
  "kyc.vendor.callback": {
    intentKind: "kyc.vendor.callback",
    fields: [
      { name: "sessionId", type: "string", description: "Session id from a prior kyc.start." },
      { name: "score", type: "number (0-100)", description: "Confidence the identity is genuine." },
      { name: "amlStatus", type: "\"CLEAR\" | \"FLAGGED\"", description: "Anti-money-laundering screening result. A FLAGGED callback ESCALATEs regardless of score." },
      { name: "amlMatchScore", type: "number (optional)", description: "Match confidence if amlStatus is \"FLAGGED\"." },
      { name: "amlMatchEntity", type: "string (optional)", description: "Sanctioned entity name if amlStatus is \"FLAGGED\"." },
    ],
  },
  // ── Deployments · Approval ────────────────────────────────────────
  "deployment.approval.request": {
    intentKind: "deployment.approval.request",
    fields: [
      { name: "service", type: "string", description: "Service name being deployed." },
      { name: "environment", type: "\"staging\" | \"production\"", description: "Target environment. REFUSEd otherwise." },
      { name: "gitSha", type: "string", description: "Git commit SHA being deployed. Empty string is REFUSEd." },
      { name: "rampPercent", type: "number (1-100)", description: "Traffic percentage. Production is REWRITTEN to MAX_PRODUCTION_RAMP_PERCENT (25%)." },
    ],
  },
  "deployment.approval.resolve": {
    intentKind: "deployment.approval.resolve",
    fields: [
      { name: "service", type: "string", description: "Service the approval is for." },
      { name: "environment", type: "\"staging\" | \"production\"", description: "Environment the approval is for." },
      { name: "gitSha", type: "string", description: "Git SHA the approval is for." },
      { name: "decision", type: "\"approved\" | \"rejected\"", description: "Approver's decision." },
      { name: "approver", type: "string", description: "Identifier of the human approver." },
    ],
  },
  "deployment.rollback.execute": {
    intentKind: "deployment.rollback.execute",
    fields: [
      { name: "service", type: "string", description: "Service to roll back." },
      { name: "environment", type: "\"staging\" | \"production\"", description: "Target environment." },
      { name: "toGitSha", type: "string", description: "Git SHA to roll back to. Empty string is REFUSEd." },
      { name: "confirmationToken", type: "string (optional)", description: "Required for production rollbacks; absence triggers REQUEST_CONFIRMATION." },
    ],
  },
};
