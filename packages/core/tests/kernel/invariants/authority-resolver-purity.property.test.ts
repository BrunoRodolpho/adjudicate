/**
 * Invariant (032): the authority-graph resolver is a PURE function over the
 * injected snapshot, and adding it changes NO part of the closed 6-outcome
 * `Decision` algebra (index §B/§C/§D, invariants #2 and #5).
 *
 * Two load-bearing claims, both non-vacuous (fast-check fuzzes the graph,
 * the resource-refs, and the (principal, resource) pair):
 *
 *   1. PURITY / REPLAY — `resolveOwnership(store, env)` is a deterministic
 *      function of `(snapshot, envelope)` only. Re-running it (and re-running it
 *      over a snapshot round-tripped through the canonical serializer) yields a
 *      deep-equal fact. No clock/RNG/IO is consulted, so the kernel that later
 *      injects this fact replays bit-identically (§D #5). The resolver source
 *      is additionally asserted to reference none of `Date.now`/`Math.random`/IO.
 *
 *   2. FACT-NOT-DECISION — the resolver returns a FACT (predicate results),
 *      never a `Decision`: it carries no `kind` discriminant, so it can never
 *      reach EXECUTE (only the kernel authorizes — index §B). The `DecisionKind`
 *      union is still EXACTLY the six ratified outcomes (no 7th, no
 *      `confidence`/`metadata` field — invariant #2).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  hashAuthorityGraph,
  resolveOwnership,
  type AuthorityGraph,
  type AuthorityRelationship,
  type DecisionKind,
} from "@adjudicate/core";
import { canonicalSnapshot } from "@adjudicate/canonical";

const relationshipArb = fc.constantFrom<AuthorityRelationship>(
  "owns",
  "joint",
  "advisor",
  "custodian",
);

const idArb = fc.constantFrom("p1", "p2", "p3", "r1", "r2", "r3");

const edgeArb = fc.record({
  principal: idArb,
  relationship: relationshipArb,
  resource: idArb,
  permits: fc.record({
    actions: fc.uniqueArray(fc.constantFrom("a", "b", "c", "d"), { maxLength: 4 }),
    limits: fc.option(
      fc.dictionary(
        fc.constantFrom("amountCentavos", "velocity"),
        fc.integer({ min: 0, max: 1_000_000 }),
      ),
      { nil: undefined },
    ),
  }),
});

const graphArb: fc.Arbitrary<AuthorityGraph> = fc
  .array(edgeArb, { maxLength: 8 })
  .map((edges) => ({ edges }));

const refsArb = fc.option(
  fc.record({ owner: idArb, resource: idArb }),
  { nil: undefined },
);

describe("invariant (032): authority resolver is pure & replay-stable", () => {
  it("same (snapshot, envelope) → deep-equal fact, including after canonical round-trip", () => {
    fc.assert(
      fc.property(graphArb, refsArb, (graph, refs) => {
        const envelope = buildEnvelope({
          kind: "k",
          payload: { n: 1 },
          actor: { principal: "llm", sessionId: "s" },
          taint: "UNTRUSTED",
          nonce: "n-1",
          createdAt: "2026-06-18T00:00:00.000Z",
          resourceRefs: refs,
        });
        const a = resolveOwnership(createAuthorityGraphStore(graph), envelope);
        const b = resolveOwnership(createAuthorityGraphStore(graph), envelope);
        expect(b).toEqual(a);

        // Replay over the snapshot recorded via the canonical serializer.
        const replayed = JSON.parse(canonicalSnapshot(graph)) as AuthorityGraph;
        const c = resolveOwnership(createAuthorityGraphStore(replayed), envelope);
        expect(c).toEqual(a);

        // The recorded snapshot hash is stable too.
        expect(hashAuthorityGraph(replayed)).toBe(hashAuthorityGraph(graph));

        // The fact NEVER carries a Decision discriminant.
        expect(a).not.toHaveProperty("kind");
        expect(a).not.toHaveProperty("basis");
      }),
      { numRuns: 1_000 },
    );
  });

  it("the resolver source references no clock/RNG/IO (kernel-purity §D)", () => {
    const src = readFileSync(
      new URL("../../../src/decision.ts", import.meta.url),
      "utf-8",
    );
    // Isolate the 032 section, then STRIP comments (block + line) so we police
    // only EXECUTABLE code — the docstrings legitimately *name* the banned APIs
    // to document their absence.
    const marker = "032 · Authority-graph store";
    const section = src
      .slice(src.indexOf(marker))
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/\/\/.*$/gm, ""); // line comments
    expect(section).not.toContain("Date.now");
    expect(section).not.toContain("Math.random");
    expect(section).not.toMatch(/\brequire\(|\bimport\(|fs\.|fetch\(|process\./);
  });
});

describe("invariant (032): the Decision algebra is unchanged (invariant #2)", () => {
  it("DecisionKind is EXACTLY the six ratified outcomes (no 7th)", () => {
    // A compile-time exhaustiveness check: assigning each literal proves the
    // union still admits exactly these and (via the switch) nothing else.
    const all: readonly DecisionKind[] = [
      "EXECUTE",
      "REFUSE",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
      "DEFER",
      "REWRITE",
    ];
    expect(new Set(all).size).toBe(6);
    for (const k of all) {
      // Exhaustive switch: TS errors here if a 7th DecisionKind ever lands.
      const ok: boolean = ((kind: DecisionKind): boolean => {
        switch (kind) {
          case "EXECUTE":
          case "REFUSE":
          case "ESCALATE":
          case "REQUEST_CONFIRMATION":
          case "DEFER":
          case "REWRITE":
            return true;
          default: {
            const _exhaustive: never = kind;
            return _exhaustive;
          }
        }
      })(k);
      expect(ok).toBe(true);
    }
  });

  it("the decision.ts source declares no `confidence`/`metadata` Decision field", () => {
    const src = readFileSync(
      new URL("../../../src/decision.ts", import.meta.url),
      "utf-8",
    );
    // Police only the `Decision` union declaration (up to the close of the type).
    const start = src.indexOf("export type Decision =");
    const end = src.indexOf("export function decisionExecute");
    const union = src.slice(start, end);
    expect(union).not.toContain("confidence");
    expect(union).not.toContain("metadata");
  });
});
