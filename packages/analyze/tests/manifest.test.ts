/**
 * PolicyManifest builder tests.
 *
 * The PIX Pack is the lighthouse: describePack must produce a structurally
 * complete manifest for it. Fixture packs exercise the name-resolution
 * fallback, declared kind-scoping, outcome inference, digest stability, and
 * the drift diff.
 */

import { describe, expect, it } from "vitest";
import type { PackV0 } from "@adjudicate/core";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  describePack,
  describeInstalledPacks,
  diffPolicyManifests,
  computeManifestDigest,
} from "../src/index.js";

type AnyPack = PackV0<string, unknown, unknown, unknown>;
const noopPlanner = { plan: () => ({ visibleReadTools: [], allowedIntents: [] }) };

function makePack(opts: {
  id?: string;
  intents: ReadonlyArray<string>;
  business?: ReadonlyArray<Guard<string, unknown, unknown>>;
  state?: ReadonlyArray<Guard<string, unknown, unknown>>;
  auth?: ReadonlyArray<Guard<string, unknown, unknown>>;
  basisCodes?: ReadonlyArray<string>;
  signals?: ReadonlyArray<string>;
  def?: "REFUSE" | "EXECUTE";
}): AnyPack {
  return {
    contract: "v0",
    id: opts.id ?? "test/pack",
    version: "0.0.0",
    intents: opts.intents,
    basisCodes: opts.basisCodes ?? ["x.code"],
    signals: opts.signals ?? [],
    policy: {
      stateGuards: opts.state ?? [],
      authGuards: opts.auth ?? [],
      business: opts.business ?? [],
      taint: { minimumFor: () => "UNTRUSTED" },
      default: opts.def ?? "REFUSE",
    },
    planner: noopPlanner,
  };
}

describe("describePack — PIX lighthouse", () => {
  const node = describePack(paymentsPixPack);

  it("captures pack identity + non-empty intents + guard chain", () => {
    expect(node.id).toBe(paymentsPixPack.id);
    expect(node.intents.length).toBeGreaterThan(0);
    expect(node.guards.length).toBeGreaterThan(0);
    expect(node.policyStructure.phases.length).toBe(4); // state/taint/auth/business
  });

  it("resolves a real taint floor per kind (no placeholders)", () => {
    for (const i of node.intents) {
      expect(["SYSTEM", "TRUSTED", "UNTRUSTED"]).toContain(i.taintFloor);
    }
  });

  it("every intent's possible-outcome set includes the policy default", () => {
    for (const i of node.intents) {
      expect(i.outcomes.possible).toContain(node.default);
    }
  });
});

describe("guard name resolution", () => {
  it("uses GuardMetadata.name (metadata)", () => {
    const g = withMetadata(
      (() => null) as Guard<string, unknown, unknown>,
      { name: "namedByMeta" },
    );
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    const guard = node.guards[0];
    expect(guard?.name).toBe("namedByMeta");
    expect(guard?.nameSource).toBe("metadata");
    expect(guard?.anonymous).toBe(false);
  });

  it("falls back to Function.name (function)", () => {
    const g: Guard<string, unknown, unknown> = function myFnGuard() {
      return null;
    };
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    expect(node.guards[0]?.name).toBe("myFnGuard");
    expect(node.guards[0]?.nameSource).toBe("function");
  });

  it("falls back to positional + flags anonymous", () => {
    const g = (() => null) as Guard<string, unknown, unknown>;
    Object.defineProperty(g, "name", { value: "" });
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    expect(node.guards[0]?.name).toBe("business[0]");
    expect(node.guards[0]?.nameSource).toBe("positional");
    expect(node.guards[0]?.anonymous).toBe(true);
  });
});

describe("declared kind scope (system_taint) + unguarded intents", () => {
  const sysGuard = withMetadata(
    (() => null) as Guard<string, unknown, unknown>,
    {
      name: "systemOnlyGuard",
      description: { kind: "system_taint", systemOnlyKinds: ["a.sys"] },
    },
  );
  const node = describePack(makePack({ intents: ["a.sys", "b.open"], business: [sysGuard] }));

  it("narrows the guard to its declared kinds", () => {
    const a = node.intents.find((i) => i.kind === "a.sys");
    const b = node.intents.find((i) => i.kind === "b.open");
    expect(a?.guardNames).toContain("systemOnlyGuard");
    expect(b?.guardNames).not.toContain("systemOnlyGuard");
  });

  it("flags an intent with no applicable guards as unguarded in a diff", () => {
    const m = describeInstalledPacks([makePack({ intents: ["a.sys", "b.open"], business: [sysGuard] })], {
      adopter: "t",
    });
    const diff = diffPolicyManifests(m, m);
    expect(diff.unguardedIntents).toContainEqual({ packId: "test/pack", kind: "b.open" });
  });
});

describe("outcome inference", () => {
  it("threshold(emits) → possible includes that outcome (inferred)", () => {
    const g = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "bigTicket",
      description: { kind: "threshold", threshold: 100000, comparator: ">=", emits: "ESCALATE" },
    });
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    const outcomes = node.intents[0]?.outcomes;
    expect(outcomes?.possible).toContain("ESCALATE");
    expect(outcomes?.evidence.some((e) => e.source === "bigTicket" && e.confidence === "inferred")).toBe(true);
  });

  it("state_defer → DEFER; opaque guard sets hasOpaqueGuards", () => {
    const defer = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "park",
      description: { kind: "state_defer", signal: "x.confirmed", timeoutMs: 1000 },
    });
    const opaque: Guard<string, unknown, unknown> = function mystery() {
      return null;
    };
    const node = describePack(makePack({ intents: ["x"], business: [defer, opaque] }));
    const outcomes = node.intents[0]?.outcomes;
    expect(outcomes?.possible).toContain("DEFER");
    expect(outcomes?.hasOpaqueGuards).toBe(true);
  });
});

