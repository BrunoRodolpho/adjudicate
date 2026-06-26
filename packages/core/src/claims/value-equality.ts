/**
 * Conservative, fail-CLOSED structural value equality — the SINGLE canonical
 * implementation shared by the two determinism-critical equality gates of the
 * Claims runtime. Both gates need the IDENTICAL notion of "are these two values
 * provably the same proposition, or do they CONTRADICT?", so the helper lives
 * here ONCE rather than being duplicated per gate (a one-sided edit to two
 * verbatim copies would silently diverge two determinism-critical decisions):
 *
 *   - **P2 `SAME_TYPE_VALUE_CONFLICT`** (`./consistency.ts`): does a
 *     same-`(subject, type)` pair assert the SAME value (an idempotent duplicate
 *     read) or CONTRADICT (→ ESCALATE)?
 *   - **H3 same-key ledger conflict** (`./evidence-ledger.ts`): does a second
 *     write to an evidence key DISAGREE with the first (→ `UNKNOWN`) or is it an
 *     idempotent re-read?
 *
 * **INTERNAL to `@adjudicate/core`.** This module is deliberately NOT added to
 * the `claims/index.ts` barrel (no `export * from "./value-equality.js"`), so it
 * is never re-exported from the package entry — the frozen public API surface
 * stays byte-identical (§Q "do not widen the frozen public API"). Sharing a
 * PRIVATE module between two in-package consumers does not widen the API; only a
 * barrel re-export would. Pure & self-contained — no clock/RNG/IO, no
 * kernel-downstream import (§R kernel purity: `adjudicate → claustrum →
 * ibatexas`, never backward).
 */

/**
 * Is `o` a PLAIN object — i.e. one whose prototype is `Object.prototype` or
 * `null` (an object literal / `Object.create(null)`)? A `Date`/`Map`/`Set`/class
 * instance is NOT plain (its prototype is some other constructor's). Used by
 * `sameValue` to refuse structural comparison of exotics it cannot safely equate.
 */
export function isPlainObject(o: object): boolean {
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

/**
 * CONSERVATIVE, fail-CLOSED structural equality for two values — returns `true`
 * ONLY when the two values are PROVABLY equal (primitives via `Object.is`; arrays
 * and PLAIN objects compared structurally, recursively); it returns `false`
 * whenever equality cannot be established. Failing to `false` is the SAFE
 * direction for BOTH gates: an un-equatable pair is treated as a CONTRADICTION
 * (P2 `SAME_TYPE_VALUE_CONFLICT` → ESCALATE; H3 same-key conflict → `UNKNOWN`),
 * never silently rendered as a duplicate / missed conflict.
 *
 * NaN is treated as equal-to-NaN here (`Object.is` already does this) — a re-read
 * of a NaN-valued field is not a conflict. `+0` and `-0` are treated as the SAME
 * value (an idempotent re-read, not a contradiction). `canonicalJson` is
 * deliberately NOT used here (it throws on `NaN`).
 *
 * **Non-plain objects are REJECTED (R1 conservative fail-closed):** a
 * `Date`/`Map`/`Set`/class instance that is not reference-identical (`Object.is`
 * already short-circuited that) returns `false`, because own-enumerable-key
 * compare would FALSELY equate distinct exotics — e.g. two different `Date`s each
 * expose zero own enumerable keys, so a naive own-key compare returns `true` and
 * MISSES the conflict. Rejecting them surfaces the conflict.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // Object.is already treats NaN===NaN as equal; +0/-0 as distinct — treat -0
  // and +0 as the same value for an idempotent re-read (not a contradiction).
  if (a === 0 && b === 0) return true;

  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false; // primitives already handled above.

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;

  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameValue(a[i], b[i])) return false;
    }
    return true;
  }

  // Conservative fail-closed (R1): structurally compare ONLY plain objects. A
  // non-plain object (Date/Map/Set/class instance) that reached here is NOT
  // reference-identical, and own-key compare would falsely equate distinct
  // exotics → a MISSED conflict. Reject so distinct exotics surface the conflict.
  // (Reference-identical exotics already returned true via Object.is.) Plain
  // objects — Object.prototype or null-prototype — fall through to the structural
  // own-key compare below.
  if (!isPlainObject(a as object) || !isPlainObject(b as object)) return false;

  // Plain objects: compare own enumerable keys structurally.
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!sameValue(aObj[k], bObj[k])) return false;
  }
  return true;
}
