import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Canonical } from "../src/index.js";

interface GoldenVector {
  readonly name: string;
  readonly input: unknown;
  readonly sha256: string;
}

const fixture = JSON.parse(
  readFileSync(new URL("../golden-vectors.json", import.meta.url), "utf-8"),
) as { readonly vectors: readonly GoldenVector[] };

describe("@adjudicate/canonical — golden vectors (cross-impl conformance lock)", () => {
  it("ships a non-empty vector set", () => {
    expect(fixture.vectors.length).toBeGreaterThan(0);
  });

  for (const v of fixture.vectors) {
    it(`sha256Canonical matches golden: ${v.name}`, () => {
      expect(sha256Canonical(v.input)).toBe(v.sha256);
    });
  }
});

describe("@adjudicate/canonical — canonical rules", () => {
  it("is key-order insensitive", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(sha256Canonical({ a: 1, b: 2 })).toBe(sha256Canonical({ b: 2, a: 1 }));
  });

  it("elides undefined fields ({a: undefined, b:1} hashes as {b:1})", () => {
    expect(sha256Canonical({ a: undefined, b: 1 })).toBe(sha256Canonical({ b: 1 }));
  });

  it("preserves null fields (distinct from undefined elision)", () => {
    expect(sha256Canonical({ a: null })).not.toBe(sha256Canonical({}));
  });

  it("preserves array order", () => {
    expect(sha256Canonical([1, 2, 3])).not.toBe(sha256Canonical([3, 2, 1]));
  });
});
