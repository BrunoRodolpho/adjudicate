---
"@adjudicate/admin-sdk": minor
---

admin-sdk `governance.piiEvents` — event-level data-classification drill-down (ADR-129). New `createPiiEventsHandler` over the existing `AuditStore` returns individual PII disposition events (`intentHash`, `at`, `intentKind`, `decisionKind`, `sensitivityLevel`, `disposition`) newest-first, with optional `sensitivityLevel`/`disposition` filters, a `limit` (default 200, max 500) and a `truncated` flag. New schemas `PiiEventsQuerySchema`/`PiiEventSchema`/`PiiEventsResultSchema` (+ inferred types) reuse the existing `SensitivityLevel`/`PiiDisposition`/`DecisionKind` enums (no new/widened enums). The event row carries no redacted values or field paths — redaction by construction. Requires an authenticated actor (record-level data). Powers the console PII Events page and the public web transparency view; the existing aggregate `governance.piiClassificationStats`, the guard, and the kernel are unchanged.
