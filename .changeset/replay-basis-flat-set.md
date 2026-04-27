---
"@adjudicate/audit": minor
---

Replay harness now classifies basis drift, not just `decision.kind` divergence.

Before: `replay()` reported `report.matched === report.total` whenever every record's stored `decision.kind` matched the re-adjudicated kind. A Pack patch that renamed a refusal code, changed a basis category, or added a new pass-basis without changing the kind passed replay silently — exactly the governance-drift signal the framework's strongest claim depends on detecting.

- **NEW: `ReplayMismatchKind` union** — `"DECISION_KIND" | "BASIS_DRIFT" | "REFUSAL_CODE_DRIFT"`. Reports route to different runbook severities.
- **CHANGED: `ReplayMismatch` shape** gains `kind` and an optional `basisDelta: { missing, extra }` carrying the symmetric difference of the flat-set comparison. The previous `{ intentHash, expected, actual }` fields are preserved.
- **Comparison rule (in this priority order):**
  1. Different `decision.kind` → `DECISION_KIND` mismatch.
  2. Same kind, different flat-set of `category:code` basis strings → `BASIS_DRIFT`.
  3. Both REFUSE, same kind + basis flat-set, different `refusal.code` → `REFUSAL_CODE_DRIFT`.
  4. Otherwise matched.
- **Flat-set semantics:** order is ignored; `basis.detail` is ignored. Matches the `Postgres.intent_audit.decision_basis` shape (text[] of `category:code`).
- **NEW: `classify(intentHash, expected, actual)`** — pure helper exported alongside `replay()` so adopters can write cross-record audits without re-implementing the rule.
- **NEW: 11 unit tests** (`packages/audit/tests/replay.test.ts`) — basis order tolerance, basis.detail tolerance, missing-and-extra delta, BASIS_DRIFT precedence over REFUSAL_CODE_DRIFT, plus the acceptance test from the plan (5-record corpus with one swapped refusal code).
- **NEW: 1 property test** (`packages/core/tests/kernel/invariants/replay-determinism.property.test.ts`, 5 000 runs) — replaying the same policy against any (taint × default × guard × payload) tuple produces a Decision that matches the stored one. The classifier rule is duplicated inline in the property test to avoid a package-graph cycle (audit → core).

**Migration:** consumers that destructured `mismatches[i].expected/actual` continue to work. Consumers that switched on `mismatches[i].kind` get a richer signal: BASIS_DRIFT and REFUSAL_CODE_DRIFT are now distinguishable, and the `basisDelta.missing/extra` arrays surface the exact codes that drifted.
