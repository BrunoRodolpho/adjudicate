import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
  type AuditRecord,
} from "@adjudicate/core";

/**
 * Command-risk demo fixtures (ADR-134, ADR-123) so the Command Risk panel and
 * blocked-commands list render in the mock gateway. They mirror exactly what
 * `createCommandRiskGuard` (primitives/guards.ts) emits:
 *
 *   - REFUSE  → `validation.command_blocked`        (irrecoverable destruction)
 *   - REWRITE → `validation.command_flag_stripped`  (sanitizing flag strip)
 *   - CONFIRM → `business.rule_satisfied`           (rule "command_risk_confirm")
 *
 * SECURITY: the real guard threads the RAW command into `detail.command`, which
 * can carry live secrets. These FIXTURES deliberately carry ONLY the closed-enum
 * `category` (no `command`, no secret) so the demo data itself proves the
 * no-leak contract — the aggregation handler reads only `category` anyway.
 *
 * `at` is computed relative to module load so the records always fall inside the
 * console's rolling lookback window.
 */
function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ── 1. REFUSE: irrecoverable destruction (`rm -rf /` class) → command_blocked ──
const blockedEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-05_cr01" },
  taint: "UNTRUSTED",
  nonce: "n_cr_blocked_01",
  createdAt: isoHoursAgo(30),
});

export const commandBlockedDestructive: AuditRecord = buildAuditRecord({
  envelope: blockedEnvelope,
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
  at: isoHoursAgo(30),
  plan: {
    visibleReadTools: [],
    allowedIntents: ["shell.exec"],
  },
});

// ── 2. REWRITE: strippable dangerous flag → command_flag_stripped ─────────────
const rewriteEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-05_cr02" },
  taint: "UNTRUSTED",
  nonce: "n_cr_rewrite_01",
  createdAt: isoHoursAgo(20),
});

const rewrittenEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[sanitized command]" },
  actor: rewriteEnvelope.actor,
  taint: rewriteEnvelope.taint, // never lowered/raised on a sanitizing rewrite
  nonce: rewriteEnvelope.nonce,
  createdAt: rewriteEnvelope.createdAt,
});

export const commandFlagStrippedDestructive: AuditRecord = buildAuditRecord({
  envelope: rewriteEnvelope,
  decision: decisionRewrite(
    rewrittenEnvelope,
    "Stripped dangerous flags: -f",
    // No `sanitized`/`stripped`/`command` in the demo detail — only category.
    [basis("validation", "command_flag_stripped", { category: "destructive" })],
  ),
  durationMs: 3,
  at: isoHoursAgo(20),
  plan: {
    visibleReadTools: [],
    allowedIntents: ["shell.exec"],
  },
});

// ── 3. CONFIRM: recoverable credential read → rule_satisfied (command_risk_confirm)
const confirmEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-06_cr03" },
  taint: "UNTRUSTED",
  nonce: "n_cr_confirm_01",
  createdAt: isoHoursAgo(6),
});

export const commandConfirmCredential: AuditRecord = buildAuditRecord({
  envelope: confirmEnvelope,
  decision: decisionRequestConfirmation(
    "Confirm credential command",
    [
      basis("business", "rule_satisfied", {
        rule: "command_risk_confirm",
        category: "credential",
      }),
    ],
  ),
  durationMs: 2,
  at: isoHoursAgo(6),
  plan: {
    visibleReadTools: [],
    allowedIntents: ["shell.exec"],
  },
});

/** Network confirm so all three categories appear in the distribution. */
const networkEnvelope = buildEnvelope({
  kind: "shell.exec",
  payload: { command: "[redacted command]" },
  actor: { principal: "llm", sessionId: "sess_2026-06-06_cr04" },
  taint: "UNTRUSTED",
  nonce: "n_cr_confirm_02",
  createdAt: isoHoursAgo(3),
});

export const commandConfirmNetwork: AuditRecord = buildAuditRecord({
  envelope: networkEnvelope,
  decision: decisionRequestConfirmation(
    "Confirm network command",
    [
      basis("business", "rule_satisfied", {
        rule: "command_risk_confirm",
        category: "network",
      }),
    ],
  ),
  durationMs: 2,
  at: isoHoursAgo(3),
  plan: {
    visibleReadTools: [],
    allowedIntents: ["shell.exec"],
  },
});

export const COMMAND_RISK_MOCKS: readonly AuditRecord[] = [
  commandBlockedDestructive,
  commandFlagStrippedDestructive,
  commandConfirmCredential,
  commandConfirmNetwork,
] as const;
