/**
 * 032 — authority-graph data model + store + pure resolver.
 *
 * Asserts the resolver correctly evaluates ownership/authority predicates over
 * an injected snapshot (owns / joint / advisor / custodian), that the snapshot
 * serialization is deterministic/canonical, and that the resolver is PURE
 * (replay-stable) and returns a FACT — never a `Decision`.
 *
 * The graph is `principal —relationship→ resource —permits→ {actions, limits}`
 * (index §G), injected as an immutable snapshot (index §B/§D) — it is NOT a
 * decision layer and the resolver NEVER authorizes EXECUTE (index §C).
 */

import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  hashAuthorityGraph,
  resolveOwnership,
  type AuthorityGraph,
  type IntentEnvelope,
} from "../src/index.js";
import { canonicalSnapshot, sha256SnapshotCanonical } from "@adjudicate/canonical";

const at = "2026-06-18T12:00:00.000Z";

// A snapshot exercising every relationship label against a couple of resources.
const GRAPH: AuthorityGraph = {
  edges: [
    {
      principal: "user_42",
      relationship: "owns",
      resource: "acct_7",
      permits: { actions: ["pix.charge.refund", "pix.charge.create"], limits: { amountCentavos: 50000 } },
    },
    {
      principal: "user_99",
      relationship: "joint",
      resource: "acct_7",
      permits: { actions: ["pix.charge.create"] },
    },
    {
      principal: "advisor_1",
      relationship: "advisor",
      resource: "acct_7",
      permits: { actions: ["pix.charge.view"] },
    },
    {
      principal: "custodian_5",
      relationship: "custodian",
      resource: "acct_minor",
      permits: { actions: ["pix.charge.create"], limits: { amountCentavos: 1000 } },
    },
  ],
};

function env(refs?: Record<string, string>): IntentEnvelope {
  return buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 100 },
    actor: { principal: "llm", sessionId: "sess" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: at,
    resourceRefs: refs,
  });
}

