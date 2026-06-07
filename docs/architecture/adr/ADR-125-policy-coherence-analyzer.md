# ADR-125 — Tier-3 PolicyCoherenceAnalyzer (AJD-301)

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/analyze` (Tier-3 seam + `policyCoherenceAnalyzer`), `@adjudicate/admin-sdk` (`governance.policyCoherence`), apps/console (PolicyCoherencePanel)
- **Related:** ADR-109 (analyzers / AJD codes), ADR-105 (guard metadata)

## Context

As adopters compose Packs, contradictory or dead policy surface emerges: an intent the planner never offers, an intent the planner offers but the Pack doesn't declare, a system-only intent the planner exposes (guaranteed REFUSE). The roadmap called this a "prompt-conflict analyzer," but **prompts are not in the Pack** (rendered at runtime by `PromptRenderer`), so this is **structural coherence**, not prompt judgement — and not LLM-as-judge.

## Decision

Add a Tier-3 analyzer tier: `Tier3Analyzer` + `PlannerProbe` types, `DEFAULT_TIER3_ANALYZERS`, and a `plannerProbes`-gated block in `analyzePolicy` (mirrors the Tier-2 `sourceFiles` gate). `policyCoherenceAnalyzer` (code **AJD-301**) does pure Pack inspection + planner probing and emits, disambiguated by `detail.rule`:

- **phantom_intent** (error) — a probed `allowedIntent` not in `pack.intents`.
- **unreachable_intent** (warning) — a declared, **non-system-only** intent never offered across the probes (system-only kinds, i.e. elevated taint minimum, are intentionally excluded).
- **system_taint_contradiction** (warning) — a system-only kind the planner DOES offer.
- **threshold_conflict** (note) — two same-phase threshold guards with mutually-unsatisfiable bounds; the field is not statically resolvable (Tier 3 can't see `extract`), so it's a low-confidence note.
- **planner_probe_error** (note) — a throwing planner, surfaced not crashed.

Surfaced via `governance.policyCoherence` + a console `PolicyCoherencePanel`.

## Why this shape

- **Decidable checks only; no false positives on the lighthouse.** PIX produces zero AJD-301 errors: its system-only `pix.charge.confirm` is excluded from unreachable-intent, and its thresholds are all lower-bounds. The high-confidence threshold-conflict ("same extracted field") and basis-reachability are explicitly deferred to a future Tier-2 AST analyzer (reserved AJD-202) because `extract`/`basis()` are opaque closures at Tier 3.
- **Deterministic.** Pure over (pack, probes); planner probes are wrapped; diagnostics are sorted by `(rule, message)` so output is byte-stable regardless of probe order. Offline tooling — never runs inside `adjudicate()`.
- **No core change.** One additive immutable `DiagnosticCode` (`AJD-301`); the closed `GuardDescription` union is consumed, not widened.

## Invariants preserved

- Kernel determinism untouched (analyzer is offline). Closed enums: only an additive AJD code. Tolerates unknown `GuardDescription` variants (ADR-105 forward-compat).

## Alternatives considered

- **LLM-as-judge over rendered prompts.** Rejected — non-deterministic; prompts aren't in the Pack.
- **Tier-2 AST for field-level threshold/basis resolution.** Deferred to reserved AJD-202; this item is the Tier-3 declarative/planner layer.

## Test coverage

`packages/analyze/tests/tier3.test.ts` — clean PIX (0 errors), each rule fixture (phantom/unreachable/system-taint/threshold-conflict/probe-error), determinism + probe-order-insensitivity, pipeline gating. apps/console PolicyCoherencePanel test.

## Lifecycle

AJD-301 immutable; severities may evolve per ADR-109. `detail.rule` is an additive sub-vocabulary. CLI `--tier 3 --probes` is a documented follow-up (probe fixtures carry state/context).
