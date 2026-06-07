---
"@adjudicate/analyze": minor
"@adjudicate/admin-sdk": minor
---

feat(analyze): add Tier-3 PolicyCoherenceAnalyzer (AJD-301) — structural coherence checks (phantom/unreachable intent, system-taint contradiction, threshold-conflict note, planner-probe error) via pure pack inspection + planner probing; new `plannerProbes`/`tier3Analyzers` analyze options (ADR-125).

feat(admin-sdk): add `governance.policyCoherence` for the console Policy Coherence panel.
