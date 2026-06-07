---
"@adjudicate/core": minor
"@adjudicate/observability": minor
"@adjudicate/admin-sdk": patch
"@adjudicate/audit-postgres": patch
---

feat(core): AuditRecord v5 adds optional `metadata` (EXCLUDED from auditHash) + `attachAuditMetadata` + an `adjudicateAndAudit({ metadataProvider })` seam (ADR-124).

feat(observability): hallucination scoring — `createHallucinationMetadataProvider` + `bucketHallucinationScore` + `adjudicate.hallucination.score`/`.bucket` semconv attributes.

fix(admin-sdk,audit-postgres): accept AuditRecord v5 (schema + row mapping).
