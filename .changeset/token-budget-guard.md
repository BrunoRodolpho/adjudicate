---
"@adjudicate/primitives": minor
"@adjudicate/adapter-core": minor
"@adjudicate/anthropic": minor
"@adjudicate/openai": minor
"@adjudicate/admin-sdk": minor
---

feat(primitives): add `createTokenBudgetGuard` — pure guard that REFUSE/DEFERs on per-session/per-tenant token budgets, reading the counter from adopter state S (ADR-120).

feat(adapter-core): `AssistantTurn.usage` + `onTokenUsage` hook surface provider token usage per turn (the adopter folds it into state S).

feat(anthropic,openai): map provider token usage onto `AssistantTurn.usage`.

feat(admin-sdk): add `governance.tokenBudget` for the console Token Budget panel.
