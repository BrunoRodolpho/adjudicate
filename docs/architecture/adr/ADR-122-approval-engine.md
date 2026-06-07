# ADR-122 — `@adjudicate/approval-engine`: human-approval orchestration

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** new `@adjudicate/approval-engine` package, `@adjudicate/admin-sdk` (`approval.*`), apps/console (Approvals page)
- **Related:** ADR-113 (adapter-core), REQUEST_CONFIRMATION confirm()/ConfirmationStore

## Context

`REQUEST_CONFIRMATION` is one of the six outcomes, but "how a human approves" is left to adopters. We want a reference implementation with pluggable channels (Slack/Teams/email/webhook) and a console approve/decline surface — without re-implementing the confirmation crypto.

## Decision

Ship `@adjudicate/approval-engine`:
- **`ApprovalRegistry`** — a display-projection store (`put/get/list/markResolved`, in-memory ref impl) holding `ApprovalRequest` projections (token, sessionId, intentHash, prompt, status, channel). **Separate** from adapter-core's single-use `ConfirmationStore`.
- **`ApprovalChannel`** — pluggable delivery (`request` + optional `notifyResolved`). Ships `webhook` + `console-log`; Slack/Teams/email are one-file implementations.
- **`createApprovalEngine({ agent, registry, channels, resolveStateContext, ... })`** with `request/resolve/list/get`. `resolve()` fetches state/context FRESH via `resolveStateContext(sessionId)` and calls `agent.confirm()`.
- **admin-sdk** `approval.list` (query) / `approval.resolve` (mutation), actor-gated + feature-detected. **console** `/approvals` page + nav + panel.

## Why this shape

- **No list on `ConfirmationStore`.** It is single-use `put`/`take`; enumerating it (or adding a `list` that `take`-deletes) would consume/leak tokens. The engine keeps its own lossy projection; the authoritative blob stays in the ConfirmationStore.
- **Engine owns no crypto.** `agent.confirm()` performs the single-use token take, timing-safe hash verification, and `confirmationReceipt` forwarding. The engine is pure I/O coordination — it emits no Decisions and adds no Guards.
- **State fetched fresh at resolve time.** The out-of-band callback fires hours later; re-adjudication should run against current state. The engine stores neither state nor context → nothing reaches `intentHash`.

## Invariants preserved

- Replay-safety reused, not re-implemented: approve → `agent.confirm(accepted:true)` → existing hash-verify + single-use take + re-adjudicate. Double-resolve is idempotent (`ALREADY_RESOLVED`; the second `confirm` never runs). A tampered/expired token surfaces `CONFIRM_REJECTED` and marks the projection `expired`, never `approved`.
- No kernel/adapter-core changes — the engine builds on existing exports.

## Alternatives considered

- **Add `list()` to `ConfirmationStore`.** Rejected — conflates projection with single-use redemption, risks token leakage.
- **Store state/context in the registry to avoid the resolve-time callback.** Rejected — stale state + state-in-projection smell.

## Test coverage

`packages/approval-engine/tests/registry.test.ts` (put/get/list/markResolved, TTL, maxEntries) and `engine.test.ts` (request fan-out; approve/decline call confirm with fresh state; adversarial: unknown token, double-resolve idempotency, tampered-confirm → expired, channel-failure → CHANNEL_FAILED + projection still recorded). apps/console ApprovalsPanel test.

## Lifecycle

Webhook + console-log channels ship; Slack/Teams/email are documented adopter recipes. A Redis-backed `ApprovalRegistry` mirrors `createRedisConfirmationStore` when production parity is needed.
