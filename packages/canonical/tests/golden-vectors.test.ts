import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  canonicalSnapshot,
  sha256Canonical,
  sha256SnapshotCanonical,
} from "../src/index.js";

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

  it("NFC-normalizes strings (NFD and NFC inputs hash identically) — DataReviewer-008", () => {
    const nfc = "caf\u00e9"; // NFC: e-acute precomposed U+00E9
    const nfd = "cafe\u0301"; // NFD: e + combining acute U+0301
    expect(nfc).not.toBe(nfd); // distinct code points...
    expect(sha256Canonical({ name: nfc })).toBe(sha256Canonical({ name: nfd })); // ...same hash
  });

  it("throws on non-finite numbers (no silent null collision) — CryptoReviewer-002", () => {
    expect(() => sha256Canonical({ x: NaN })).toThrow();
    expect(() => sha256Canonical({ x: Infinity })).toThrow();
    expect(() => sha256Canonical({ x: -Infinity })).toThrow();
    expect(() => sha256Canonical([1, NaN, 3])).toThrow();
  });
});

describe("@adjudicate/canonical — 021 capability pre-image lock", () => {
  // The capability pre-image (021) is `"adjudicate-capability-v1\n" +
  // sha256Canonical({ intentHash, kernelId })`. The inner body hash is pinned
  // as the `capability-preimage-body` golden vector above; here we lock the
  // FULL versioned pre-image string and its hash so capability signature bytes
  // can never drift (golden-vector-locked, like intentHash, §D #5). These
  // literals are GENUINELY derived from this canonicalizer — recompute below.
  const VERSION = "adjudicate-capability-v1";
  const body = {
    intentHash:
      "cd017dd347b4a8c4c748f7a064788f82eb30fd240d6667873b16cefeb4ed4bc0",
    kernelId: "kernel://prod/us-east-1",
  };
  const BODY_HASH =
    "3d99814d8a4f9be65fa840116d21e786180c9a72927e18ef2f9cf1724a03bf04";
  const PREIMAGE = `${VERSION}\n${BODY_HASH}`;
  const PREIMAGE_HASH =
    "a46e1275c0be33f5287fadfb9c21537892c3542b9c6080e93a722be91da280df";

  it("locks the canonical body hash (the inner pre-image component)", () => {
    expect(sha256Canonical(body)).toBe(BODY_HASH);
  });

  it("locks the full versioned pre-image STRING and its hash", () => {
    const preimage = `${VERSION}\n${sha256Canonical(body)}`;
    expect(preimage).toBe(PREIMAGE);
    expect(sha256Canonical(preimage)).toBe(PREIMAGE_HASH);
  });

  it("a different intentHash drives a different pre-image hash (binding)", () => {
    const other = `${VERSION}\n${sha256Canonical({ ...body, intentHash: "00".repeat(32) })}`;
    expect(other).not.toBe(PREIMAGE);
    expect(sha256Canonical(other)).not.toBe(PREIMAGE_HASH);
  });
});

describe("@adjudicate/canonical — 031 v3 resource-refs drop-safety", () => {
  // The envelope-hash recipe MINUS resourceRefs (the existing
  // `envelope-hash-recipe` golden vector). The v3 `envelope-with-resource-refs`
  // golden vector is this same object PLUS a resourceRefs map.
  const noRefs = {
    version: 2,
    kind: "order.submit",
    payload: { sku: "X", qty: 2 },
    nonce: "n-1",
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
  };
  const refs = { account: "acct_7", owner: "user_42" };

  it("undefined resourceRefs canonical-DROPS — hashes identically to no-refs", () => {
    // The load-bearing drop-safety property (031 §3/§7): an envelope with
    // resourceRefs explicitly `undefined` MUST hash like one without the key,
    // so post-041 envelopes never drift. Mirrors `attestation` elision.
    expect(sha256Canonical({ ...noRefs, resourceRefs: undefined })).toBe(
      sha256Canonical(noRefs),
    );
    // And byte-stable against the pinned no-refs golden vector.
    expect(sha256Canonical(noRefs)).toBe(
      "cd017dd347b4a8c4c748f7a064788f82eb30fd240d6667873b16cefeb4ed4bc0",
    );
  });

  it("PRESENT resourceRefs change the hash (refs are bound, not ignored)", () => {
    const withRefs = sha256Canonical({ ...noRefs, resourceRefs: refs });
    expect(withRefs).not.toBe(sha256Canonical(noRefs));
    // Matches the pinned v3 golden vector.
    expect(withRefs).toBe(
      "8368d0df30f07c8624f36eb26d2edbbd19364b0293f595e958e99e44135add40",
    );
  });

  it("resourceRefs key order is canonicalized (recursive key sort)", () => {
    expect(sha256Canonical({ ...noRefs, resourceRefs: { account: "acct_7", owner: "user_42" } })).toBe(
      sha256Canonical({ ...noRefs, resourceRefs: { owner: "user_42", account: "acct_7" } }),
    );
  });

  it("a different owner ref yields a different hash (tamper-evident, §D #4)", () => {
    expect(sha256Canonical({ ...noRefs, resourceRefs: refs })).not.toBe(
      sha256Canonical({ ...noRefs, resourceRefs: { ...refs, owner: "user_99" } }),
    );
  });
});

