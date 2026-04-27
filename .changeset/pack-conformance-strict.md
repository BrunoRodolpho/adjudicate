---
"@adjudicate/core": major
---

Pack conformance — REFUSE-by-default, Plan⊆Pack validation, drift across all decision kinds. Resolves #1, #3, #4 (partial), #18, #20, top-priority D + F.

The pre-T4 conformance surface only caught REFUSE refusal-code drift, accepted any `policy.default`, and did not validate that a planner's `allowedIntents` matched the Pack's declared `intents`. The strongest claim of the framework — "the LLM cannot propose intents the Pack does not handle" — relied on adopter discipline. T4 closes the gaps.

**Breaking** — Packs that ship `policy.default = "EXECUTE"` without explicit opt-in now throw `PackConformanceError`. Within `0.1.0-experimental` this is a deliberate posture flip toward fail-safe defaults.

- **NEW: `assertPackConformance(pack, options?)` rejects `policy.default = "EXECUTE"`** unless `options.allowDefaultExecute === true`. The framework's recommended polarity is REFUSE; an EXECUTE default is the most direct authority leak and should be a deliberate, documented choice. Read-only Packs (search, summary) can opt in.
- **NEW: `installPack(pack, { allowDefaultExecute: true })`** threads the option through to conformance.
- **NEW: `assertPlanSubsetOfPack(plan, pack)`** — pure helper that throws `PlanConformanceError` if `plan.allowedIntents` contains an intent absent from `pack.intents`. Catches a planner advertising a mutation the Pack never claimed to handle (typically a renaming regression).
- **NEW: `safePlan(planner, classification, pack?)`** — third optional arg. When supplied, every `plan()` call asserts both `assertPlanReadOnly` (existing) and `assertPlanSubsetOfPack` (new). The pre-T4 two-arg form continues to work; only adopters who pass a pack get the stricter check.
- **NEW: `PlanConformanceError.intentsLeaked`** — companion to `mutatingToolsLeaked`. Lists intents that violated the pack-subset relation.
- **NEW: optional `Pack.signals: readonly string[]`** — DEFER signal vocabulary. When declared, every DEFER Decision the Pack emits must use a `signal` from this list; `withBasisAudit` records `defer_signal_drift` for unknown signals. Cross-pack signal collision detection is left to a future Phase-2 registry.
- **CHANGED: `withBasisAudit` extends drift detection across all decision kinds.** Previously it only inspected REFUSE; now every basis whose `category:code` is outside `BASIS_CODES` records `basis_vocabulary_drift`, REWRITE with `rewritten.taint` of higher rank than `envelope.taint` records `rewrite_taint_regression`, and DEFER with a signal outside declared `pack.signals` records `defer_signal_drift`. Decisions are still **not** blocked — drift is observed, not enforced.
- **NEW: `taintRank(taint)` exported** from `@adjudicate/core` so adopters can perform their own rank comparisons. Used internally by `withBasisAudit`.
- **NEW: `KERNEL_REFUSAL_CODES` gains `"ledger_replay_suppressed"`** (T1 carryover) so `withBasisAudit` does not flag it as Pack drift.
- **NEW: 6 unit tests** (`pack-conformance.test.ts`) for default-EXECUTE rejection, signals shape validation, basis-vocabulary drift on EXECUTE.
- **NEW: 9 unit tests + 1 property test** (`plan-allowed-intents.test.ts`, 5 000 runs) for `assertPlanSubsetOfPack` and the safePlan optional pack arg.
- **NEW: 2 install-pack tests** for the new `allowDefaultExecute` plumbing.

**Migration:**
- A Pack with `policy.default = "EXECUTE"`: pass `{ allowDefaultExecute: true }` to `assertPackConformance` / `installPack`, OR change to `default: "REFUSE"` and add an explicit EXECUTE guard.
- An adopter using `safePlan(planner, classification)`: no migration needed; the pack-subset check is opt-in via a third arg.
- An adopter writing a custom Pack with mixed-vocabulary basis codes: any code outside `BASIS_CODES` now emits `basis_vocabulary_drift` telemetry. The decision still flows; treat the new event as a runbook signal.
