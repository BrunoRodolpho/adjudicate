/**
 * Golden vectors pinning the canonical-JSON SHA-256 algorithm in
 * `packages/core/src/hash.ts` against documented values. These vectors are
 * normative — they MUST also pass against any external (Rust/Go/Python)
 * re-implementation that claims to be byte-compatible with the
 * `intent-envelope-v2` spec at `docs/specs/canonical-json-hash.md`.
 *
 * If a change here is necessary, it implies either:
 *   (a) the hash recipe changed — which requires an envelope version bump
 *       (v2 → v3) plus a new spec document, or
 *   (b) the canonicalization algorithm changed — which is a breaking change
 *       to every existing audit row's `intentHash` and requires the same
 *       version bump path.
 *
 * In either case, do NOT mutate the existing constants — add new vectors
 * for the new version.
 */

import { describe, expect, it } from "vitest";
import { sha256Canonical } from "../src/hash.js";

interface GoldenVector {
  readonly label: string;
  readonly hashInput: unknown;
  readonly expectedHash: string;
  readonly notes: string;
}

const GOLDEN_VECTORS: ReadonlyArray<GoldenVector> = [
  {
    label: "v1 — minimal canonical envelope",
    hashInput: {
      version: 2,
      kind: "order.submit",
      payload: { sku: "X", qty: 1 },
      nonce: "n-golden-1",
      actor: { principal: "llm", sessionId: "s-golden-1" },
      taint: "UNTRUSTED",
    },
    expectedHash:
      "ccaaf1c710d6956f00b84cbed4fc8a31c148a9e3e1c932d21f377c472c690bc0",
    notes: "the baseline shape — published in canonical-json-hash.md",
  },
  {
    label: "v2 — same as v1 with payload+actor key order shuffled",
    hashInput: {
      version: 2,
      kind: "order.submit",
      payload: { qty: 1, sku: "X" },
      nonce: "n-golden-1",
      actor: { sessionId: "s-golden-1", principal: "llm" },
      taint: "UNTRUSTED",
    },
    expectedHash:
      "ccaaf1c710d6956f00b84cbed4fc8a31c148a9e3e1c932d21f377c472c690bc0",
    notes:
      "key-order independence — the canonicalization sorts keys; v2 hash MUST equal v1 hash byte-for-byte",
  },
  {
    label: "v3 — TRUSTED variant of the same logical action",
    hashInput: {
      version: 2,
      kind: "order.submit",
      payload: { sku: "X", qty: 1 },
      nonce: "n-golden-1",
      actor: { principal: "system", sessionId: "s-golden-1" },
      taint: "TRUSTED",
    },
    expectedHash:
      "cb045813218ec9e038242e29de76440c5d429397db1dbddbe2238ea4c5fb5440",
    notes:
      "taint and principal both feed the recipe — TRUSTED+system MUST hash differently from UNTRUSTED+llm even with identical kind/payload/nonce",
  },
  {
    label: "v4 — empty payload + SYSTEM taint",
    hashInput: {
      version: 2,
      kind: "system.heartbeat",
      payload: {},
      nonce: "n-golden-4",
      actor: { principal: "system", sessionId: "s-golden-4" },
      taint: "SYSTEM",
    },
    expectedHash:
      "f8780e5fe67820ad6744e7fe2afcdcd3140778638e3dba0fdd1db618707c15f1",
    notes:
      "{} is a valid payload — not equivalent to undefined or null",
  },
  {
    label: "v5 — nested arrays + UTF-8 (non-ASCII preserved literally)",
    hashInput: {
      version: 2,
      kind: "order.batch",
      payload: {
        items: [{ sku: "A" }, { sku: "B" }, { sku: "C" }],
        note: "café",
      },
      nonce: "n-golden-5",
      actor: { principal: "user", sessionId: "s-golden-5" },
      taint: "TRUSTED",
    },
    expectedHash:
      "838c9a8dc783131ac7d5eb00c4708dc5ae624145c6b6d77353a8e1a09842a347",
    notes:
      "RFC 8785 §3.3 mandates literal UTF-8 in strings, not \\uXXXX escapes — `café` MUST hash with bytes 'caf\\xc3\\xa9' inline, not 'caf\\u00e9'",
  },
  {
    label:
      "v6 — null preserved, object-level undefined omitted (canonicalization rule)",
    hashInput: {
      version: 2,
      kind: "order.cancel",
      payload: { reason: null, optional: undefined, note: "ok" },
      nonce: "n-golden-6",
      actor: { principal: "llm", sessionId: "s-golden-6" },
      taint: "UNTRUSTED",
    },
    expectedHash:
      "ca446cbbb5d08a2eeb7b3ed762600a253aee654c66cd07f4bfeaea4b11b28026",
    notes:
      "{reason: null} preserves the null; {optional: undefined} omits the key entirely — see canonical-json-hash.md §2.2",
  },
];

describe("canonical-JSON SHA-256 golden vectors (normative — see docs/specs/canonical-json-hash.md)", () => {
  for (const vector of GOLDEN_VECTORS) {
    it(`${vector.label} → ${vector.expectedHash.slice(0, 12)}…`, () => {
      const actual = sha256Canonical(vector.hashInput);
      expect(actual).toBe(vector.expectedHash);
    });
  }

  it("hashes are 64-char lowercase hex (matches the JSON Schema pattern)", () => {
    const pattern = /^[a-f0-9]{64}$/;
    for (const vector of GOLDEN_VECTORS) {
      expect(vector.expectedHash).toMatch(pattern);
    }
  });

  it("v6 (object-level undefined omitted) hashes identically to its undefined-removed equivalent", () => {
    // Pins canonical-json-hash.md §2.2: {a: undefined} and {} hash identically.
    const withUndefined = {
      version: 2,
      kind: "order.cancel",
      payload: { reason: null, optional: undefined, note: "ok" },
      nonce: "n-golden-6",
      actor: { principal: "llm", sessionId: "s-golden-6" },
      taint: "UNTRUSTED",
    };
    const withoutUndefined = {
      version: 2,
      kind: "order.cancel",
      payload: { reason: null, note: "ok" },
      nonce: "n-golden-6",
      actor: { principal: "llm", sessionId: "s-golden-6" },
      taint: "UNTRUSTED",
    };
    expect(sha256Canonical(withUndefined)).toBe(
      sha256Canonical(withoutUndefined),
    );
  });

  it("array undefined → null (not omitted) — canonicalization rule §2.2", () => {
    const withUndefinedInArray = sha256Canonical([1, undefined, 3]);
    const withNullInArray = sha256Canonical([1, null, 3]);
    expect(withUndefinedInArray).toBe(withNullInArray);

    // Sanity: this is NOT the same as the array with the middle element
    // omitted entirely — order matters for arrays.
    const withMiddleOmitted = sha256Canonical([1, 3]);
    expect(withUndefinedInArray).not.toBe(withMiddleOmitted);
  });
});
