import { describe, expect, it } from "vitest";
import { assertPackConformance, type PackV0 } from "@adjudicate/core";
import { cliAgentPack, rehydrateCliState } from "../src/index.js";

describe("pack-cli-agent — conformance", () => {
  it("satisfies PackV0 and passes assertPackConformance", () => {
    const _typecheck: PackV0 = cliAgentPack;
    void _typecheck;
    expect(() => assertPackConformance(cliAgentPack)).not.toThrow();
  });

  it("default polarity is REFUSE (fail-closed)", () => {
    expect(cliAgentPack.policy.default).toBe("REFUSE");
  });

  it("terminal.run floor is UNTRUSTED (LLM may propose; guards gate)", () => {
    expect(cliAgentPack.policy.taint.minimumFor("terminal.run")).toBe("UNTRUSTED");
  });

  it("declares a pack-id-prefixed maintenance DEFER signal (composition-safe)", () => {
    expect(cliAgentPack.signals).toContain("pack-cli-agent:maintenance_window");
  });

  it("rehydrateCliState builds Sets from JSON arrays and defaults maintenance off", () => {
    const s = rehydrateCliState({ allowlist: ["ls", "cat"], allowedCwds: ["/work"] });
    expect(s.allowlist.has("ls")).toBe(true);
    expect(s.allowedCwds.has("/work")).toBe(true);
    expect(s.maintenanceActive).toBe(false);
    // tolerates garbage input → empty sets
    const empty = rehydrateCliState(null);
    expect(empty.allowlist.size).toBe(0);
  });
});
