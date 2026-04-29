import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import { ALL, fixtureExecute, fixtureRefuse } from "./fixtures.js";

const store = createInMemoryAuditStore({ records: ALL });
const emergencyStore = createInMemoryEmergencyStateStore();
const caller = createAdminCaller({ store, emergencyStore, actor: null });

describe("adminRouter — audit.query", () => {
  it("returns paginated records", async () => {
    const result = await caller.audit.query({ limit: 3 });
    expect(result.records).toHaveLength(3);
  });

  it("filters by every Decision kind", async () => {
    for (const decisionKind of [
      "EXECUTE",
      "REFUSE",
      "DEFER",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
      "REWRITE",
    ] as const) {
      const result = await caller.audit.query({ decisionKind, limit: 100 });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.decision.kind).toBe(decisionKind);
    }
  });

  it("rejects an unknown DecisionKind at the wire", async () => {
    await expect(
      // @ts-expect-error — "ALLOW" is not in the DecisionKind enum
      caller.audit.query({ decisionKind: "ALLOW", limit: 100 }),
    ).rejects.toThrow();
  });

  it("rejects bad limit values", async () => {
    await expect(caller.audit.query({ limit: 0 })).rejects.toThrow();
    await expect(caller.audit.query({ limit: 1000 })).rejects.toThrow();
  });

  it("applies default limit when omitted", async () => {
    // The schema defaults `limit` to 100; with 6 fixtures we get all 6.
    const result = await caller.audit.query({});
    expect(result.records).toHaveLength(ALL.length);
  });
});

describe("adminRouter — audit.byHash", () => {
  it("returns the matching record", async () => {
    const result = await caller.audit.byHash({
      intentHash: fixtureRefuse.intentHash,
    });
    expect(result?.intentHash).toBe(fixtureRefuse.intentHash);
    expect(result?.decision.kind).toBe("REFUSE");
  });

  it("returns null for unknown hash", async () => {
    const result = await caller.audit.byHash({ intentHash: "0xdeadbeef" });
    expect(result).toBeNull();
  });

  it("rejects empty intentHash", async () => {
    await expect(
      caller.audit.byHash({ intentHash: "" }),
    ).rejects.toThrow();
  });
});

describe("adminRouter — six-outcome end-to-end", () => {
  it("every fixture is reachable by hash and matches its kind", async () => {
    for (const fixture of ALL) {
      const result = await caller.audit.byHash({
        intentHash: fixture.intentHash,
      });
      expect(result).not.toBeNull();
      expect(result?.intentHash).toBe(fixture.intentHash);
      expect(result?.decision.kind).toBe(fixture.decision.kind);
    }
  });

  it("execute and refuse fixtures are distinguishable by decision shape", async () => {
    const exec = await caller.audit.byHash({
      intentHash: fixtureExecute.intentHash,
    });
    const ref = await caller.audit.byHash({
      intentHash: fixtureRefuse.intentHash,
    });
    expect(exec?.decision.kind).toBe("EXECUTE");
    expect(ref?.decision.kind).toBe("REFUSE");
    if (ref?.decision.kind === "REFUSE") {
      expect(ref.decision.refusal.code).toBeDefined();
    }
  });
});
