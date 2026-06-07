import { describe, expect, it } from "vitest";
import { projectTokenBurndownTransparency } from "./token-burndown-transparency";
import { TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE } from "./transparency-fixtures";

describe("projectTokenBurndownTransparency", () => {
  it("computes pctUsed and the warn band on the committed sample", () => {
    const out = projectTokenBurndownTransparency(TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE);
    // 1.24M / 1.5M ≈ 83% → warn band.
    expect(out.pctUsed).toBe(83);
    expect(out.band).toBe("warn");
    expect(out.bandLabel).toBe("near budget");
  });

  it("bands ok / warn / exhausted by fraction of budget", () => {
    expect(projectTokenBurndownTransparency({ consumed: 100, budget: 1000 }).band).toBe("ok");
    expect(projectTokenBurndownTransparency({ consumed: 800, budget: 1000 }).band).toBe("warn");
    expect(projectTokenBurndownTransparency({ consumed: 1000, budget: 1000 }).band).toBe("exhausted");
    expect(projectTokenBurndownTransparency({ consumed: 5000, budget: 1000 }).band).toBe("exhausted");
  });

  it("clamps pctUsed to 0..100 even when over budget", () => {
    expect(projectTokenBurndownTransparency({ consumed: 9999, budget: 1000 }).pctUsed).toBe(100);
    expect(projectTokenBurndownTransparency({ consumed: 0, budget: 1000 }).pctUsed).toBe(0);
  });

  it("fails safe on a non-positive / non-finite budget (no NaN, ok band, 0%)", () => {
    const zero = projectTokenBurndownTransparency({ consumed: 500, budget: 0 });
    expect(zero.pctUsed).toBe(0);
    expect(zero.band).toBe("ok");
    const nan = projectTokenBurndownTransparency({ consumed: Number.NaN, budget: Number.NaN });
    expect(nan.pctUsed).toBe(0);
    expect(nan.band).toBe("ok");
    expect(nan.consumedDisplay).toBe("≈ 0");
  });

  it("rounds counts to a coarse unit and renders a '≈' display — never the exact figure", () => {
    const out = projectTokenBurndownTransparency({ consumed: 1_243_777, budget: 1_500_000 });
    // Rounded to the nearest 10k → 1.24M; never the raw 1,243,777.
    expect(out.consumedDisplay).toBe("≈ 1.24M");
    expect(out.budgetDisplay).toBe("≈ 1.5M");
    expect(out.consumedDisplay).not.toContain("1,243,777");
    expect(out.consumedDisplay).not.toContain("1243777");
  });

  it("NEVER emits any id, per-session row, exhaustion detail, or raw count — banded aggregate only", () => {
    const out = projectTokenBurndownTransparency(TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE);
    const allowedKeys = new Set([
      "pctUsed",
      "band",
      "consumedDisplay",
      "budgetDisplay",
      "bandLabel",
    ]);
    const forbidden = [
      "tenantId",
      "tenant",
      "sessionId",
      "session",
      "sessions",
      "exhaustionEvents",
      "events",
      "consumed",
      "budget",
      "remaining",
      "id",
      "at",
    ];
    for (const key of Object.keys(out)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(out, key)).toBe(false);
    }
    // Defense-in-depth: no id and no raw exact count survives serialization.
    const json = JSON.stringify(out);
    expect(json).not.toContain("acme");
    expect(json).not.toContain("sess-");
    expect(json).not.toContain("1240000");
    expect(json).not.toContain("1500000");
  });

  it("is deterministic for a given input", () => {
    const a = projectTokenBurndownTransparency(TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE);
    const b = projectTokenBurndownTransparency(TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE);
    expect(a).toEqual(b);
  });
});
