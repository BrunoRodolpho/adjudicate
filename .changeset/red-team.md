---
"@adjudicate/red-team": minor
"@adjudicate/cli": minor
"@adjudicate/admin-sdk": minor
---

feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.
