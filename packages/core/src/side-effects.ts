/**
 * Side-effect classification vocabulary.
 *
 * A small, closed taxonomy describing what an intent kind *does* to the world,
 * orthogonal to `CommandRiskCategory` (a shell-string taxonomy in
 * @adjudicate/primitives whose `network`/`credential`/`destructive` axes
 * describe command strings and lack the read/write distinction a blanket
 * taint-floor needs).
 *
 * Lives in core (not primitives) because `PackV0.sideEffects` references the
 * type, and core is the base layer — primitives depends on core, never the
 * reverse. The Layer-2 `createSideEffectTaintFloor` guard imports both symbols
 * from here.
 */

import type { Taint } from "./taint.js";

export type SideEffectClass = "none" | "read" | "write" | "destructive";

/**
 * Minimum taint required to perform each side-effect class — fail-closed by
 * construction: the more dangerous the class, the higher the trust demanded.
 *
 * LLM-proposed envelopes are always UNTRUSTED, so by default they clear only
 * the `none`/`read` floor; `write`/`destructive` must originate from an
 * elevated-trust actor (e.g. a SYSTEM webhook callback) or be re-routed by the
 * Pack's policy (confirm / escalate / rewrite) before any side effect. Adopters
 * override the table via the guard's `floor` option.
 */
export const DEFAULT_SIDE_EFFECT_FLOOR: Readonly<Record<SideEffectClass, Taint>> =
  Object.freeze({
    none: "UNTRUSTED",
    read: "UNTRUSTED",
    write: "TRUSTED",
    destructive: "SYSTEM",
  });
