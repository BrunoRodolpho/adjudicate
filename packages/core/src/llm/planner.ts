/**
 * CapabilityPlanner — security-sensitive layer.
 *
 * Reads (state, context) and returns a Plan: which READ tools are visible,
 * which Intent kinds may be proposed, and which concepts are forbidden.
 *
 * This is where "what can the LLM even see right now?" is decided. A
 * misbehaving planner widens the attack surface. Adopters MUST unit-test
 * the planner at byte level — the PromptRenderer that consumes it is only
 * cosmetic.
 */

export interface Plan {
  /** READ tools the LLM may call directly this turn. */
  readonly visibleReadTools: ReadonlyArray<string>;
  /** Intent kinds the LLM may propose via the intent bridge. */
  readonly allowedIntents: ReadonlyArray<string>;
  /**
   * Free-text phrases the LLM is asked not to emit in this state.
   *
   * @deprecated v0.1.x — **advisory only, not enforced by the kernel**.
   * The `Plan` shape made a three-part promise (`visibleReadTools`,
   * `allowedIntents`, `forbiddenConcepts`) where the first two are
   * structurally enforced (the bridge refuses out-of-plan tool/intent
   * names) but the third is hope-based: the renderer only injects the
   * phrases into the system prompt and a motivated user can get the
   * model to emit them anyway. The asymmetry made the field misleading
   * on a security boundary — adopters reading the type believed the
   * framework enforced it.
   *
   * This field is **scheduled for removal at v1.0**. Adopters who need
   * post-hoc content moderation should run their own filter on the
   * assistant text before surfacing it; that's a content-moderation
   * concern outside this framework's scope (per ADR-105's discipline
   * around what the kernel does and does not own).
   *
   * Existing callers may keep populating an empty array `[]`; the
   * renderer continues to honor it for back-compat through v0.x.
   */
  readonly forbiddenConcepts: ReadonlyArray<string>;
}

export interface CapabilityPlanner<S, C = unknown> {
  plan(state: S, context: C): Plan;
}

/**
 * A trivial planner that returns the fixed plan it was constructed with.
 * Useful for tests and for adopters that want a hand-written plan per state.
 */
export function staticPlanner<S, C = unknown>(plan: Plan): CapabilityPlanner<S, C> {
  return { plan: () => plan };
}
