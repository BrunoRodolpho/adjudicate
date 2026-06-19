import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canonicalJson, sha256Canonical } from "../src/hash.js";
import { buildEnvelope, deriveIntentHash } from "../src/envelope.js";
import { DEFAULT_ORIGIN, type Origin } from "../src/taint.js";
import { capabilityPreimage } from "../src/capability.js";

describe("canonicalJson", () => {
  it("produces identical output regardless of key order", () => {
    const a = { kind: "x", payload: { a: 1, b: 2 }, taint: "SYSTEM" };
    const b = { taint: "SYSTEM", payload: { b: 2, a: 1 }, kind: "x" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("omits undefined fields", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(
      canonicalJson({ a: 1 }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("is deterministic on arbitrary JSON-safe objects (key-order independent)", () => {
    // JSON-safe = finite numbers only. fc.object()'s default fc.double() emits
    // NaN/Infinity, which canonicalize() (correctly, per RFC 8785 §3.2.2.3)
    // throws on — so the default generator is NOT JSON-safe and made this
    // determinism property flaky once the non-finite throw landed. Constrain the
    // leaf values to genuinely JSON-safe primitives (the non-finite throw has its
    // own dedicated test).
    const jsonSafeValues = [
      fc.boolean(),
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.string(),
      fc.constant(null),
    ];

    function reverseKeys(v: unknown): unknown {
      if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
      const obj = v as Record<string, unknown>;
      const reversed: Record<string, unknown> = {};
      for (const k of Object.keys(obj).reverse()) {
        reversed[k] = reverseKeys(obj[k]);
      }
      return reversed;
    }

    fc.assert(
      fc.property(fc.object({ maxDepth: 3, values: jsonSafeValues }), (obj) => {
        // Structural key shuffle — different insertion order, identical content.
        const shuffled = reverseKeys(obj) as typeof obj;
        expect(canonicalJson(obj)).toBe(canonicalJson(shuffled));
      }),
      { numRuns: 2_000 },
    );
  });
});

describe("sha256Canonical", () => {
  it("returns a 64-char hex digest", () => {
    const h = sha256Canonical({ kind: "x", payload: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable under key reordering", () => {
    expect(
      sha256Canonical({ a: 1, b: { c: 2, d: 3 } }),
    ).toBe(sha256Canonical({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("differs when payload differs", () => {
    expect(sha256Canonical({ a: 1 })).not.toBe(sha256Canonical({ a: 2 }));
  });
});

describe("buildEnvelope — intentHash determinism", () => {
  it("produces the same hash for identical inputs with the same createdAt", () => {
    const a = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "add_item", input: { sku: "XYZ" } },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const b = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "add_item", input: { sku: "XYZ" } },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    expect(a.intentHash).toBe(b.intentHash);
  });

  it("hash is insensitive to payload key reorder", () => {
    const a = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "add_item", input: { sku: "XYZ", qty: 2 } },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const b = buildEnvelope({
      kind: "order.tool.propose",
      payload: { input: { qty: 2, sku: "XYZ" }, toolName: "add_item" },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    expect(a.intentHash).toBe(b.intentHash);
  });

  it("hash changes when payload changes", () => {
    const a = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "add_item", input: { sku: "A" } },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const b = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "add_item", input: { sku: "B" } },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });
});

describe("021 — capabilityPreimage binds the authorizing intentHash", () => {
  const env = buildEnvelope({
    kind: "pix.charge.create",
    payload: { chargeId: "chg_1", amount: 100 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-cap",
    createdAt: "2026-04-23T12:00:00.000Z",
  });
  const kernelId = "kernel://prod/us-east-1";

  it("is deterministic for the same unsigned body (golden-vector-locked bytes)", () => {
    expect(capabilityPreimage({ intentHash: env.intentHash, kernelId })).toBe(
      capabilityPreimage({ intentHash: env.intentHash, kernelId }),
    );
  });

  it("changing the bound intentHash CHANGES the pre-image (§D #4 binding)", () => {
    const a = capabilityPreimage({ intentHash: env.intentHash, kernelId });
    const other = buildEnvelope({
      kind: "pix.charge.create",
      payload: { chargeId: "chg_2", amount: 100 }, // different payload → different intentHash
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-cap",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    expect(other.intentHash).not.toBe(env.intentHash);
    const b = capabilityPreimage({ intentHash: other.intentHash, kernelId });
    expect(a).not.toBe(b);
  });

  it("changing the kernelId CHANGES the pre-image", () => {
    expect(capabilityPreimage({ intentHash: env.intentHash, kernelId })).not.toBe(
      capabilityPreimage({ intentHash: env.intentHash, kernelId: "kernel://other" }),
    );
  });

  it("a descriptive field (the original envelope's createdAt) does NOT enter the pre-image", () => {
    // The capability binds the intentHash, and intentHash already EXCLUDES
    // createdAt. Rebuilding the authorizing envelope with a wildly different
    // createdAt (same nonce/payload/etc.) yields the SAME intentHash → the SAME
    // capability pre-image. createdAt-style metadata cannot drift cap bytes.
    const sameIntentDifferentClock = buildEnvelope({
      kind: "pix.charge.create",
      payload: { chargeId: "chg_1", amount: 100 },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-cap",
      createdAt: "2029-12-31T23:59:59.999Z",
    });
    expect(sameIntentDifferentClock.intentHash).toBe(env.intentHash);
    expect(
      capabilityPreimage({ intentHash: sameIntentDifferentClock.intentHash, kernelId }),
    ).toBe(capabilityPreimage({ intentHash: env.intentHash, kernelId }));
  });
});

describe("041 — origin is bound into the intentHash pre-image", () => {
  const base = {
    kind: "order.tool.propose" as const,
    payload: { toolName: "add_item", input: { sku: "XYZ" } },
    actor: { principal: "llm" as const, sessionId: "s-1" },
    taint: "UNTRUSTED" as const,
    nonce: "n-origin",
    createdAt: "2026-04-23T12:00:00.000Z",
  };

  it("stamps the supplied origin onto the envelope", () => {
    const env = buildEnvelope({ ...base, origin: "Retrieved" });
    expect(env.origin).toBe("Retrieved");
  });

  it("defaults origin to DEFAULT_ORIGIN ('LLM') when omitted", () => {
    const env = buildEnvelope(base);
    expect(env.origin).toBe(DEFAULT_ORIGIN);
    expect(env.origin).toBe("LLM");
  });

  it("changing origin changes the intentHash (origin is INSIDE the pre-image)", () => {
    const origins: Origin[] = ["Human", "Retrieved", "ExternalAPI", "LLM", "System"];
    const hashes = origins.map(
      (origin) => buildEnvelope({ ...base, origin }).intentHash,
    );
    // Every distinct origin produces a distinct hash — none collide.
    expect(new Set(hashes).size).toBe(origins.length);
  });

  it("createdAt stays EXCLUDED even with origin in the recipe", () => {
    const a = buildEnvelope({ ...base, origin: "Human", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = buildEnvelope({ ...base, origin: "Human", createdAt: "2029-12-31T23:59:59.999Z" });
    expect(a.createdAt).not.toBe(b.createdAt);
    expect(a.intentHash).toBe(b.intentHash);
  });

  it("deriveIntentHash re-derives the SAME hash (binds origin, fail-closed on a flipped origin)", () => {
    const env = buildEnvelope({ ...base, origin: "System" });
    // Faithful re-derivation matches.
    expect(deriveIntentHash(env)).toBe(env.intentHash);
    // An LLM that post-hoc flips the declared origin no longer re-derives the
    // stored hash — §D #4 binding holds for the origin axis.
    const forged = { ...env, origin: "Human" as const };
    expect(deriveIntentHash(forged)).not.toBe(env.intentHash);
  });

  it("the intentHash recipe is exactly {version,kind,payload,nonce,actor,taint,origin} — createdAt + intentHash excluded", () => {
    const env = buildEnvelope({ ...base, origin: "ExternalAPI" });
    const recomputed = sha256Canonical({
      version: env.version,
      kind: env.kind,
      payload: env.payload,
      nonce: env.nonce,
      actor: env.actor,
      taint: env.taint,
      origin: env.origin,
    });
    expect(env.intentHash).toBe(recomputed);
  });
});

describe("031 — resourceRefs is canonical-drop-safe in the intentHash pre-image", () => {
  const base = {
    kind: "pix.charge.refund" as const,
    payload: { chargeId: "chg_1", amount: 100 },
    actor: { principal: "llm" as const, sessionId: "s-1" },
    taint: "UNTRUSTED" as const,
    nonce: "n-refs",
    createdAt: "2026-04-23T12:00:00.000Z",
    origin: "LLM" as const,
  };

  it("a no-resource-refs envelope omits the key and hashes as the post-041 recipe (DROP-SAFETY)", () => {
    const env = buildEnvelope(base);
    expect("resourceRefs" in env).toBe(false);
    expect(Object.keys(env)).toHaveLength(9);
    // Byte-identical to the explicit post-041 7-field recipe (no resourceRefs key).
    const post041 = sha256Canonical({
      version: env.version,
      kind: env.kind,
      payload: env.payload,
      nonce: env.nonce,
      actor: env.actor,
      taint: env.taint,
      origin: env.origin,
    });
    expect(env.intentHash).toBe(post041);
  });

  it("explicit `resourceRefs: undefined` hashes identically and carries no key", () => {
    const withUndef = buildEnvelope({ ...base, resourceRefs: undefined });
    const without = buildEnvelope(base);
    expect("resourceRefs" in withUndef).toBe(false);
    expect(withUndef.intentHash).toBe(without.intentHash);
  });

  it("present resourceRefs change the hash and are attached to the envelope", () => {
    const env = buildEnvelope({ ...base, resourceRefs: { owner: "user_42", account: "acct_7" } });
    expect(env.resourceRefs).toEqual({ owner: "user_42", account: "acct_7" });
    expect(env.intentHash).not.toBe(buildEnvelope(base).intentHash);
  });

  it("resourceRefs key order does not affect the hash (recursive canonical sort)", () => {
    const a = buildEnvelope({ ...base, resourceRefs: { owner: "user_42", account: "acct_7" } });
    const b = buildEnvelope({ ...base, resourceRefs: { account: "acct_7", owner: "user_42" } });
    expect(a.intentHash).toBe(b.intentHash);
  });

  it("deriveIntentHash binds resourceRefs — a flipped owner no longer re-derives (§D #4)", () => {
    const env = buildEnvelope({ ...base, resourceRefs: { owner: "user_42", account: "acct_7" } });
    expect(deriveIntentHash(env)).toBe(env.intentHash);
    const forged = { ...env, resourceRefs: { owner: "user_99", account: "acct_7" } };
    expect(deriveIntentHash(forged)).not.toBe(env.intentHash);
  });

  it("the v3-with-refs recipe is exactly {version,…,origin,resourceRefs}", () => {
    const env = buildEnvelope({ ...base, resourceRefs: { owner: "user_42" } });
    const recomputed = sha256Canonical({
      version: env.version,
      kind: env.kind,
      payload: env.payload,
      nonce: env.nonce,
      actor: env.actor,
      taint: env.taint,
      origin: env.origin,
      resourceRefs: env.resourceRefs,
    });
    expect(env.intentHash).toBe(recomputed);
  });
});
