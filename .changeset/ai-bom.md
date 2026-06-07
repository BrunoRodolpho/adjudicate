---
"@adjudicate/conformance": minor
"@adjudicate/cli": minor
"@adjudicate/admin-sdk": minor
---

feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

feat(cli): add `adjudicate pack bom <path>`.

feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.
