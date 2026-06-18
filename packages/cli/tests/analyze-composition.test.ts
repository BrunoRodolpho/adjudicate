import { describe, expect, it } from "vitest";
import type { CompositionReport } from "@adjudicate/analyze";
import { renderCompositionText, runAnalyzeComposition } from "../src/commands/analyze-composition.js";

const report = (over: Partial<CompositionReport> = {}): CompositionReport => ({
  packIds: ["pack-a", "pack-b"],
  conflicts: [],
  checks: [],
  summary: { error: 0, warning: 0, note: 0 },
  passed: true,
  ...over,
});

describe("adjudicate analyze-composition", () => {
  it("renders a clean PASS report", () => {
    const text = renderCompositionText(report());
    expect(text).toContain("✓ no cross-pack conflicts");
    expect(text).toContain("PASS");
  });

  it("renders conflicts and FAIL", () => {
    const text = renderCompositionText(
      report({
        conflicts: [
          { code: "AJD-110", severity: "error", message: 'both declare intent(s): x.do', packs: ["pack-a", "pack-b"] },
        ],
        summary: { error: 1, warning: 0, note: 0 },
        passed: false,
      }),
    );
    expect(text).toContain("[AJD-110]");
    expect(text).toContain("FAIL");
  });

  it("requires at least two packs", async () => {
    await expect(runAnalyzeComposition({ packs: ["only-one"], stdout: () => {} })).rejects.toThrow(/at least two/);
  });
});
