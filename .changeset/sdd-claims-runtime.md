---
"@adjudicate/core": minor
---

Add the SDD claims runtime (Q1–Q5), re-exported from `@adjudicate/core`: the 3-valued `ClaimVerdict` + 4 `TurnTerminal`s, the per-type `EvidenceRequirement` schema, the `EvidenceLedger`, the soundness validator (`claimAllowed`), the consistency gate (`checkConsistency` / `ConsistencyClaim` / `SuppressionRecord`), and the three-kernel `Read`/`Action`/`Claims` interfaces (`runReadKernel`, `runClaimsKernel`) with the asymmetric Read+Action→Ledger→Claims→Renderer topology (`ASYMMETRIC_TOPOLOGY`). Purely additive — no existing export changed or removed.
