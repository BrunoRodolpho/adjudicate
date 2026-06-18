import { describe, expect, it } from "vitest";
import type { Plan } from "@adjudicate/core/llm";
import {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
} from "../src/bridge.js";

const plan: Plan = {
  visibleReadTools: ["list_charges", "get_charge"],
  allowedIntents: ["pix.charge.create", "pix.charge.refund"],
};

describe("classifyIncomingToolUse", () => {
  it("classifies a planner-advertised READ tool", () => {
    const result = classifyIncomingToolUse(
      { name: "list_charges", input: { limit: 5 } },
      plan,
    );
    expect(result).toEqual({
      kind: "read",
      name: "list_charges",
      input: { limit: 5 },
    });
  });

  it("classifies a planner-advertised intent kind", () => {
    const result = classifyIncomingToolUse(
      { name: "pix.charge.create", input: { amountCentavos: 5000 } },
      plan,
    );
    expect(result).toEqual({
      kind: "intent",
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
    });
  });

  it("returns out_of_plan for an unknown tool name", () => {
    const result = classifyIncomingToolUse(
      { name: "make_coffee", input: {} },
      plan,
    );
    expect(result).toEqual({ kind: "out_of_plan", name: "make_coffee" });
  });

  it("does not let a TRUSTED-only kind leak when planner has not advertised it", () => {
    // pix.charge.confirm is TRUSTED-only; the planner correctly omits it.
    // The bridge must surface this as out_of_plan, not as an intent.
    const restrictivePlan: Plan = {
      visibleReadTools: [],
      allowedIntents: ["pix.charge.create"],
        };
    const result = classifyIncomingToolUse(
      { name: "pix.charge.confirm", input: { chargeId: "x" } },
      restrictivePlan,
    );
    expect(result.kind).toBe("out_of_plan");
  });

  it("012: fail-closed on the wire-name collision ('a.b' intent vs 'a_b' read)", () => {
    // intentKindToApiName('a.b') === 'a_b' === the read tool name. The incoming
    // 'a_b' matches BOTH a visible read tool and an allowed intent. The typed
    // discriminant is the authority — scan order must NOT silently pick the read
    // arm. The collision is ambiguous → out_of_plan (fail-closed).
    const collidingPlan: Plan = {
      visibleReadTools: ["a_b"],
      allowedIntents: ["a.b"],
    };
    const result = classifyIncomingToolUse(
      { name: "a_b", input: { x: 1 } },
      collidingPlan,
    );
    expect(result.kind).toBe("out_of_plan");
  });

  it("012: no collision → the read tool still classifies as read", () => {
    // Sanity: the collision guard only fires when BOTH match. A read tool with
    // no colliding intent classifies as read as before.
    const plan2: Plan = {
      visibleReadTools: ["a_b"],
      allowedIntents: ["c.d"],
    };
    const result = classifyIncomingToolUse({ name: "a_b", input: {} }, plan2);
    expect(result.kind).toBe("read");
  });
});

describe("buildEnvelopeFromToolUse", () => {
  it("constructs an envelope with principal=llm and supplied taint", () => {
    const envelope = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-abc-123",
    });
    expect(envelope.kind).toBe("pix.charge.create");
    expect(envelope.actor).toEqual({ principal: "llm", sessionId: "s-1" });
    expect(envelope.taint).toBe("UNTRUSTED");
    expect(envelope.nonce).toBe("tu-abc-123");
    expect(envelope.intentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("041: stamps the supplied origin onto the constructed envelope", () => {
    const envelope = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-abc-123",
    });
    expect(envelope.origin).toBe("LLM");
  });

  it("041: origin is bound into the intentHash (different origin → different hash)", () => {
    const common = {
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED" as const,
      nonce: "tu-origin",
    };
    const fromLlm = buildEnvelopeFromToolUse({ ...common, origin: "LLM" });
    const fromRetrieved = buildEnvelopeFromToolUse({
      ...common,
      origin: "Retrieved",
    });
    expect(fromLlm.origin).toBe("LLM");
    expect(fromRetrieved.origin).toBe("Retrieved");
    expect(fromLlm.intentHash).not.toBe(fromRetrieved.intentHash);
  });

  it("produces a stable intentHash across retries with the same nonce", () => {
    const a = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-stable",
    });
    const b = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-stable",
    });
    expect(a.intentHash).toBe(b.intentHash);
  });

  it("produces different intentHash when the nonce changes", () => {
    const a = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-nonce-a",
    });
    const b = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      origin: "LLM",
      nonce: "tu-nonce-b",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });
});
