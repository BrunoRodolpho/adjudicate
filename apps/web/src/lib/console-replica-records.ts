/**
 * console-replica-records — ILLUSTRATIVE sample AuditRecords for the /console
 * operator-console replica.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It is ported from `apps/console`'s real
 * kernel-built mocks (`apps/console/src/lib/mocks/*`) and exists ONLY to drive
 * the clearly-labeled "Illustrative replica of the operator console" surface
 * under /console. It carries NO real PII, NO real tenant-session ids, and NO
 * raw command text. apps/web is a public, unauthenticated marketing surface
 * with NO database/redis/admin credentials — these fixtures are the ONLY data
 * the replica ever renders.
 *
 * Operator-grade DETAIL (full envelope, decision basis, supersession, plan,
 * hallucination metadata) is shown ONLY under /console behind the
 * ConsoleChrome "illustrative replica · sample data" label. This module MUST
 * NEVER be projected to the public /transparency views — those render from the
 * dedicated, redacted `transparency-fixtures.ts` aggregates instead.
 *
 * Records are built with the SAME @adjudicate/core kernel helpers production
 * uses (`buildEnvelope`, `buildAuditRecord`, `decision*`), so every
 * `intentHash` / `auditHash` / `planFingerprint` is a real, verifiable hash —
 * not a hand-typed string. Construction is pure and deterministic: every
 * timestamp below is a FIXED literal — no wall-clock (`Date.now()` /
 * `new Date()`) and no random source is ever called, so the hashes are stable
 * across builds and machines.
 *
 * The hallucination metadata (ADR-124) is inlined as literal
 * `{ hallucination_score, hallucination_bucket }` values. apps/console attaches
 * it via `@adjudicate/observability`'s reference lexical scorer; that package is
 * not a dependency of apps/web, so we inline the exact values the reference
 * scorer (`createLexicalGroundednessScorer` → `1 - containment(claim,
 * evidence)`, bucketed at <0.34 / ≥0.67) produces for each scored turn. Metadata
 * is EXCLUDED from the auditHash pre-image, so attaching it leaves the record's
 * intentHash/auditHash intact (see packages/core/src/audit.ts).
 */

import {
  attachAuditMetadata,
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
  type AuditRecord,
} from "@adjudicate/core";

// ── EXECUTE — grounded refund within thresholds ─────────────────────────────
const pixRefundExecuteEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ4QRSTUV",
    refundCentavos: 18_500,
    reason: "duplicate charge",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_b1429f" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:18:02_b1429f",
  createdAt: "2026-04-28T20:18:02.000Z",
});

const pixRefundExecute: AuditRecord = attachAuditMetadata(
  buildAuditRecord({
    envelope: pixRefundExecuteEnvelope,
    decision: decisionExecute([
      basis("state", "transition_valid"),
      basis("auth", "scope_sufficient"),
      basis("taint", "level_permitted"),
      basis("business", "rule_satisfied", { ruleId: "refund_within_thresholds" }),
    ]),
    durationMs: 31,
    resourceVersion: "ord_v8",
    at: "2026-04-28T20:18:02.031Z",
    plan: {
      visibleReadTools: ["list_pix_charges", "get_pix_charge"],
      allowedIntents: ["pix.charge.refund"],
    },
  }),
  // Grounded: the assertion ("refund approved as a duplicate charge") is fully
  // supported by the evidence → low score. Reference lexical scorer output.
  { hallucination_score: 0.16666666666666663, hallucination_bucket: "grounded" },
);

// ── REFUSE — charge already refunded (terminal state) ───────────────────────
const pixRefundAlreadyRefundedEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ8ABCDEF",
    refundCentavos: 30_000,
    reason: "customer requested",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_a31f7e" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:31:19_a31f7e",
  createdAt: "2026-04-28T20:31:19.000Z",
});

const pixRefundAlreadyRefunded: AuditRecord = buildAuditRecord({
  envelope: pixRefundAlreadyRefundedEnvelope,
  decision: decisionRefuse(
    refuse(
      "STATE",
      "pix.charge.already_refunded",
      "We've already processed a refund for this charge.",
      "chargeId=cha_01HXYZ8ABCDEF",
    ),
    [
      basis("state", "transition_illegal", { reason: "already_refunded" }),
      basis("state", "terminal_state"),
    ],
  ),
  durationMs: 47,
  resourceVersion: "ord_v3",
  at: "2026-04-28T20:31:19.047Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
  },
});

