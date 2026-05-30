/**
 * PolicyBundle — the pluggable policy surface that drives adjudicate().
 *
 * An adopter builds one PolicyBundle per domain (order, appointment, shipment).
 * The kernel remains state-agnostic; the bundle carries every domain rule.
 *
 * Guards run in four categories, evaluated in this fixed order:
 *   state → taint → auth → business
 *
 * (Per ADR-104 — the T8 reorder placed taint ahead of auth so UNTRUSTED
 * inputs short-circuit before any auth-guard side effect runs. The
 * code-enforced order in `_adjudicateImpl` is the source of truth; this
 * doc and any others must match it.)
 *
 * Each guard returns `Decision | null`. `null` means "this guard has no opinion —
 * continue evaluating." A non-null Decision short-circuits.
 *
 * Guards may carry optional `GuardMetadata` (see below) describing their
 * authorship and semantic shape. The kernel reads the metadata at trace
 * emission time so audit, learning, and analyzer tooling can identify the
 * matched guard with a stable name. Per ADR-105, metadata is structurally
 * additive — guards without metadata remain first-class forever.
 */

import type { Decision } from "../decision.js";
import type { IntentEnvelope } from "../envelope.js";
import type { TaintPolicy } from "../taint.js";

export type Guard<K extends string, P, S> = (
  envelope: IntentEnvelope<K, P>,
  state: S,
) => Decision | null;

export interface PolicyBundle<K extends string, P, S> {
  readonly stateGuards: ReadonlyArray<Guard<K, P, S>>;
  readonly authGuards: ReadonlyArray<Guard<K, P, S>>;
  /** Declares the minimum Taint required per intent kind. */
  readonly taint: TaintPolicy;
  readonly business: ReadonlyArray<Guard<K, P, S>>;
  /**
   * Behavior when every guard returns null.
   *  - "REFUSE": fail-safe default (recommended — aligns with Refusal-by-Design)
   *  - "EXECUTE": fail-open default (use only for read-only or confirmation intents)
   */
  readonly default: "REFUSE" | "EXECUTE";
}

// ─── GuardMetadata — closed semantic-interoperability vocabulary ────────────

/**
 * Symbol-keyed slot where `withMetadata` attaches `GuardMetadata`. Symbol
 * (not string) so the metadata cannot collide with adopter-defined function
 * properties or accidentally serialize through `JSON.stringify`. Use
 * `readGuardMetadata(g)` rather than reaching for the symbol directly.
 *
 * Re-exported from the package barrel under the same name. The symbol's
 * identity is shared across the framework — re-importing the package twice
 * (workspace + node_modules) would produce two symbols and metadata would
 * not round-trip; this is a packaging concern adopters do not normally hit.
 */
export const GuardMetadataSymbol = Symbol.for(
  "@adjudicate/core/guard-metadata",
);

/**
 * Closed semantic-interoperability vocabulary describing a guard's shape.
 *
 * The discriminator is `kind`. Per ADR-105:
 *   1. The built-in variant set is closed for interoperability guarantees,
 *      but tooling MUST tolerate unknown variants for forward compatibility
 *      and private ecosystem extensions.
 *   2. Variants are additive and discriminated.
 *   3. Existing variants are immutable once released.
 *   8. `opaque.note` is a human-only operator/debugger breadcrumb —
 *      analyzers MUST NOT parse it.
 *
 * The `opaque` variant is the explicit non-semantic escape hatch — use it
 * when a guard does not fit any structured variant rather than inventing
 * fake precision.
 */
export type GuardDescription =
  | {
      readonly kind: "threshold";
      /** The numeric threshold the guard compares against. */
      readonly threshold: number;
      /** Comparator operator; mirrors `ThresholdGuardOptions.comparator`. */
      readonly comparator: ">=" | "<=" | ">" | "<";
      /**
       * Decision kind the guard emits when the threshold is crossed —
       * **optional**. The L2 `createThresholdGuard` factory does not
       * introspect `onCross`; Pack authors who want analyzers to reason
       * about reachability (P2-2 REWRITE-scope check, P1-1 `analyzePolicy`)
       * can declare it explicitly via `withMetadata({ description: { kind:
       * "threshold", emits: "ESCALATE", ... } })`. Analyzers seeing this
       * field absent treat the guard as opaque on the emit axis.
       */
      readonly emits?: Decision["kind"];
    }
  | {
      readonly kind: "state_defer";
      /** Wire signal the guard parks the intent on. */
      readonly signal: string;
      /** DEFER timeout (ms). */
      readonly timeoutMs: number;
    }
  | {
      readonly kind: "system_taint";
      /** Intent kinds requiring elevated taint per the policy. */
      readonly systemOnlyKinds: ReadonlyArray<string>;
    }
  | {
      readonly kind: "rewrite";
      /**
       * Whitelist of payload field paths the guard may modify when emitting
       * REWRITE. Static REWRITE-scope checks (P2-2) verify guards do not
       * mutate fields outside this list. Dotted paths: `["amountCentavos"]`
       * for a top-level field, `["items.0.qty"]` for nested array entries.
       */
      readonly mutatesPayloadFields: ReadonlyArray<string>;
    }
  | {
      readonly kind: "opaque";
      /**
       * Human-only operator/debugger breadcrumb. **Analyzers MUST NOT parse
       * this field** — it carries no semantic meaning. Per ADR-105 rule 8.
       */
      readonly note?: string;
    };

