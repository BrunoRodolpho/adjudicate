import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDriftDetector } from "../src/index.js";

describe("drift observer purity & dependency direction", () => {
  it("observe never throws on a malformed record", () => {
    const d = createDriftDetector({ baselineWindow: 2, alertThreshold: 0.5, dimensions: ["decision.kind", "basis"] });
    // Missing envelope/decision/basis fields — must not throw.
    expect(() => d.observe({ decision: { kind: "X" }, decision_basis: [] } as never)).not.toThrow();
    expect(() => d.observe({} as never)).not.toThrow();
  });

  it("@adjudicate/core does not depend on @adjudicate/drift (kernel never imports the detector)", () => {
    const corePkgPath = fileURLToPath(new URL("../../core/package.json", import.meta.url));
    const corePkg = JSON.parse(readFileSync(corePkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(corePkg.dependencies?.["@adjudicate/drift"]).toBeUndefined();
    expect(corePkg.devDependencies?.["@adjudicate/drift"]).toBeUndefined();
  });
});