// ── DEFER — new charge awaits payment confirmation ──────────────────────────
const pixChargeCreateDeferEnvelope = buildEnvelope({
  kind: "pix.charge.create",
  payload: {
    amountCentavos: 45_900,
    description: "Order #2914 — express delivery",
    customerId: "cust_01HXYZAA",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_c882d1" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T19:55:14_c882d1",
  createdAt: "2026-04-28T19:55:14.000Z",
});

const pixChargeCreateDefer: AuditRecord = buildAuditRecord({
  envelope: pixChargeCreateDeferEnvelope,
  decision: decisionDefer("payment.confirmed", 15 * 60_000, [
    basis("state", "transition_valid", { transition: "create→pending" }),
  ]),
  durationMs: 22,
  at: "2026-04-28T19:55:14.022Z",
  plan: {
    visibleReadTools: ["list_pix_charges"],
    allowedIntents: ["pix.charge.create"],
  },
});

// ── ESCALATE — large refund over the supervisor threshold (hallucinated) ────
const pixLargeRefundEscalateEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ9LARGE",
    refundCentavos: 215_000,
    reason: "high-value dispute resolution",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_d44a91" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T19:32:45_d44a91",
  createdAt: "2026-04-28T19:32:45.000Z",
});

const pixLargeRefundEscalate: AuditRecord = attachAuditMetadata(
  buildAuditRecord({
    envelope: pixLargeRefundEscalateEnvelope,
    decision: decisionEscalate(
      "supervisor",
      "Refund of R$ 2150,00 exceeds R$ 1000,00 supervisor threshold",
      [
        basis("business", "rule_violated", {
          threshold: 100_000,
          requested: 215_000,
        }),
      ],
    ),
    durationMs: 38,
    at: "2026-04-28T19:32:45.038Z",
    plan: {
      visibleReadTools: ["list_pix_charges", "get_pix_charge"],
      allowedIntents: ["pix.charge.refund"],
    },
  }),
  // Hallucinated: the assertion ("preauthorized worldwide instantly guaranteed
  // no review") is wholly unsupported by the evidence → max score.
  { hallucination_score: 1, hallucination_bucket: "hallucinated" },
);

// ── REQUEST_CONFIRMATION — medium refund needs explicit confirmation ────────
const pixMediumRefundConfirmEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ7MIDD",
    refundCentavos: 64_000,
    reason: "customer dissatisfaction",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_e211c6" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T18:47:11_e211c6",
  createdAt: "2026-04-28T18:47:11.000Z",
});

const pixMediumRefundConfirm: AuditRecord = buildAuditRecord({
  envelope: pixMediumRefundConfirmEnvelope,
  decision: decisionRequestConfirmation(
    "Confirme o reembolso de R$ 640,00 para o pagamento PIX cha_01HXYZ7MIDD?",
    [
      basis("business", "rule_satisfied", {
        threshold: 50_000,
        requested: 64_000,
        requires: "explicit_confirmation",
      }),
    ],
  ),
  durationMs: 26,
  at: "2026-04-28T18:47:11.026Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
  },
});

// ── REWRITE — refund overshoot clamped to the charge total ──────────────────
const pixOvershootOriginalEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ6OVRSHT",
    refundCentavos: 95_000, // overshoots original of 30_000
    reason: "full refund",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_f9921b" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T18:21:33_f9921b",
  createdAt: "2026-04-28T18:21:33.000Z",
});

// REWRITE substitutes a sanitized envelope. Same nonce + actor + taint — it's
// the same logical action, just clamped to a safe quantity.
const pixOvershootRewrittenEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ6OVRSHT",
    refundCentavos: 30_000, // clamped to original charge total
    reason: "full refund",
  },
  actor: pixOvershootOriginalEnvelope.actor,
  taint: pixOvershootOriginalEnvelope.taint,
  nonce: pixOvershootOriginalEnvelope.nonce,
  createdAt: pixOvershootOriginalEnvelope.createdAt,
});

const pixOvershootRefundRewrite: AuditRecord = buildAuditRecord({
  envelope: pixOvershootOriginalEnvelope,
  decision: decisionRewrite(
    pixOvershootRewrittenEnvelope,
    "Refund amount clamped to the original charge total (R$ 300,00).",
    [
      basis("business", "quantity_capped", {
        requested: 95_000,
        clampedTo: 30_000,
      }),
    ],
  ),
  durationMs: 19,
  at: "2026-04-28T18:21:33.019Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
  },
});