describe("adopter-injected guards + tool bindings", () => {
  it("flags injected guards and inverts the tool→intent map", () => {
    const injected = withMetadata((() => null) as Guard<string, unknown, unknown>, { name: "budgetGuard" });
    const node = describePack(makePack({ intents: ["order.add"], business: [injected] }), {
      adopterInjectedGuardNames: ["budgetGuard"],
      toolToIntent: { addItem: "order.add", addItemAlias: "order.add" },
    });
    expect(node.adopterInjectedGuards).toContain("budgetGuard");
    expect(node.guards[0]?.adopterInjected).toBe(true);
    expect(node.intents[0]?.tools).toEqual(["addItem", "addItemAlias"]);
  });
});

describe("digest stability + drift diff", () => {
  const packs = [makePack({ id: "p/a", intents: ["x"], business: [
    withMetadata((() => null) as Guard<string, unknown, unknown>, { name: "g1" }),
  ] })];

  it("identical structure → identical digest regardless of generatedAt", () => {
    const m1 = describeInstalledPacks(packs, { adopter: "t", generatedAt: "2026-01-01T00:00:00Z" });
    const m2 = describeInstalledPacks(packs, { adopter: "t", generatedAt: "2026-02-02T00:00:00Z" });
    expect(m1.digest).toBe(m2.digest);
    expect(m1.generatedAt).not.toBe(m2.generatedAt);
    expect(diffPolicyManifests(m1, m2).identical).toBe(true);
  });

  it("adding a guard surfaces as an added guard + changed pack", () => {
    const m1 = describeInstalledPacks(packs, { adopter: "t" });
    const packs2 = [makePack({ id: "p/a", intents: ["x"], business: [
      withMetadata((() => null) as Guard<string, unknown, unknown>, { name: "g1" }),
      withMetadata((() => null) as Guard<string, unknown, unknown>, { name: "g2" }),
    ] })];
    const m2 = describeInstalledPacks(packs2, { adopter: "t" });
    const diff = diffPolicyManifests(m1, m2);
    expect(diff.identical).toBe(false);
    expect(diff.guards).toContainEqual(expect.objectContaining({ packId: "p/a", guardName: "g2", status: "added" }));
    expect(diff.packs).toContainEqual({ packId: "p/a", status: "changed" });
  });
});

describe("outcome inference — opaque-on-emit-axis (regression: false-complete outcome set)", () => {
  it("threshold WITHOUT declared emits flags hasOpaqueGuards (not a complete set)", () => {
    const g = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "bigTicketNoEmit",
      description: { kind: "threshold", threshold: 100000, comparator: ">=" }, // no `emits`
    });
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    const outcomes = node.intents[0]?.outcomes;
    // The guard's emit is undeclared, so possible is a lower bound -> flagged.
    expect(outcomes?.hasOpaqueGuards).toBe(true);
  });

  it("unknown/forward-compat description kind flags hasOpaqueGuards (ADR-105)", () => {
    const g = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "futureGuard",
      description: { kind: "future_variant", someField: 1 } as unknown as Parameters<
        typeof withMetadata
      >[1]["description"],
    });
    const node = describePack(makePack({ intents: ["x"], business: [g] }));
    expect(node.intents[0]?.outcomes.hasOpaqueGuards).toBe(true);
  });
});

describe("source location excluded from digest + diff (machine/refactor/mode independence)", () => {
  // A guard moving lines, exported on a different machine, or with vs without
  // source files must NOT register as policy drift — sourceLocation is
  // provenance, not rule identity.
  const guardBase = {
    name: "g",
    nameSource: "metadata" as const,
    phase: "business" as const,
    index: 0,
    anonymous: false,
  };
  const mk = (loc: { file: string; line: number; column: number } | undefined) => ({
    manifestVersion: "1.0" as const,
    adopter: "t",
    packs: [
      {
        id: "p",
        version: "0",
        contract: "v0",
        default: "REFUSE" as const,
        basisCodes: [],
        signals: [],
        adopterInjectedGuards: [],
        policyStructure: { default: "REFUSE" as const, phases: [] },
        guards: [loc ? { ...guardBase, sourceLocation: loc } : guardBase],
        intents: [],
      },
    ],
  });

  it("computeManifestDigest ignores sourceLocation (and absolute-path differences)", () => {
    const noLoc = mk(undefined);
    const absA = mk({ file: "/Users/alice/repo/packages/p/src/policies.ts", line: 5, column: 2 });
    const absB = mk({ file: "/home/ci/work/packages/p/src/policies.ts", line: 9, column: 7 });
    const d = computeManifestDigest as unknown as (m: typeof noLoc) => string;
    expect(d(noLoc)).toBe(d(absA));
    expect(d(absA)).toBe(d(absB));
  });

  it("diffPolicyManifests reports identical when only sourceLocation differs", () => {
    const withLoc = { ...mk({ file: "/x/policies.ts", line: 1, column: 1 }) } as Parameters<typeof diffPolicyManifests>[0];
    const noLoc = { ...mk(undefined) } as Parameters<typeof diffPolicyManifests>[0];
    const cmd = computeManifestDigest as unknown as (m: unknown) => string;
    const a = { ...withLoc, digest: cmd(withLoc) } as Parameters<typeof diffPolicyManifests>[0];
    const b = { ...noLoc, digest: cmd(noLoc) } as Parameters<typeof diffPolicyManifests>[0];
    const diff = diffPolicyManifests(a, b);
    expect(diff.identical).toBe(true);
    expect(diff.guards.filter((g) => g.status === "changed")).toEqual([]);
  });
});
