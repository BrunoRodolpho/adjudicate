# ADR-143 — Smart Approval Engine — channels, quorum, escalation, attestation (amends ADR-122)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/approval-engine` (Slack/Teams/Email channels, `QuorumPolicy`, escalation, attestation)
- **Related:** ADR-122 (approval engine), ADR-114 (kill switch), ADR-121/137 (signing-key reuse)

## Context

ADR-122 shipped the approval engine with webhook + console-log channels and a single-approver `resolve`. The enhancement report flagged it **Partial**: missing production channels, quorum, escalation timers, attestation, and a live `/approvals` UI. The forgeable `resolvedBy` claim was the notable integrity gap.

## Decision

All additions hang off the existing `REQUEST_CONFIRMATION → ConfirmationStore → resolve → agent.confirm` side-channel — pure I/O coordination ABOVE the kernel.

- **Channels:** `createSlackChannel` / `createTeamsChannel` (webhook-style) + `createEmailChannel` (injected `send` transport). Pure I/O, declarative-only when no transport is injected.
- **Quorum:** `QuorumPolicy { minApprovals, distinctApprovers? }`. An accepted `resolve` accumulates the approver into the pending request and only runs `confirm()` once quorum is met (returning `turn: null` while awaiting); a single decline resolves immediately.
- **Attestation:** optional `attestationVerifier` makes `resolve` REQUIRE a verified approver signature over the token, replacing the forgeable `resolvedBy`; `createEd25519AttestationVerifier` ships a `node:crypto` verifier. Verification failure → `ATTESTATION_INVALID`.
- **Escalation:** an `escalation { afterMs, to }` policy is stored on the request; pure `isEscalationDue(req, nowMs)` lets an out-of-band scheduler re-route/remind.

## Why this shape

- **Approval is an out-of-band side-channel, resolved post-decision.** Nothing here enters `intentHash`/`S`/the `auditHash` pre-image, and `REQUEST_CONFIRMATION` is an existing variant — so the kernel and the closed Decision union are untouched.
- **Channels are transport-injected.** Real Slack/Teams/Email credentials and SMTP transports are the adopter's; the engine ships adapters + an ed25519 verifier, with mocked tests.
- **`resolve` returns `turn: AgentTurnResult | null`** — `null` only while awaiting quorum; single-approver (legacy) behavior is unchanged (turn always present).

## Invariants preserved

- Engine emits no Decisions and adds no Guards; state fetched fresh at resolve, never stored, never in `intentHash`. Single-use `confirm()` semantics preserved. Attestation/quorum fail-closed (missing/invalid attestation or unmet quorum does not run `confirm`).

## Alternatives considered

- **Bundle a crypto dependency for attestation.** Rejected — an injected verifier keeps the engine crypto-agnostic; the `node:crypto` ed25519 helper is opt-in.
- **Change `resolve`'s contract for quorum.** Minimized — `turn` became nullable (only relevant under quorum), keeping existing callers unaffected.

## Test coverage

`packages/approval-engine/tests/governance.test.ts` (quorum distinct/raw; escalation-due; ed25519 verifier accept/reject). `channels.test.ts` (Slack/Teams/Email payloads, non-ok throw, declarative-only). `engine-governance.test.ts` (quorum accumulation/dedup/decline; attestation accept/reject + recorded approver; escalation stored).

## Lifecycle

Phase 2: channels + quorum + escalation + attestation (this ADR). **Phase 3:** replace the static `/approvals` console replica with a live operator queue reading the registry projection, and make attestation-enforce the default — both require the running stack + admin/DB to validate end-to-end. Channel credentials + attestation signing keys share the plan's Appendix D key-management runbook.
