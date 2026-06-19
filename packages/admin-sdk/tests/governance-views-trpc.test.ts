/**
 * 115 — Governance views (read-only) on the write-isolated Adjudicant plane.
 *
 * The three governance surfaces — policy-version history (`describePolicy` /
 * `policyManifest`), operational dashboards (`guardFireStats` /
 * `outcomeDistribution`), and the kill-switch read-status timeline
 * (`killSwitchTimeline`) — are ALL pure `.query` procedures. They read recorded
 * snapshots through feature-detected context ports; an omitted port self-fences
 * with PRECONDITION_FAILED so the surface is runtime-feature-detectable (§3).
 *
 * The invariant these tests pin (§C / §D-7): the governance views OBSERVE and
 * INVESTIGATE; they never authorize or weaken a decision. So:
 *   - every governance VIEW is a `.query` (never a `.mutation`), and
 *   - the read-only plane carries ZERO governance mutations (the lone governance
 *     mutation, `governance.recordOutcome`, is structurally absent from it).
 */
import { describe, expect, it } from "vitest";
import { GuardFireStats } from "@adjudicate/core";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import {
  adminRouter,
  createAdminCaller,
  createReadOnlyAdminCaller,
  readOnlyAdminRouter,
} from "../src/trpc/index.js";
import type { AdminContext } from "../src/trpc/index.js";
import type { Actor } from "../src/schemas/emergency.js";
import { ALL } from "./fixtures.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

// The five governance VIEWS that make up the 115 read-only surface. None of them
// may ever become a mutation — the plane observes/investigates, never decides.
const GOVERNANCE_VIEWS = [
  "governance.describePolicy",
  "governance.policyManifest",
  "governance.guardFireStats",
  "governance.outcomeDistribution",
  "governance.killSwitchTimeline",
] as const;

const procType = (
  router: typeof adminRouter | typeof readOnlyAdminRouter,
  name: string,
): string | undefined =>
  (router._def.procedures as Record<string, { _def: { type: string } }>)[name]
    ?._def.type;

const baseCtx = (overrides: Partial<AdminContext> = {}): AdminContext =>
  ({
    store: createInMemoryAuditStore({ records: ALL }),
    emergencyStore: createInMemoryEmergencyStateStore(),
    actor: operator,
    ...overrides,
  }) as AdminContext;

describe("governance views — every view is a .query, never a .mutation (115)", () => {
  for (const view of GOVERNANCE_VIEWS) {
    it(`${view} is a .query on the FULL router`, () => {
      expect(procType(adminRouter, view)).toBe("query");
    });
    it(`${view} is a .query on the READ-ONLY plane (and is present)`, () => {
      expect(procType(readOnlyAdminRouter, view)).toBe("query");
    });
  }

  it("the read-only plane carries ZERO governance mutations (recordOutcome is absent)", () => {
    const roNames = Object.keys(
      readOnlyAdminRouter._def.procedures as Record<string, unknown>,
    );
    const govMutations = roNames.filter(
      (n) =>
        n.startsWith("governance.") &&
        procType(readOnlyAdminRouter, n) === "mutation",
    );
    expect(govMutations).toEqual([]);
    // …and the lone governance mutation IS present on the full router (proving
    // the read plane really SUBTRACTED it, not that no such mutation exists).
    expect(procType(adminRouter, "governance.recordOutcome")).toBe("mutation");
    expect(roNames).not.toContain("governance.recordOutcome");
  });
});

// ─── Feature-detection: omitting a port yields PRECONDITION_FAILED ───────────
// The plane's read views self-fence: an adopter that has not wired the optional
// port gets a typed PRECONDITION_FAILED (not a crash, not a fake-empty value),
// so the surface is feature-detectable at runtime (§3).
describe("governance views — omitted ports yield PRECONDITION_FAILED (115)", () => {
  it("describePolicy throws PRECONDITION_FAILED when policyDescriptor is omitted", async () => {
    const caller = createAdminCaller(baseCtx());
    await expect(caller.governance.describePolicy()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("policyManifest throws PRECONDITION_FAILED when policyManifest is omitted", async () => {
    const caller = createAdminCaller(baseCtx());
    await expect(caller.governance.policyManifest()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("guardFireStats throws PRECONDITION_FAILED when guardFireStats is omitted", async () => {
    const caller = createAdminCaller(baseCtx());
    await expect(
      caller.governance.guardFireStats({ since: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("killSwitchTimeline throws PRECONDITION_FAILED when killSwitchTimeline is omitted", async () => {
    const caller = createAdminCaller(baseCtx());
    await expect(caller.governance.killSwitchTimeline()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  // Same feature-detection posture on the READ-ONLY plane — the Inspector-General
  // app sees PRECONDITION_FAILED for an unwired port, never a fabricated value.
  it("the read-only plane reports PRECONDITION_FAILED for omitted governance ports", async () => {
    const roCaller = createReadOnlyAdminCaller(baseCtx());
    await expect(roCaller.governance.describePolicy()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(roCaller.governance.killSwitchTimeline()).rejects.toMatchObject(
      { code: "PRECONDITION_FAILED" },
    );
  });
});

// ─── Wired ports serve real reads (non-vacuity of the feature-detection seam) ─
// Proves the PRECONDITION_FAILED branch is a genuine gate, not an always-throw:
// once the port IS wired, the SAME procedure returns data.
describe("governance views — wired ports serve reads (115)", () => {
  it("guardFireStats returns buckets once a GuardFireStats port is wired", async () => {
    const stats = new GuardFireStats();
    stats.recordOutcome({
      guardName: "amount_within_limit",
      guardPhase: "business",
      decisionKind: "REFUSE",
      intentKind: "pix.charge.create",
      at: "2026-06-01T12:00:00.000Z",
    });
    const caller = createAdminCaller(baseCtx({ guardFireStats: stats }));
    const result = await caller.governance.guardFireStats({
      since: "2026-01-01T00:00:00.000Z",
    });
    expect(result.buckets.length).toBeGreaterThan(0);
    expect(result.buckets[0]!.guardName).toBe("amount_within_limit");
  });

  it("outcomeDistribution reads the AuditStore without any extra port", async () => {
    const caller = createAdminCaller(baseCtx());
    // outcomeDistribution feature-detects nothing beyond `store`; the 6 fixtures
    // (one per Decision kind) yield a non-empty distribution.
    const result = await caller.governance.outcomeDistribution({
      since: "2020-01-01T00:00:00.000Z",
      until: "2030-01-01T00:00:00.000Z",
      bucket: "day",
    });
    const total = result.buckets.reduce(
      (sum, b) =>
        sum +
        b.EXECUTE +
        b.REFUSE +
        b.DEFER +
        b.ESCALATE +
        b.REQUEST_CONFIRMATION +
        b.REWRITE,
      0,
    );
    expect(total).toBe(ALL.length);
  });

  it("outcomeDistribution stays a .query on BOTH planes (a dashboard read, never a write)", () => {
    expect(procType(adminRouter, "governance.outcomeDistribution")).toBe(
      "query",
    );
    expect(procType(readOnlyAdminRouter, "governance.outcomeDistribution")).toBe(
      "query",
    );
  });
});
