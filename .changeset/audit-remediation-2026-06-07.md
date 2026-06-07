---
"@adjudicate/audit-postgres": patch
"@adjudicate/core": patch
"@adjudicate/primitives": patch
"@adjudicate/conformance": patch
"@adjudicate/anthropic": minor
"@adjudicate/openai": minor
"@adjudicate/pack-deployments-approval": patch
---

Adversarial-audit remediation (464db38→804af8f review):

- **audit-postgres (release-blocker):** migration `010-add-v5-metadata.sql` widens
  the `record_version` CHECK to `IN (1,2,3,4,5)` and adds the nullable
  `metadata_jsonb` column. Core stamps `record_version=5` unconditionally, so
  against a DB migrated through 009 every audit insert previously failed Postgres
  23514. The sink now persists and recovers `metadata` losslessly.
- **primitives:** `createTokenBudgetGuard` now fails **closed** on a non-finite
  over-budget meter — `+Infinity` ≥ any budget crosses (REFUSE) instead of
  passing through. NaN/negative remain non-crossing.
- **conformance:** `generateAiBom` array comparators are now total-order (equal
  keys → 0), so the `bomDigest` is reproducible for inputs with duplicate keys.
- **anthropic / openai:** the provider adapters now declare and forward the
  agent-loop seams `onTokenUsage`, `memoryStore`, `enrichContext`,
  `deriveMemoryWriteback`, `configSeal`, and `traceSink` — previously these were
  unreachable through the bridges (token budget, memory, and config-seal were
  effectively dead via the published adapters).
- **pack-deployments-approval:** total-order tie-break for the model/prompt gate;
  README documents three release-gate limitations (opt-in regression score,
  carbon clamp has no data-residency allow-list, model/prompt gate fires on first
  deploy).
- **core:** documents and pins the v5 metadata cross-version verification contract
  (a pre-v5 verifier would falsely flag a metadata-bearing record as tampered).
