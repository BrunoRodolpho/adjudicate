/**
 * describePolicyBundle — JSON-serialisable introspection over a PolicyBundle.
 *
 * Pins:
 *   - phases are in the canonical evaluation order (state → taint → auth → business)
 *   - guards with `withMetadata` come back as `{ kind: "named", metadata }`
 *   - guards without metadata come back as `{ kind: "anonymous" }`
 *   - the descriptor is JSON-stringifiable (no functions, no symbols leak)
 */

import { describe, expect, it } from "vitest";
import {
  describePolicyBundle,
  withMetadata,
  type Guard,
  type PolicyBundle,
} from "../../src/kernel/index.js";
import type { TaintPolicy } from "../../src/taint.js";

const passGuard: Guard<string, unknown, unknown> = () => null;

const permissiveTaint: TaintPolicy = {
  minimumFor: () => "UNTRUSTED",
};

function bundleFixture(): PolicyBundle<string, unknown, unknown> {
  const namedState = withMetadata(
    (() => null) as Guard<string, unknown, unknown>,
    {
      name: "valid-transition",
      author: "platform@example",
      since: "2026-01-01",
      description: { kind: "opaque", note: "stateGuards smoke" },
    },
  );
  const namedBusiness = withMetadata(
    (() => null) as Guard<string, unknown, unknown>,
    {
      name: "amount-threshold",
      description: { kind: "threshold", threshold: 1000, comparator: ">=" },
    },
  );
  return {
    stateGuards: [namedState, passGuard],
    authGuards: [passGuard],
    taint: permissiveTaint,
    business: [namedBusiness],
    default: "REFUSE",
  };
}

describe("describePolicyBundle", () => {
  it("emits phases in canonical evaluation order", () => {
    const out = describePolicyBundle(bundleFixture());
    expect(out.phases.map((p) => p.phase)).toEqual([
      "state",
      "taint",
      "auth",
      "business",
    ]);
  });

  it("preserves the bundle.default", () => {
    expect(describePolicyBundle(bundleFixture()).default).toBe("REFUSE");
    expect(
      describePolicyBundle({ ...bundleFixture(), default: "EXECUTE" }).default,
    ).toBe("EXECUTE");
  });

  it("marks anonymous guards as `{ kind: 'anonymous' }`", () => {
    const out = describePolicyBundle(bundleFixture());
    const statePhase = out.phases.find((p) => p.phase === "state")!;
    expect(statePhase.guards).toHaveLength(2);
    expect(statePhase.guards[1]).toEqual({ kind: "anonymous" });
  });

  it("returns full metadata for named guards", () => {
    const out = describePolicyBundle(bundleFixture());
    const statePhase = out.phases.find((p) => p.phase === "state")!;
    expect(statePhase.guards[0]).toEqual({
      kind: "named",
      metadata: {
        name: "valid-transition",
        author: "platform@example",
        since: "2026-01-01",
        description: { kind: "opaque", note: "stateGuards smoke" },
      },
    });
  });

  it("emits the taint phase as a single anonymous descriptor (TaintPolicy is not a guard array)", () => {
    const out = describePolicyBundle(bundleFixture());
    const taintPhase = out.phases.find((p) => p.phase === "taint")!;
    expect(taintPhase.guards).toEqual([{ kind: "anonymous" }]);
  });

  it("is JSON-stringifiable (no function or symbol leakage)", () => {
    const out = describePolicyBundle(bundleFixture());
    const round = JSON.parse(JSON.stringify(out));
    expect(round).toEqual(out);
  });

  it("threshold guard descriptor surfaces threshold + comparator", () => {
    const out = describePolicyBundle(bundleFixture());
    const businessPhase = out.phases.find((p) => p.phase === "business")!;
    const first = businessPhase.guards[0];
    expect(first.kind).toBe("named");
    if (first.kind !== "named") return;
    expect(first.metadata.description).toEqual({
      kind: "threshold",
      threshold: 1000,
      comparator: ">=",
    });
  });
});