// ── DEFER (KYC) — multi-Pack registry routes a non-PIX intent ───────────────
const kycStartDeferEnvelope = buildEnvelope({
  kind: "kyc.start",
  payload: {
    sessionId: "kyc_sess_01HXYZ_NEW_USER",
    userId: "user_01HXYZ_2026_04_28",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_kyc_a14b22" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:12:08_kyc_a14b22",
  createdAt: "2026-04-28T20:12:08.000Z",
});

const kycStartDefer: AuditRecord = buildAuditRecord({
  envelope: kycStartDeferEnvelope,
  decision: decisionDefer(
    "kyc.documents.uploaded",
    24 * 60 * 60 * 1000, // 24h, matches KYC_DOCUMENT_UPLOAD_TIMEOUT_MS
    [
      basis("state", "transition_valid", {
        reason: "documents_required",
        transition: "INIT→DOCS_REQUIRED",
      }),
    ],
  ),
  durationMs: 14,
  at: "2026-04-28T20:12:08.014Z",
  plan: {
    visibleReadTools: ["list_kyc_sessions", "get_kyc_session"],
    allowedIntents: ["kyc.start"],
  },
});

// ── Supersession chain — parked confirmation → resumed EXECUTE (ADR-136) ────
// The parked predecessor envelope. Built only so its real intentHash can be the
// `supersedes.predecessorIntentHash` back-link the chain panel walks. The parked
// record itself is not emitted here — the resumed record carries the link.
const deploymentRollbackParkedEnvelope = buildEnvelope({
  kind: "deployment.rollback.execute",
  payload: { target: "a1b2c3d4", environment: "production" },
  actor: { principal: "llm", sessionId: "sess-dep-03" },
  taint: "UNTRUSTED",
  nonce: "n-dep-rollback-parked",
  createdAt: "2026-06-06T12:00:00.000Z",
});

const deploymentRollbackResumedEnvelope = buildEnvelope({
  kind: "deployment.rollback.execute",
  payload: { target: "a1b2c3d4", environment: "production" },
  actor: { principal: "llm", sessionId: "sess-dep-03" },
  taint: "UNTRUSTED",
  nonce: "n-dep-rollback-resumed",
  createdAt: "2026-06-06T12:05:00.000Z",
});

const deploymentRollbackResumed: AuditRecord = buildAuditRecord({
  envelope: deploymentRollbackResumedEnvelope,
  decision: decisionExecute([
    basis("confirmation", "received", { requires: "explicit_confirmation" }),
    basis("state", "transition_valid"),
  ]),
  durationMs: 9,
  at: "2026-06-06T12:05:00.026Z",
  plan: {
    visibleReadTools: ["list_deployments", "get_deployment"],
    allowedIntents: ["deployment.rollback.execute"],
  },
  supersedes: {
    predecessorIntentHash: deploymentRollbackParkedEnvelope.intentHash,
    predecessorAt: "2026-06-06T12:00:00.000Z",
    reason: "confirmation_resolved",
    token: "demo-resolved-token",
  },
});

// ── Command-risk demo records (ADR-134 / ADR-123) ───────────────────────────
// These mirror exactly what `createCommandRiskGuard` emits, but carry ONLY the
// closed-enum `category` in the basis detail — NEVER the raw command (which can
// embed live secrets). The console source computed `at`/`createdAt` from
// `Date.now()` so the records stay inside its rolling window; here we pin them
// to FIXED literals (no wall-clock) so the hashes are stable.

// REFUSE: irrecoverable destruction (rm -rf / class) → command_blocked.
const commandBlockedEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-05_cr01" },
  taint: "UNTRUSTED",
  nonce: "n_cr_blocked_01",
  createdAt: "2026-06-05T00:00:00.000Z",
});

const commandBlockedDestructive: AuditRecord = buildAuditRecord({
  envelope: commandBlockedEnvelope,
  decision: decisionRefuse(
    refuse(
      "SECURITY",
      "command_risk_blocked",
      "I can't run that command.",
      "destructive: rm_rf_root",
    ),
    // detail carries ONLY the closed-enum category — never the raw command.
    [basis("validation", "command_blocked", { category: "destructive" })],
  ),
  durationMs: 4,
  at: "2026-06-05T00:00:00.000Z",
  plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
});

// REWRITE: strippable dangerous flag → command_flag_stripped.
const commandRewriteEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-05_cr02" },
  taint: "UNTRUSTED",
  nonce: "n_cr_rewrite_01",
  createdAt: "2026-06-05T00:00:00.000Z",
});

const commandRewrittenEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[sanitized command]" },
  actor: commandRewriteEnvelope.actor,
  taint: commandRewriteEnvelope.taint, // never lowered/raised on a sanitizing rewrite
  nonce: commandRewriteEnvelope.nonce,
  createdAt: commandRewriteEnvelope.createdAt,
});

