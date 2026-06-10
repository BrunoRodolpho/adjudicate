import { describe, expect, it } from "vitest";
import { PolicyManifestSchema } from "../src/schemas/policy-manifest.js";

/**
 * Wire-schema round-trip for PolicyManifest. The producer lives in
 * `@adjudicate/analyze` (which admin-sdk does NOT depend on), so we validate
 * against a hand-built fixture mirroring `describeInstalledPacks` output. If
 * the manifest shape drifts, this fails by name.
 */

const VALID = {
  manifestVersion: "1.0",
  adopter: "ibatexas",
  kernelVersion: "1.3.0",
  generatedAt: "2026-06-09T00:00:00.000Z",
  digest: "deadbeef",
  packs: [
    {
      id: "ibatexas/pack-orders",
      version: "0.0.1",
      contract: "v0",
      default: "REFUSE",
      basisCodes: ["order.checkout.created"],
      signals: ["payment.confirmed"],
      adopterInjectedGuards: ["sessionTokenBudget"],
      policyStructure: {
        default: "REFUSE",
        phases: [
          { phase: "state", guards: [{ kind: "anonymous" }] },
          { phase: "taint", guards: [{ kind: "anonymous" }] },
          { phase: "auth", guards: [{ kind: "named", metadata: { name: "requireAuth" } }] },
          { phase: "business", guards: [] },
        ],
      },
      guards: [
        {
          name: "confirmLargeTicket",
          nameSource: "metadata",
          phase: "business",
          index: 0,
          anonymous: false,
          author: "orders-team",
          since: "0.0.1",
          description: { kind: "threshold", threshold: 100000, comparator: ">=", emits: "REQUEST_CONFIRMATION" },
          emits: "REQUEST_CONFIRMATION",
          sourceLocation: { file: "packages/pack-orders/src/policies.ts", line: 564, column: 7 },
        },
        {
          name: "sessionTokenBudget",
          nameSource: "metadata",
          phase: "business",
          index: 1,
          anonymous: false,
          adopterInjected: true,
        },
      ],
      intents: [
        {
          kind: "order.checkout.create",
          taintFloor: "UNTRUSTED",
          systemOnly: false,
          tools: ["createCheckout"],
          guardNames: ["confirmLargeTicket", "sessionTokenBudget"],
          default: "REFUSE",
          outcomes: {
            possible: ["REQUEST_CONFIRMATION", "REFUSE"],
            evidence: [
              { outcome: "REQUEST_CONFIRMATION", source: "confirmLargeTicket", confidence: "inferred" },
              { outcome: "REFUSE", source: "policy.default", confidence: "default" },
            ],
            hasOpaqueGuards: true,
          },
        },
      ],
    },
  ],
};

describe("PolicyManifestSchema", () => {
  it("accepts a representative manifest", () => {
    const result = PolicyManifestSchema.safeParse(VALID);
    if (!result.success) {
      throw new Error(`Schema rejected fixture: ${JSON.stringify(result.error.issues, null, 2)}`);
    }
    expect(result.success).toBe(true);
  });

  it("rejects an invalid taintFloor", () => {
    const bad = structuredClone(VALID);
    (bad.packs[0]!.intents[0] as { taintFloor: string }).taintFloor = "SUPERUSER";
    expect(PolicyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing digest", () => {
    const bad = structuredClone(VALID) as Record<string, unknown>;
    delete bad.digest;
    expect(PolicyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("tolerates an unknown guard description kind (ADR-105 forward-compat)", () => {
    const fwd = structuredClone(VALID);
    (fwd.packs[0]!.guards[0] as { description: Record<string, unknown> }).description = {
      kind: "future_variant",
      someNewField: 42,
    };
    expect(PolicyManifestSchema.safeParse(fwd).success).toBe(true);
  });

  it("PRESERVES unknown additive node fields (passthrough, not strip)", () => {
    // The manifest is a growing superset; if analyze adds a field, the wire
    // schema must pass it through (not silently drop it) so the tree keeps it.
    const grown = structuredClone(VALID) as Record<string, unknown> & {
      packs: Array<Record<string, unknown> & { guards: Array<Record<string, unknown>> }>;
    };
    grown.packs[0]!.guards[0]!.futureGuardField = { nested: true };
    grown.packs[0]!.futurePackField = "x";
    grown.futureTopField = 7;
    const parsed = PolicyManifestSchema.safeParse(grown);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const out = parsed.data as Record<string, unknown> & {
        packs: Array<Record<string, unknown> & { guards: Array<Record<string, unknown>> }>;
      };
      expect(out.futureTopField).toBe(7);
      expect(out.packs[0]!.futurePackField).toBe("x");
      expect(out.packs[0]!.guards[0]!.futureGuardField).toEqual({ nested: true });
    }
  });
});
