---
"@adjudicate/approval-engine": minor
"@adjudicate/admin-sdk": minor
---

feat(approval-engine): new @adjudicate/approval-engine — reference human-approval orchestration for REQUEST_CONFIRMATION flows with pluggable channels (webhook, console-log) and a replay-safe resume via adapter-core confirm(); ApprovalRegistry projection separate from the single-use ConfirmationStore (ADR-122).

feat(admin-sdk): add `approval.list` / `approval.resolve` for the console Approvals view.