describe("@adjudicate/canonical — 032 authority-graph snapshot serialization", () => {
  // The 032 snapshot serializer (`canonicalSnapshot`/`sha256SnapshotCanonical`)
  // is a thin alias over `canonicalJson`/`sha256Canonical` — NOT a forked
  // canonicalizer. These tests pin that the authority-graph snapshot
  // (`principal —relationship→ resource —permits→ {actions, limits}`) rides the
  // existing canonical behavior (NFC, RangeError on non-finite, key-sort,
  // array-order) so a recorded snapshot replays bit-identically (invariant #5).
  const graph = {
    edges: [
      {
        principal: "user_42",
        relationship: "owns",
        resource: "acct_7",
        permits: { actions: ["pix.charge.refund"], limits: { amountCentavos: 50000 } },
      },
      {
        principal: "custodian_5",
        relationship: "custodian",
        resource: "acct_minor",
        permits: { actions: ["pix.charge.create"] },
      },
    ],
  };

  it("the snapshot aliases are byte-identical to the base encoder (no fork)", () => {
    expect(canonicalSnapshot(graph)).toBe(canonicalJson(graph));
    expect(sha256SnapshotCanonical(graph)).toBe(sha256Canonical(graph));
  });

  it("is edge-object key-order insensitive (recursive key sort)", () => {
    const reordered = {
      edges: [
        {
          permits: { limits: { amountCentavos: 50000 }, actions: ["pix.charge.refund"] },
          resource: "acct_7",
          relationship: "owns",
          principal: "user_42",
        },
        {
          permits: { actions: ["pix.charge.create"] },
          resource: "acct_minor",
          relationship: "custodian",
          principal: "custodian_5",
        },
      ],
    };
    expect(sha256SnapshotCanonical(reordered)).toBe(sha256SnapshotCanonical(graph));
  });

  it("preserves edge ARRAY order (distinct snapshots hash distinctly)", () => {
    const swapped = { edges: [graph.edges[1], graph.edges[0]] };
    expect(sha256SnapshotCanonical(swapped)).not.toBe(sha256SnapshotCanonical(graph));
  });

  it("NFC-normalizes principal/resource ids (NFD vs NFC) — DataReviewer-008", () => {
    const composed = "caf\u00e9"; // NFC: precomposed e-acute U+00E9
    const decomposed = "cafe\u0301"; // NFD: e + combining acute U+0301
    expect(composed).not.toBe(decomposed); // distinct code points...
    const nfc = { edges: [{ principal: composed, relationship: "owns", resource: "r", permits: { actions: [] } }] };
    const nfd = { edges: [{ principal: decomposed, relationship: "owns", resource: "r", permits: { actions: [] } }] };
    expect(sha256SnapshotCanonical(nfc)).toBe(sha256SnapshotCanonical(nfd)); // ...same hash
  });

  it("throws on a non-finite limit (RFC 8785 §3.2.2.3) — CryptoReviewer-002", () => {
    const bad = { edges: [{ principal: "p", relationship: "owns", resource: "r", permits: { actions: [], limits: { x: Infinity } } }] };
    expect(() => sha256SnapshotCanonical(bad)).toThrow();
  });

  it("a tampered principal/resource/relationship yields a different hash", () => {
    const tampered = { edges: [{ ...graph.edges[0], principal: "attacker" }, graph.edges[1]] };
    expect(sha256SnapshotCanonical(tampered)).not.toBe(sha256SnapshotCanonical(graph));
  });
});
