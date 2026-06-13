import { describe, expect, it } from "vitest";
import {
  discoveredIntents,
  discoveredToolCollisions,
  mcpToolNameToIntentKind,
} from "../src/lib/discover-codegen.js";

/**
 * Mapping property tests for `mcpToolNameToIntentKind`.
 *
 * The load-bearing property: the sanitized intent kind must never produce
 * an AMBIGUOUS bare `a_b` wire name. The bridge translates a dotted kind
 * to its wire form by replacing `.` with `_`, so a dotted kind `a.b` and
 * a literal tool segment containing `_` both collapse to `a_b`. To stay
 * reversible, the sanitized tool segment MUST contain no `_` — the only
 * `.` in the kind is the single prefix separator, so the wire name has
 * exactly one `_` (from that separator) and is unambiguous.
 */

// Local mirror of the bridge's translation (dots → underscores).
function toApiName(kind: string): string {
  return kind.replaceAll(".", "_");
}

const NAMES_NEEDING_SANITIZATION = [
  "create_order", // underscores — the dangerous case
  "a_b", // would collide with intent kind `a.b` if emitted bare
  "send.email", // dots in the tool name
  "List Users", // spaces + capitals
  "delete/resource", // slash
  "weird__name--here", // runs of separators
  "UPPER_CASE_TOOL",
  "trailing_underscore_", // trailing separator
  "_leading", // leading separator
  "tool.with.many.dots",
  "123numericstart",
  "café-déjà", // non-ascii
];

describe("mcpToolNameToIntentKind — collision-avoidance property", () => {
  it("never emits `_` in the sanitized tool segment (no bare a_b ambiguity)", () => {
    for (const toolName of NAMES_NEEDING_SANITIZATION) {
      const kind = mcpToolNameToIntentKind("pack-demo", toolName);
      // The single `.` separates prefix from the tool segment.
      const segments = kind.split(".");
      expect(segments.length).toBe(2);
      const toolSegment = segments[1]!;
      expect(toolSegment, `tool segment for "${toolName}" must not contain _`).not.toContain("_");
      expect(toolSegment, `tool segment for "${toolName}" must not contain .`).not.toContain(".");
    }
  });

  it("produces a wire name with exactly one underscore (the prefix separator)", () => {
    for (const toolName of NAMES_NEEDING_SANITIZATION) {
      const kind = mcpToolNameToIntentKind("a", toolName);
      const api = toApiName(kind);
      const underscoreCount = api.split("_").length - 1;
      expect(
        underscoreCount,
        `wire name "${api}" for tool "${toolName}" must have exactly one _`,
      ).toBe(1);
    }
  });

  it("wire name is unambiguous: re-splitting on the single _ recovers the dotted kind", () => {
    for (const toolName of NAMES_NEEDING_SANITIZATION) {
      const kind = mcpToolNameToIntentKind("prefix", toolName);
      const api = toApiName(kind);
      // Exactly one `_` means the dotted form is uniquely recoverable.
      const recovered = api.replace("_", ".");
      expect(recovered).toBe(kind);
    }
  });

  it("emits prefix-namespaced dotted kinds", () => {
    expect(mcpToolNameToIntentKind("pack-demo", "create_order")).toBe(
      "pack-demo.create-order",
    );
    expect(mcpToolNameToIntentKind("billing", "send.invoice")).toBe(
      "billing.send-invoice",
    );
  });

  it("only `[a-z0-9.-]` survives (lowercased, kebab-collapsed)", () => {
    for (const toolName of NAMES_NEEDING_SANITIZATION) {
      const kind = mcpToolNameToIntentKind("pack-demo", toolName);
      expect(kind).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
    }
  });

  it("falls back to a stable segment when nothing usable survives", () => {
    expect(mcpToolNameToIntentKind("pack-demo", "___")).toBe("pack-demo.tool");
    expect(mcpToolNameToIntentKind("", "create")).toBe("pack.create");
  });
});

describe("discoveredIntents — de-duplication", () => {
  it("collapses tools that sanitize to the same kind (no duplicate intents)", () => {
    // `create_order` and `create.order` both sanitize to `create-order`.
    const intents = discoveredIntents("demo", [
      { name: "create_order" },
      { name: "create.order" },
      { name: "delete_order" },
    ]);
    const kinds = intents.map((i) => i.intentKind);
    expect(kinds).toEqual(["demo.create-order", "demo.delete-order"]);
    // Uniqueness — assertPackConformance rejects duplicate intent kinds.
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("attaches the wire api name (single underscore) per intent", () => {
    const [intent] = discoveredIntents("demo", [{ name: "create_order" }]);
    expect(intent!.intentKind).toBe("demo.create-order");
    expect(intent!.apiName).toBe("demo_create-order");
  });

  it("discoveredToolCollisions reports dropped tools (for the operator warning)", () => {
    const dropped = discoveredToolCollisions("demo", [
      { name: "create_order" },
      { name: "create.order" }, // collides onto demo.create-order
      { name: "delete_order" },
    ]);
    expect(dropped).toEqual([
      { toolName: "create.order", intentKind: "demo.create-order" },
    ]);
  });
});
