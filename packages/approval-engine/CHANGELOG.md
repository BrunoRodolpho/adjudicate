# @adjudicate/approval-engine

## 0.2.0

### Minor Changes

- 5c1460d: feat(approval-engine): add `createRedisApprovalRegistry` (+ `CreateRedisApprovalRegistryOptions`, `ApprovalRedisClient`) — a Redis-backed `ApprovalRegistry` implementing the same `put`/`get`/`list`/`markResolved` interface as the in-memory reference, for restart-durable approval projections. Stores ONLY the display projection (never the authoritative envelope blob — that stays in the single-use ConfirmationStore). `markResolved` is a guarded, idempotent read-modify-write; the residual GET+SET TOCTOU is a display-projection race only (the real single-use guarantee lives in `ConfirmationStore.take()` inside `agent.confirm()`). The adopter injects a minimal `set/get/del/keys` client — no hard dependency on a concrete Redis client. ADR-136.

  feat(admin-sdk): add read-only `approval.history` and `approval.chain` queries (+ `ApprovalHistoryQuery`/`ApprovalHistoryEntry`/`ApprovalHistoryResult` and `ApprovalChainQuery`/`ApprovalChainStepKind`/`ApprovalChainStep`/`ApprovalChainResult` schemas; optional `AdminContext.approvalPort.history`/`.chain`). `approval.history` projects resolved/expired approvals from the registry; `approval.chain` walks the FROZEN `AuditRecord.supersedes` lineage (confirmation_resolved / defer_resumed) into request → resolved → resumed. Both are actor-gated and `PRECONDITION_FAILED` when the optional port members are unwired (`approval.list`/`resolve` unchanged). `resolvedBy`/`actor` are CLAIMED (forgeable header until OIDC); the chain surfaces token PRESENCE only, never the value. ADR-136.

- 2892100: feat(approval-engine): new @adjudicate/approval-engine — reference human-approval orchestration for REQUEST_CONFIRMATION flows with pluggable channels (webhook, console-log) and a replay-safe resume via adapter-core confirm(); ApprovalRegistry projection separate from the single-use ConfirmationStore (ADR-122).

  feat(admin-sdk): add `approval.list` / `approval.resolve` for the console Approvals view.

### Patch Changes

- Updated dependencies [58655cb]
- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/adapter-core@0.3.0
  - @adjudicate/core@1.3.0

## 0.1.0

### Minor Changes

- Initial release (ADR-122). Reference human-approval orchestration for
  REQUEST_CONFIRMATION flows — pluggable channels + a replay-safe resume via
  adapter-core `confirm()`, with an `ApprovalRegistry` projection separate from
  the single-use `ConfirmationStore`.