const commandFlagStrippedDestructive: AuditRecord = buildAuditRecord({
  envelope: commandRewriteEnvelope,
  decision: decisionRewrite(
    commandRewrittenEnvelope,
    "Stripped dangerous flags: -f",
    // No sanitized/stripped/command in the demo detail — only category.
    [basis("validation", "command_flag_stripped", { category: "destructive" })],
  ),
  durationMs: 3,
  at: "2026-06-05T00:00:00.000Z",
  plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
});

// CONFIRM: recoverable credential read → rule_satisfied (command_risk_confirm).
const commandConfirmCredentialEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-06_cr03" },
  taint: "UNTRUSTED",
  nonce: "n_cr_confirm_01",
  createdAt: "2026-06-06T00:00:00.000Z",
});

const commandConfirmCredential: AuditRecord = buildAuditRecord({
  envelope: commandConfirmCredentialEnvelope,
  decision: decisionRequestConfirmation("Confirm credential command", [
    basis("business", "rule_satisfied", {
      rule: "command_risk_confirm",
      category: "credential",
    }),
  ]),
  durationMs: 2,
  at: "2026-06-06T00:00:00.000Z",
  plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
});

// CONFIRM: network command → so all three risk categories appear.
const commandConfirmNetworkEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-06_cr04" },
  taint: "UNTRUSTED",
  nonce: "n_cr_confirm_02",
  createdAt: "2026-06-06T00:00:00.000Z",
});

const commandConfirmNetwork: AuditRecord = buildAuditRecord({
  envelope: commandConfirmNetworkEnvelope,
  decision: decisionRequestConfirmation("Confirm network command", [
    basis("business", "rule_satisfied", {
      rule: "command_risk_confirm",
      category: "network",
    }),
  ]),
  durationMs: 2,
  at: "2026-06-06T00:00:00.000Z",
  plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
});

/**
 * The parked predecessor intentHash — the supersession chain's `requested` step
 * target. Exported so the /console chain panel can render the parked → resolved
 * → resumed timeline against the resumed record's `supersedes` back-link.
 */
export const DEPLOYMENT_ROLLBACK_PARKED_HASH =
  deploymentRollbackParkedEnvelope.intentHash;

/** The resumed decision's intentHash — the join key the chain walks from. */
export const DEPLOYMENT_ROLLBACK_RESUMED_HASH =
  deploymentRollbackResumed.intentHash;

/**
 * Ordered, NEWEST-FIRST replica feed. Ordering is by `at` descending so the
 * /console table and simulated tail read like a believable live stream
 * (June deployment + command-risk records on top, then the April PIX/KYC
 * decision-outcome wave). Every one of the six Decision kinds
 * (EXECUTE / REFUSE / ESCALATE / REQUEST_CONFIRMATION / DEFER / REWRITE) is
 * represented; the hallucination-scored records (grounded + hallucinated) and
 * the supersession-chain record are all present.
 */
export const CONSOLE_REPLICA_RECORDS: readonly AuditRecord[] = [
  deploymentRollbackResumed, // 2026-06-06 — EXECUTE + supersession chain
  commandConfirmNetwork, // 2026-06-06 — REQUEST_CONFIRMATION (network)
  commandConfirmCredential, // 2026-06-06 — REQUEST_CONFIRMATION (credential)
  commandBlockedDestructive, // 2026-06-05 — REFUSE (command blocked)
  commandFlagStrippedDestructive, // 2026-06-05 — REWRITE (flag stripped)
  pixRefundAlreadyRefunded, // 2026-04-28T20:31 — REFUSE (already refunded)
  pixRefundExecute, // 2026-04-28T20:18 — EXECUTE (grounded)
  kycStartDefer, // 2026-04-28T20:12 — DEFER (KYC)
  pixChargeCreateDefer, // 2026-04-28T19:55 — DEFER (PIX)
  pixLargeRefundEscalate, // 2026-04-28T19:32 — ESCALATE (hallucinated)
  pixMediumRefundConfirm, // 2026-04-28T18:47 — REQUEST_CONFIRMATION (PIX)
  pixOvershootRefundRewrite, // 2026-04-28T18:21 — REWRITE (PIX overshoot)
] as const;

/**
 * intentHash → AuditRecord lookup for the replica. Built from
 * `CONSOLE_REPLICA_RECORDS` so it can never drift from the ordered feed.
 */
export const CONSOLE_REPLICA_RECORDS_BY_HASH: ReadonlyMap<string, AuditRecord> =
  new Map(CONSOLE_REPLICA_RECORDS.map((r) => [r.intentHash, r]));
