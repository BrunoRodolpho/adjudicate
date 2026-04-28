import { describe, expect, it } from "vitest";
import type { Plan } from "@adjudicate/core/llm";
import {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
} from "../src/bridge.js";

const plan: Plan = {
  visibleReadTools: ["list_charges", "get_charge"],
  allowedIntents: ["pix.charge.create", "pix.charge.refund"],
  forbiddenConcepts: [],
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
      forbiddenConcepts: [],
    };
    const result = classifyIncomingToolUse(
      { name: "pix.charge.confirm", input: { chargeId: "x" } },
      restrictivePlan,
    );
    expect(result.kind).toBe("out_of_plan");
  });
});

describe("buildEnvelopeFromToolUse", () => {
  it("constructs an envelope with principal=llm and supplied taint", () => {
    const envelope = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      nonce: "tu-abc-123",
    });
    expect(envelope.kind).toBe("pix.charge.create");
    expect(envelope.actor).toEqual({ principal: "llm", sessionId: "s-1" });
    expect(envelope.taint).toBe("UNTRUSTED");
    expect(envelope.nonce).toBe("tu-abc-123");
    expect(envelope.intentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a stable intentHash across retries with the same nonce", () => {
    const a = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      nonce: "tu-stable",
    });
    const b = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
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
      nonce: "tu-nonce-a",
    });
    const b = buildEnvelopeFromToolUse({
      intentKind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      sessionId: "s-1",
      taint: "UNTRUSTED",
      nonce: "tu-nonce-b",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });
});
