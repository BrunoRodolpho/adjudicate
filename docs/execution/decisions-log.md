# Adjudicate — Overnight Run Decisions Log

> Every non-obvious decision made during the unattended run.

## D-001 — Keep `@adjudicate/primitives` package name (don't rename)

**Context.** The planning prompt suggested renaming to `@adjudicate/policy-primitives`. The existing package is `@adjudicate/primitives`.

**Decision.** Keep `@adjudicate/primitives` as-is. Expand its factory surface (add `createRewriteGuard`, `createConfirmGuard`, `createEscalateGuard`, `createIdempotencyGuard`) in-place.

**Rationale.** Renaming forces every adopter import to break for a cosmetic gain. The package is `0.1.0-experimental`, but discipline says don't churn names without reason. Architectural intent (L2 surface) is preserved.

**Impact.** §8 roster reflects `packages/primitives/**`, not `packages/policy-primitives/**`.

## D-002 — Defer OpenAI + Vercel AI adapters

**Context.** Workstream D lists new OpenAI and Vercel AI adapters; "What stays delayed" lists OpenAI adapter as deferred. Contradiction.

**Decision.** Resolve toward "what stays delayed." Plan in-scope: extract `@adjudicate/adapter-core`, refactor Anthropic onto it, ship `@adjudicate/adapter-conformance`. Out-of-scope: new provider adapter packages.

**Rationale.** User's explicit deferral wins. The reshape (D #1–#3, #6–#8) gives full leverage when adapters are written; new providers ship in v0.6+.

## D-003 — Single integration branch vs per-task branches

**Context.** Overnight prompt says: "Work on a single branch `feat/v0.2-to-v0.5-unattended` OR per-task branches merged into `dev` — your call based on what's lower-friction."

**Decision.** Single branch `claude/unruffled-bassi-305034` (current branch). Single-concern commits per task ID. Tag at each milestone.

**Rationale.** Per-task branches with merge overhead would slow execution. Single branch with disciplined single-concern commits preserves bisectability without the merge cost.

## D-004 — Portuguese strings: locale package + RuntimeContext wiring

**Context.** 8 PT-BR strings in `packages/core/src/kernel/*.ts`. Need externalization.

**Decision.** Create `@adjudicate/locales-pt-BR` package exporting `refusalMessages` map keyed by stable string IDs. Add `RefusalMessages` interface to `@adjudicate/core` with English defaults. Wire opt-in via `RuntimeContext.refusalMessages`. Keep English as the default in core; PT-BR available as opt-in.

**Rationale.** Per Decision-Making Authority hierarchy: "If it's a 'should this be additive or replacement' question → choose additive." Additive: English default, PT-BR opt-in.

**Impact.** Default behavior changes from PT-BR (current) to English in v0.5. Adopters retain PT-BR via 1-line opt-in. Documented in v0.5 CHANGELOG.
