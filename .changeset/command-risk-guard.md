---
"@adjudicate/primitives": minor
"@adjudicate/core": patch
---

feat(primitives): add `createCommandRiskGuard` + `command-classify` (classifyCommand/stripDangerousFlags) for CLI/terminal agents — REFUSE/REWRITE(flag-strip, taint preserved)/REQUEST_CONFIRMATION by command risk (ADR-123).

feat(core): add `validation.COMMAND_BLOCKED/COMMAND_FLAG_STRIPPED/COMMAND_SANITIZED` basis codes.
