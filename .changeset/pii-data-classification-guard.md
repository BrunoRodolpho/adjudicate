---
"@adjudicate/core": minor
"@adjudicate/primitives": minor
"@adjudicate/analyze": minor
"@adjudicate/admin-sdk": minor
---

feat(primitives): add `createDataClassificationGuard` (PII/PHI redaction & refusal). REWRITE masks matched payload fields (taint preserved); REFUSE blocks. Runtime sensitivity tier + redacted fields ride in `DecisionBasis.detail`.

feat(core): widen `GuardDescription` with the additive `data_classification` variant; add `validation.PII_DETECTED/PII_REDACTED/PII_BLOCKED` basis codes (ADR-117).

feat(analyze): AJD-104 also flags a `data_classification` REWRITE guard with empty `scannedFields`.

feat(admin-sdk): add `governance.piiClassificationStats` — aggregates data-classification dispositions by (sensitivityLevel × disposition) for the console.