/**
 * Authorship + semantic metadata attached to a guard via `withMetadata`.
 * Every field is optional — guards without metadata remain first-class
 * forever (ADR-105 rule 7).
 *
 * - `name`: stable display name. Surfaces in `AdjudicationTraceEntry.guardName`
 *   and `LearningEvent.guardId`. When absent, both fields fall back to the
 *   underlying `Function.name` (and may be empty for anonymous closures).
 * - `author`: free-text identifier. Conventional values: an email, a team
 *   handle, or a name. Not parsed by tooling.
 * - `since`: ISO date or version string identifying when the guard was
 *   added. Conventional but not structurally enforced.
 * - `description`: structured semantic description. **Optional** — required
 *   presence would force fake metadata creation on user-authored guards
 *   and lightweight wrappers. L2 factories (createThresholdGuard,
 *   createStateDeferGuard) populate this automatically; Pack authors may
 *   override or omit. Analyzers seeing a guard with `name` but no
 *   `description` treat it identically to `{ kind: "opaque" }`.
 */
export interface GuardMetadata {
  readonly name?: string;
  readonly author?: string;
  readonly since?: string;
  readonly description?: GuardDescription;
}

/**
 * Attach `GuardMetadata` to a guard.
 *
 * **Identity-preserving.** Returns the same function object — the returned
 * guard is `===`-equal to the input guard, so stack traces, referential
 * equality, memoization, and registry semantics are all preserved.
 * Wrapping is prohibited; analyzer correctness depends on this.
 *
 * **Per-field immutable, additively composable.** The metadata slot itself
 * is attached on first call and remains non-configurable thereafter; each
 * individual field is also non-configurable / non-writable once set. This
 * lets composition work — the canonical case is
 * `nameGuard(createThresholdGuard(...))`, where the L2 factory attaches
 * `description` and `nameGuard` later attaches `name`. Both succeed
 * because they write disjoint fields.
 *
 * Idempotent on identical-value reattachment: `withMetadata(g, { name: "x" })`
 * twice is a no-op. Conflicting reattachment (same field, different value)
 * throws TypeError. Per-field overrides require composing a fresh guard
 * via `(...args) => g(...args)` and re-attaching from scratch.
 */
export function withMetadata<G extends (...args: never[]) => unknown>(
  guard: G,
  metadata: GuardMetadata,
): G {
  // Attach the slot once (non-configurable, non-writable). The slot object
  // itself is mutable via Object.defineProperty per field below — sealing
  // it would prevent additive composition.
  let slot = (guard as unknown as Record<symbol, unknown>)[
    GuardMetadataSymbol
  ] as Record<string, unknown> | undefined;
  if (slot === undefined) {
    slot = {};
    Object.defineProperty(guard, GuardMetadataSymbol, {
      value: slot,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  // Per-field defineProperty: enumerable so readGuardMetadata returns a
  // useful object; non-configurable + non-writable so individual fields
  // cannot be mutated post-attachment.
  //
  // Empty-string `name` is skipped rather than attached: an empty name is
  // indistinguishable from "no name set" at read-time (both produce an
  // empty/absent guardName in trace entries and LearningEvents) and would
  // silently shadow a meaningful Function.name. Throws TypeError on explicit
  // empty string to match the surrounding strict-overwrite style.
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (key === "name" && value === "") {
      throw new TypeError(
        "withMetadata: 'name' must be a non-empty string (empty string passed).",
      );
    }
    const existing = slot[key];
    if (existing !== undefined) {
      if (existing === value) continue; // idempotent reattachment
      throw new TypeError(
        `withMetadata: refusing to overwrite metadata field '${key}' on guard (existing value differs from new value).`,
      );
    }
    Object.defineProperty(slot, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return guard;
}

/**
 * Read `GuardMetadata` from a guard, or `undefined` if no metadata was
 * attached. Per ADR-105 rule 7, returning `undefined` is a permanent valid
 * state — analyzers must not assume metadata is present.
 */
export function readGuardMetadata(
  guard: (...args: never[]) => unknown,
): GuardMetadata | undefined {
  const slot = (guard as unknown as Record<symbol, unknown>)[
    GuardMetadataSymbol
  ];
  return slot as GuardMetadata | undefined;
}
