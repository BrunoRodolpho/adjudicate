/**
 * A fast-check arbitrary for JSON-safe, deterministically-serializable values
 * (TestReviewer-008). Used to fuzz envelope hashing with deeply-nested payloads
 * instead of the trivial `{ x: 1 }` the property tests previously used.
 *
 * Leaves are restricted to `string | integer | boolean | null`. This is the
 * "keep JSON-safe leaves" caveat from the cycle-2 flaky catch: `undefined`,
 * `NaN`, `±Infinity`, functions, symbols, and bigint do NOT survive a
 * canonical-JSON round-trip, so generating them would make the hash fuzz
 * non-deterministic / throw. Floats are deliberately excluded too — `-0`,
 * `1e21`, and precision edges have ambiguous canonical forms; integers are
 * fully deterministic and exercise the same nesting paths.
 *
 * Depth and breadth are capped (maxDepth 3, ≤4 children) so the suite stays
 * fast and deterministic.
 */
import fc from "fast-check";

const { jsonSafeValue } = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  ),
  jsonSafeValue: fc.oneof(
    { maxDepth: 3, withCrossShrink: true },
    tie("leaf"),
    fc.array(tie("jsonSafeValue"), { maxLength: 4 }),
    fc.dictionary(fc.string(), tie("jsonSafeValue"), { maxKeys: 4 }),
  ),
}));

/** A recursive JSON-safe value (scalar, array, or nested object). */
export const jsonSafeValueArb: fc.Arbitrary<unknown> = jsonSafeValue;

/** A recursive JSON-safe object payload (top level is always an object). */
export const jsonSafePayloadArb: fc.Arbitrary<Record<string, unknown>> =
  fc.dictionary(fc.string(), jsonSafeValueArb, { maxKeys: 5 });
