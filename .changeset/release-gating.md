---
"@adjudicate/pack-deployments-approval": minor
---

feat(pack-deployments-approval): release-gating extensions (Item 14) — regression-score-aware ESCALATE (aiEvalScore below threshold), carbon-budget region REWRITE (clamp to the greenest region, taint preserved), and AI model/prompt-change REQUEST_CONFIRMATION. New payload fields (aiEvalScore, region, modelId, promptVersion), constants (REGRESSION_ESCALATE_THRESHOLD, REGION_CARBON_RANK, GREENEST_REGION, greenestRegion), and guards. No kernel changes; existing scenarios unaffected (new gates are inert without the new fields).