describe("032 — authority-graph resolver evaluates ownership predicates", () => {
  const store = createAuthorityGraphStore(GRAPH);

  it("binds an `owns` principal to the resource (bound=true, owns relationship)", () => {
    const fact = resolveOwnership(store, env({ owner: "user_42", resource: "acct_7" }));
    expect(fact.bound).toBe(true);
    expect(fact.principal).toBe("user_42");
    expect(fact.resource).toBe("acct_7");
    expect(fact.relationships).toEqual(["owns"]);
    expect(fact.permits).toEqual(["pix.charge.refund", "pix.charge.create"]);
    expect(fact.edges).toHaveLength(1);
    expect(fact.edges[0]?.permits.limits).toEqual({ amountCentavos: 50000 });
  });

  it("binds a `joint` principal (shared ownership) on the same resource", () => {
    const fact = resolveOwnership(store, env({ owner: "user_99", resource: "acct_7" }));
    expect(fact.bound).toBe(true);
    expect(fact.relationships).toEqual(["joint"]);
    expect(fact.permits).toEqual(["pix.charge.create"]);
  });

  it("binds an `advisor` principal (read/recommend authority only)", () => {
    const fact = resolveOwnership(store, env({ owner: "advisor_1", resource: "acct_7" }));
    expect(fact.bound).toBe(true);
    expect(fact.relationships).toEqual(["advisor"]);
    expect(fact.permits).toEqual(["pix.charge.view"]);
  });

  it("binds a `custodian` principal on a different resource", () => {
    const fact = resolveOwnership(store, env({ owner: "custodian_5", resource: "acct_minor" }));
    expect(fact.bound).toBe(true);
    expect(fact.relationships).toEqual(["custodian"]);
    expect(fact.edges[0]?.permits.limits).toEqual({ amountCentavos: 1000 });
  });

  it("does NOT bind a principal to a resource it has no edge on (no IDOR)", () => {
    // user_42 owns acct_7 but NOT acct_minor → unbound (the IDOR class this closes).
    const fact = resolveOwnership(store, env({ owner: "user_42", resource: "acct_minor" }));
    expect(fact.bound).toBe(false);
    expect(fact.relationships).toEqual([]);
    expect(fact.permits).toEqual([]);
    expect(fact.edges).toEqual([]);
  });

  it("does NOT bind an unknown principal", () => {
    const fact = resolveOwnership(store, env({ owner: "attacker", resource: "acct_7" }));
    expect(fact.bound).toBe(false);
  });

  it("yields an unbound fact (never throws) when resource-refs are absent", () => {
    const fact = resolveOwnership(store, env(undefined));
    expect(fact.principal).toBeNull();
    expect(fact.resource).toBeNull();
    expect(fact.bound).toBe(false);
    expect(fact.edges).toEqual([]);
  });

  it("honors custom ref keys (bespoke per-kind resource-ref names)", () => {
    const e = buildEnvelope({
      kind: "pix.charge.refund",
      payload: {},
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-2",
      createdAt: at,
      resourceRefs: { account: "acct_7", holder: "user_42" },
    });
    const fact = resolveOwnership(store, e, { principalKey: "holder", resourceKey: "account" });
    expect(fact.bound).toBe(true);
    expect(fact.relationships).toEqual(["owns"]);
  });

  it("de-duplicates relationships/permits when multiple edges match a pair", () => {
    const dupGraph: AuthorityGraph = {
      edges: [
        { principal: "p", relationship: "owns", resource: "r", permits: { actions: ["a", "b"] } },
        { principal: "p", relationship: "owns", resource: "r", permits: { actions: ["b", "c"] } },
        { principal: "p", relationship: "joint", resource: "r", permits: { actions: ["a"] } },
      ],
    };
    const fact = resolveOwnership(
      createAuthorityGraphStore(dupGraph),
      env({ owner: "p", resource: "r" }),
    );
    expect(fact.bound).toBe(true);
    expect(fact.relationships).toEqual(["owns", "joint"]); // de-duped, snapshot order
    expect(fact.permits).toEqual(["a", "b", "c"]); // unioned, de-duped, snapshot order
    // `edges` is the matched subset VERBATIM (all three match the pair) — only
    // the derived `relationships`/`permits` projections are de-duplicated.
    expect(fact.edges).toHaveLength(3);
  });
});

describe("032 — the resolver returns a FACT, never a Decision (index §B)", () => {
  const store = createAuthorityGraphStore(GRAPH);

  it("the fact carries NO Decision discriminant (`kind`) and never authorizes", () => {
    const fact = resolveOwnership(store, env({ owner: "user_42", resource: "acct_7" })) as Record<
      string,
      unknown
    >;
    // A fact is not a Decision: it has no `kind`/`basis` and cannot reach EXECUTE.
    expect(fact).not.toHaveProperty("kind");
    expect(fact).not.toHaveProperty("basis");
    // Only the predicate-fact fields are present.
    expect(Object.keys(fact).sort()).toEqual(
      ["bound", "edges", "permits", "principal", "relationships", "resource"].sort(),
    );
  });
});

describe("032 — the resolver is PURE (replay-stable; no clock/RNG/IO)", () => {
  const store = createAuthorityGraphStore(GRAPH);

  it("two calls on the same (graph, envelope) produce a deep-equal fact", () => {
    const e = env({ owner: "user_42", resource: "acct_7" });
    const a = resolveOwnership(store, e);
    const b = resolveOwnership(store, e);
    expect(a).toEqual(b);
    // A fresh store over the same snapshot resolves identically too (replay).
    const c = resolveOwnership(createAuthorityGraphStore(GRAPH), e);
    expect(c).toEqual(a);
  });

  it("re-running over a recorded (canonical) snapshot is bit-identical", () => {
    // Record the snapshot via the canonical serializer, re-parse, re-resolve →
    // the fact must be identical (replayability §D #5).
    const recorded = canonicalSnapshot(GRAPH);
    const replayedGraph = JSON.parse(recorded) as AuthorityGraph;
    const e = env({ owner: "user_42", resource: "acct_7" });
    expect(resolveOwnership(createAuthorityGraphStore(replayedGraph), e)).toEqual(
      resolveOwnership(store, e),
    );
  });
});

