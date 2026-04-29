import {
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
  type IntentEnvelope,
} from "@adjudicate/core";

/**
 * Self-contained test fixtures. Built via the kernel helpers so
 * `intentHash` and `planFingerprint` are computed by the same logic
 * adopters will run in production. No dependency on apps/console.
 *
 * Timestamps are fixed and ordered so newest-first sort produces a
 * deterministic sequence (Execute → Refuse → Defer → Escalate →
 * RequestConfirmation → Rewrite).
 */

const buildEnv = (
  kind: string,
  payload: unknown,
  nonce: string,
  createdAt: string,
): IntentEnvelope =>
  buildEnvelope({
    kind,
    payload,
    actor: { principal: "llm", sessionId: `sess-${nonce}` },
    taint: "UNTRUSTED",
    nonce,
    createdAt,
  });

export const fixtureExecute: AuditRecord = buildAuditRecord({
  envelope: buildEnv(
    "test.execute",
    { thing: 1 },
    "n-execute",
    "2026-04-28T20:00:00.000Z",
  ),
  decision: decisionExecute([basis("state", "transition_valid")]),
  durationMs: 5,
  at: "2026-04-28T20:00:00.000Z",
  plan: {
    visibleReadTools: ["list_things"],
    allowedIntents: ["test.execute"],
    forbiddenConcepts: [],
  },
});

export const fixtureRefuse: AuditRecord = buildAuditRecord({
  envelope: buildEnv(
    "test.refuse",
    { thing: 2 },
    "n-refuse",
    "2026-04-28T19:00:00.000Z",
  ),
  decision: decisionRefuse(
    refuse(
      "STATE",
      "test.already_done",
      "Already done.",
      "thing was previously processed",
    ),
    [
      basis("state", "transition_illegal"),
      basis("state", "terminal_state"),
    ],
  ),
  durationMs: 3,
  at: "2026-04-28T19:00:00.000Z",
});

export const fixtureDefer: AuditRecord = buildAuditRecord({
  envelope: buildEnv(
    "test.defer",
    { thing: 3 },
    "n-defer",
    "2026-04-28T18:00:00.000Z",
  ),
  decision: decisionDefer("test.signal.confirmed", 60_000, [
    basis("state", "transition_valid"),
  ]),
  durationMs: 4,
  at: "2026-04-28T18:00:00.000Z",
});

export const fixtureEscalate: AuditRecord = buildAuditRecord({
  envelope: buildEnv(
    "test.escalate",
    { thing: 4 },
    "n-escalate",
    "2026-04-28T17:00:00.000Z",
  ),
  decision: decisionEscalate(
    "supervisor",
    "Threshold exceeded — supervisor approval required.",
    [basis("business", "rule_violated", { threshold: 100 })],
  ),
  durationMs: 6,
  at: "2026-04-28T17:00:00.000Z",
});

export const fixtureRequestConfirmation: AuditRecord = buildAuditRecord({
  envelope: buildEnv(
    "test.request_confirmation",
    { thing: 5 },
    "n-confirm",
    "2026-04-28T16:00:00.000Z",
  ),
  decision: decisionRequestConfirmation(
    "Are you sure you want to proceed?",
    [basis("business", "rule_satisfied", { requires: "confirmation" })],
  ),
  durationMs: 2,
  at: "2026-04-28T16:00:00.000Z",
});

const originalRewriteEnv = buildEnv(
  "test.rewrite",
  { thing: 6, amount: 100 },
  "n-rewrite",
  "2026-04-28T15:00:00.000Z",
);

const rewrittenEnv = buildEnvelope({
  kind: "test.rewrite",
  payload: { thing: 6, amount: 50 }, // clamped
  actor: originalRewriteEnv.actor,
  taint: originalRewriteEnv.taint,
  nonce: originalRewriteEnv.nonce,
  createdAt: originalRewriteEnv.createdAt,
});

export const fixtureRewrite: AuditRecord = buildAuditRecord({
  envelope: originalRewriteEnv,
  decision: decisionRewrite(
    rewrittenEnv,
    "Amount clamped to safe ceiling.",
    [basis("business", "quantity_capped", { requested: 100, clampedTo: 50 })],
  ),
  durationMs: 7,
  at: "2026-04-28T15:00:00.000Z",
});

/** All six fixtures in newest-first order (matches store sort). */
export const ALL: readonly AuditRecord[] = [
  fixtureExecute,
  fixtureRefuse,
  fixtureDefer,
  fixtureEscalate,
  fixtureRequestConfirmation,
  fixtureRewrite,
] as const;
