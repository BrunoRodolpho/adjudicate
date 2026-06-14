import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import { CatchCountsResultSchema, type CatchCountsResult } from "../src/schemas/catches.js";

/**
 * tRPC coverage for `governance.catches` (item 7) — the "caught a bad call"
 * counts port. Context-read posture: no actor required; PRECONDITION_FAILED is
 * the runtime feature-detection signal when the port is unwired.
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({ store, emergencyStore, actor: null, ...ctx });
}

const COUNTS: CatchCountsResult = {
  total: 3,
  byReason: { out_of_plan: 3 },
  byTool: [
    { toolName: "shell.rm_rf", count: 2 },
    { toolName: "db.drop_table", count: 1 },
  ],
};

describe("governance.catches (item 7)", () => {
  it("returns the catch counts when the port is wired", async () => {
    const caller = callerWith({ catches: { query: async () => COUNTS } });
    const res = await caller.governance.catches();
    expect(res.total).toBe(3);
    expect(res.byReason.out_of_plan).toBe(3);
    expect(res.byTool[0]?.toolName).toBe("shell.rm_rf");
  });

  it("throws PRECONDITION_FAILED when no catches port is wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.catches()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("CatchCountsResultSchema round-trips", () => {
    expect(CatchCountsResultSchema.parse(COUNTS)).toEqual(COUNTS);
  });
});
