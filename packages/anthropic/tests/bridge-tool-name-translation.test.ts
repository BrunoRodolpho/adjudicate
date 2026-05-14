/**
 * Tool-name translation regression test.
 *
 * The Anthropic API rejects tool names containing dots (pattern
 * `^[a-zA-Z0-9_-]{1,128}$`). Adjudicate's intent kinds use dots
 * (`pix.charge.create`). The renderer translates outbound; the bridge
 * accepts both forms inbound. This test pins both sides so a future
 * change to the renderer or bridge cannot silently regress the
 * lighthouse adapter back to "works in mocks, fails on real API."
 */

import { describe, expect, it } from "vitest";
import {
  classifyIncomingToolUse,
  intentKindToApiName,
} from "../src/bridge.js";
import { createAnthropicPromptRenderer } from "../src/renderer-anthropic.js";
import type { Plan } from "@adjudicate/core/llm";

const ANTHROPIC_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

describe("intentKindToApiName", () => {
  it("replaces dots with underscores", () => {
    expect(intentKindToApiName("pix.charge.create")).toBe("pix_charge_create");
    expect(intentKindToApiName("kyc.vendor.callback")).toBe(
      "kyc_vendor_callback",
    );
  });

  it("is a no-op for already-API-compatible names", () => {
    expect(intentKindToApiName("list_pix_charges")).toBe("list_pix_charges");
    expect(intentKindToApiName("get_pix_charge")).toBe("get_pix_charge");
    expect(intentKindToApiName("simple")).toBe("simple");
  });

  it("output always matches Anthropic's tool-name pattern", () => {
    const samples = [
      "pix.charge.create",
      "pix.charge.refund",
      "kyc.start",
      "kyc.document.upload",
      "deeply.nested.namespaced.kind",
      "list_pix_charges",
    ];
    for (const s of samples) {
      expect(intentKindToApiName(s)).toMatch(ANTHROPIC_TOOL_NAME_PATTERN);
    }
  });
});

describe("renderer translates dotted intent-kind tool names for Anthropic", () => {
  it("emits underscored names that pass the Anthropic API regex", () => {
    const renderer = createAnthropicPromptRenderer<unknown, unknown>({
      packId: "test",
      toolSchemas: [
        {
          name: "pix.charge.create",
          description: "Create a charge",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "list_pix_charges",
          description: "List",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });
    const plan: Plan = {
      visibleReadTools: ["list_pix_charges"],
      allowedIntents: ["pix.charge.create"],
      forbiddenConcepts: [],
    };
    const rendered = renderer.render(undefined, undefined, plan);
    expect(rendered.toolSchemas).toHaveLength(2);
    for (const schema of rendered.toolSchemas) {
      expect(schema.name).toMatch(ANTHROPIC_TOOL_NAME_PATTERN);
    }
    const names = rendered.toolSchemas.map((s) => s.name).sort();
    expect(names).toEqual(["list_pix_charges", "pix_charge_create"]);
  });

  it("preserves all other ToolSchema fields when translating the name", () => {
    const renderer = createAnthropicPromptRenderer<unknown, unknown>({
      packId: "test",
      toolSchemas: [
        {
          name: "pix.charge.refund",
          description: "Refund a charge",
          input_schema: {
            type: "object",
            properties: { chargeId: { type: "string" } },
            required: ["chargeId"],
          },
        },
      ],
    });
    const plan: Plan = {
      visibleReadTools: [],
      allowedIntents: ["pix.charge.refund"],
      forbiddenConcepts: [],
    };
    const rendered = renderer.render(undefined, undefined, plan);
    const schema = rendered.toolSchemas[0]!;
    expect(schema.name).toBe("pix_charge_refund");
    expect(schema.description).toBe("Refund a charge");
    expect(schema.input_schema).toEqual({
      type: "object",
      properties: { chargeId: { type: "string" } },
      required: ["chargeId"],
    });
  });
});

describe("classifyIncomingToolUse accepts both translated and raw forms", () => {
  const plan: Plan = {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.create", "pix.charge.refund"],
    forbiddenConcepts: [],
  };

  it("matches raw dotted name (mocked-test path)", () => {
    const cls = classifyIncomingToolUse(
      { name: "pix.charge.create", input: {} },
      plan,
    );
    expect(cls.kind).toBe("intent");
    if (cls.kind === "intent") {
      expect(cls.intentKind).toBe("pix.charge.create");
    }
  });

  it("matches translated underscored name (live-API path)", () => {
    const cls = classifyIncomingToolUse(
      { name: "pix_charge_create", input: { x: 1 } },
      plan,
    );
    expect(cls.kind).toBe("intent");
    if (cls.kind === "intent") {
      // Reverse-mapped to the planner's original (dotted) intent kind.
      expect(cls.intentKind).toBe("pix.charge.create");
      expect(cls.payload).toEqual({ x: 1 });
    }
  });

  it("matches READ tools by their literal name (no translation needed)", () => {
    const cls = classifyIncomingToolUse(
      { name: "list_pix_charges", input: {} },
      plan,
    );
    expect(cls.kind).toBe("read");
    if (cls.kind === "read") {
      expect(cls.name).toBe("list_pix_charges");
    }
  });

  it("returns out_of_plan for unknown names regardless of form", () => {
    const cls = classifyIncomingToolUse(
      { name: "evil.do_thing", input: {} },
      plan,
    );
    expect(cls.kind).toBe("out_of_plan");
  });
});