describe("032 — the store is an immutable injected snapshot (index §B/§D)", () => {
  it("freezes the captured snapshot — a caller cannot mutate edges in place", () => {
    const mutable: AuthorityGraph = {
      edges: [{ principal: "p", relationship: "owns", resource: "r", permits: { actions: [] } }],
    };
    const store = createAuthorityGraphStore(mutable);
    expect(Object.isFrozen(store.graph.edges)).toBe(true);
    expect(() => {
      (store.graph.edges as { push: (x: unknown) => void }).push({});
    }).toThrow();
  });

  it("captures a snapshot copy — later mutation of the source array does not leak", () => {
    const source: AuthorityGraph = {
      edges: [{ principal: "p", relationship: "owns", resource: "r", permits: { actions: [] } }],
    };
    const store = createAuthorityGraphStore(source);
    // Mutating the ORIGINAL array after construction must not change the store.
    (source.edges as Array<unknown>).push({
      principal: "x",
      relationship: "owns",
      resource: "r",
      permits: { actions: [] },
    });
    expect(store.graph.edges).toHaveLength(1);
  });
});

describe("032 — snapshot serialization is deterministic & canonical", () => {
  it("hashAuthorityGraph rides @adjudicate/canonical (sha256SnapshotCanonical)", () => {
    expect(hashAuthorityGraph(GRAPH)).toBe(sha256SnapshotCanonical(GRAPH));
  });

  it("is key-order insensitive (canonical key sort)", () => {
    const reordered: AuthorityGraph = {
      edges: [
        // Same edges, every object key written in a different order.
        {
          permits: { limits: { amountCentavos: 50000 }, actions: ["pix.charge.refund", "pix.charge.create"] },
          resource: "acct_7",
          relationship: "owns",
          principal: "user_42",
        } as AuthorityGraph["edges"][number],
        { permits: { actions: ["pix.charge.create"] }, resource: "acct_7", relationship: "joint", principal: "user_99" },
        { permits: { actions: ["pix.charge.view"] }, resource: "acct_7", relationship: "advisor", principal: "advisor_1" },
        {
          permits: { limits: { amountCentavos: 1000 }, actions: ["pix.charge.create"] },
          resource: "acct_minor",
          relationship: "custodian",
          principal: "custodian_5",
        },
      ],
    };
    expect(hashAuthorityGraph(reordered)).toBe(hashAuthorityGraph(GRAPH));
  });

  it("edge ORDER is significant (arrays preserve order — distinct snapshots hash distinctly)", () => {
    const swapped: AuthorityGraph = { edges: [GRAPH.edges[1]!, GRAPH.edges[0]!, GRAPH.edges[2]!, GRAPH.edges[3]!] };
    expect(hashAuthorityGraph(swapped)).not.toBe(hashAuthorityGraph(GRAPH));
  });

  it("a different principal/resource/relationship/permit changes the hash (tamper-evident)", () => {
    const tampered: AuthorityGraph = {
      edges: [{ ...GRAPH.edges[0]!, principal: "attacker" }, GRAPH.edges[1]!, GRAPH.edges[2]!, GRAPH.edges[3]!],
    };
    expect(hashAuthorityGraph(tampered)).not.toBe(hashAuthorityGraph(GRAPH));
  });

  it("throws on a non-finite limit (RFC 8785 §3.2.2.3, no silent collision)", () => {
    const bad: AuthorityGraph = {
      edges: [{ principal: "p", relationship: "owns", resource: "r", permits: { actions: [], limits: { x: Infinity } } }],
    };
    expect(() => hashAuthorityGraph(bad)).toThrow();
  });
});
