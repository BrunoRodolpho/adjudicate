# @adjudicate/approval-engine

## 0.1.0

### Minor Changes

- Initial release (ADR-122). Reference human-approval orchestration for
  REQUEST_CONFIRMATION flows — pluggable channels + a replay-safe resume via
  adapter-core `confirm()`, with an `ApprovalRegistry` projection separate from
  the single-use `ConfirmationStore`.
