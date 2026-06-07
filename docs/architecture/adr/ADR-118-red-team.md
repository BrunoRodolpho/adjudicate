# ADR-118 — `@adjudicate/red-team`: deterministic adversarial testing

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** new `@adjudicate/red-team` package, `@adjudicate/cli` (`red-team` command), `@adjudicate/admin-sdk` (`governance.redTeam`), `apps/console` (Red-Team panel)
- **Related:** ADR-110 (conformance), ADR-115 (pack trust), `packages/cli` simulate/scenario infra

## Context

Hand-written scenario fixtures cover the cases an author thought of. We want an automated, deterministic adversarial pass that derives attack scenarios from a Pack's *declared surface* and asserts the policy's kernel-level defenses hold — runnable in CI as a regression gate.

## Decision

Ship `@adjudicate/red-team` with three structural generators — `generatePromptInjectionEnvelopes`, `generateTaintEscalationEnvelopes`, `generateToolScopeViolationEnvelopes` — that produce `RedTeamScenario[]` (each embedding a canonical intent + state plus a `defense.acceptable` set of Decision kinds). `runRedTeam(pack, scenarios)` runs each through the **pure** `adjudicateWithTrace`, classifying defended / escaped / error; an **escape** is any Decision kind outside `acceptable` (notably a clean `EXECUTE`). CLI: `adjudicate red-team --pack <module>` (exit 2 on any escape/error). Console: a pre-computed `RedTeamReport` is wired into the route handler and surfaced via `governance.redTeam` + a `RedTeamPanel`.

## Why this shape

- **Structural, seeded generation.** Attack vectors derive from `intents × taint.minimumFor × planner probing` — there is no stored prompt or payload schema to introspect. Same seed → byte-identical scenarios (copied LCG, no `Math.random`).
- **Own runner, not `runDiff`.** `runDiff`/`adjudicateWithTrace` diff-mode discards `decision_basis`; red-team needs "which defense fired", and its `defense.acceptable` is a *set* (vs the CLI Scenario's single `expected.kind`). It reuses `loadPackFromModule` + the kernel, but keeps a dedicated runner.
- **Library depends only on `@adjudicate/core`.** Generators take a pack-shaped object; the CLI command (in `@adjudicate/cli`) composes red-team + `loadPackFromModule`. No cycle.

## Invariants preserved

- Kernel untouched: zero new basis codes, no enum changes, no envelope changes. Red-team is a *consumer* of the existing taint/auth/business vocabulary.
- Determinism: generation + the assertion run are pure; a property test asserts byte-identical scenarios and reports across runs.
- Honest scope boundary (documented): "defended" = "did not reach a clean EXECUTE under these structurally-derived inputs", not a proof of total safety; tool-scope enforcement is a *bridge* concern, so that vector asserts only policy-level non-EXECUTE.

## Alternatives considered

- **Extend the CLI `ScenarioSchema.expected` to a set + reuse `runDiff`.** Rejected — mutates a shared simulate-facing schema and `runDiff` drops basis.
- **LLM-as-judge fuzzing.** Rejected — non-deterministic, violates the green-at-commit + replay contract.

## Test coverage

`packages/red-team/tests/`: generators, runner (defended/escaped/error + render), determinism property (fast-check), **PIX lighthouse conformance fixture (0 escapes)**, adversarial leaky-pack (harness catches escapes). `packages/cli/tests/red-team.test.ts`: CLI against PIX → 0 escapes, JSON output. `apps/console`: RedTeamPanel component test.

## Lifecycle

Three vectors in v0; new vectors land additively (MINOR). The seed contract and `RedTeamReport` shape are stable.
