# ADR-120 — Token-budget guard + provider usage seam

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/primitives` (`createTokenBudgetGuard`), `@adjudicate/adapter-core` (`AssistantTurn.usage` + `onTokenUsage`), `@adjudicate/anthropic` + `@adjudicate/openai` (usage mapping), `@adjudicate/admin-sdk` (`governance.tokenBudget`), apps/console + apps/web
- **Related:** ADR-103 (runtime context), ADR-113 (adapter-core), ADR-108 (primitives)

## Context

Multi-iteration agent loops can run away on LLM token cost. Adopters want a per-session / per-tenant budget that the kernel enforces as a normal Decision (audited, replayable), not a side-channel hard-stop.

## Decision

- **`createTokenBudgetGuard({ extractSessionTokens, extractTenantTokens?, sessionBudget?, tenantBudget?, action?, deferSignal?, deferTimeoutMs?, userFacing? })`** in `@adjudicate/primitives` — a pure guard that REFUSEs (default) or DEFERs when consumed tokens cross a budget, reading the counter from adopter **state `S`**.
- **Adapter seam:** `AssistantTurn.usage?: { inputTokens?, outputTokens? }` + an `onTokenUsage` option fired by the loop after each `bridge.send`. The Anthropic and OpenAI bridges map their native `usage` onto it.
- **Console:** `governance.tokenBudget` (feature-detected) + a `TokenBudgetPanel`. **Web:** a Decision-Lab token-budget demo (EXECUTE under budget → REFUSE over).

## Why this shape

- **Roadmap correction:** the roadmap put `tokensConsumed` in `RuntimeContext`. Guards never receive `RuntimeContext`, and it is a singletons-only container — not decision-input data. So the counter lives in **state `S`** (which guards do receive). The adapter surfaces per-turn usage via `onTokenUsage`; the adopter folds it into the next `S`. Given a fixed `S` the decision is pure and replayable.
- **REFUSE default, DEFER opt-in.** A token DEFER has no natural external resume signal (unlike a webhook), so REFUSE is primary; DEFER parks on an adopter-emitted `token_budget_reset`.
- **No `GuardDescription` widening.** The guard is a numeric-crossing shape but spans two scopes, so it uses the sanctioned `{ kind: "opaque" }` metadata rather than the closed `threshold` variant. It reuses `business.RULE_VIOLATED` — no new basis code.
- **`AssistantTurn.usage` is additive and not hashed.** The adapter never mutates `S`; it only surfaces usage for the adopter to fold in.

## Invariants preserved

- `intentHash` untouched (token counters live in `S`, never in the envelope). Determinism: a fast-check property adjudicates a deep-frozen `S` twice → identical decisions, proving the guard never mutates state and has no hidden counter. NaN/Infinity are finite-guarded (no spurious crossing); a payload-injected fake count is ignored (the guard reads only `S`).
- The loop's `onTokenUsage` is defensive (a throwing observer cannot break the loop).

## Alternatives considered

- **Counter in `RuntimeContext`.** Rejected — guards can't see it; would make decisions non-replayable (hidden mutable state).
- **Hard-stop the loop instead of a guard.** Rejected as the primary mechanism — bypasses the kernel (no audit/basis/replay). A `maxIterations` cap may complement but not replace it.
- **Route token usage through `MetricsSink.recordResourceLimit`.** Deferred — the `resource` union is `"defer_quota"` only; widening it is a separate change.

## Test coverage

`packages/primitives/tests/token-budget-guard.{test,property,adversarial}.ts`; `packages/adapter-core/tests/on-token-usage.test.ts`; `packages/anthropic/tests/bridge-usage.test.ts`; `packages/openai/tests/bridge-openai.test.ts` (usage cases); `apps/console` TokenBudgetPanel test.

## Lifecycle

`@experimental` factory; `AssistantTurn.usage` + `onTokenUsage` are additive, backward-compatible adapter-surface additions.
