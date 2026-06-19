import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import {
  adminRouter,
  createAdminCaller,
  createReadOnlyAdminCaller,
  readOnlyAdminRouter,
} from "../src/trpc/index.js";
import type { Actor } from "../src/schemas/emergency.js";
import { ALL, fixtureExecute, fixtureRefuse } from "./fixtures.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

const store = createInMemoryAuditStore({ records: ALL });
const emergencyStore = createInMemoryEmergencyStateStore();
// audit.query / audit.byHash now require an authenticated actor
// (AuthReviewer-004) — supply one for the happy-path suites.
const caller = createAdminCaller({ store, emergencyStore, actor: operator });

// A syntactically valid sha256 hex that matches no fixture — exercises the
// "not found" path now that IntentHashSchema (APIReviewer-013) rejects
// non-hex placeholders like "0xdeadbeef" at the wire.
const UNKNOWN_HASH = "f".repeat(64);

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
    const result = await caller.audit.byHash({ intentHash: UNKNOWN_HASH });
    expect(result).toBeNull();
  });

  it("rejects empty intentHash", async () => {
    await expect(
      caller.audit.byHash({ intentHash: "" }),
    ).rejects.toThrow();
  });

  it("rejects a non-hex intentHash at the wire (APIReviewer-013)", async () => {
    await expect(
      caller.audit.byHash({ intentHash: "0xdeadbeef" }),
    ).rejects.toThrow();
  });
});

describe("adminRouter — audit read actor guard (AuthReviewer-004)", () => {
  const unauthCaller = createAdminCaller({
    store,
    emergencyStore,
    actor: null,
  });

  it("audit.query returns UNAUTHORIZED (not an empty array) without an actor", async () => {
    await expect(
      unauthCaller.audit.query({ limit: 3 }),
    ).rejects.toThrow(/actor-id header required/i);
  });

  it("audit.byHash returns UNAUTHORIZED without an actor", async () => {
    await expect(
      unauthCaller.audit.byHash({ intentHash: fixtureRefuse.intentHash }),
    ).rejects.toThrow(/actor-id header required/i);
  });
});

// ─── 111 — Write-isolation seam (router-level) ──────────────────────────────
// The read-only plane = `adminRouter` MINUS all mutations. The invariant is NOT
// "the mutation count" — it is "the read plane exposes ZERO mutations". A
// read-only console mounting `readOnlyAdminRouter` physically cannot authorize,
// weaken, or replay-mutate a decision.
describe("readOnlyAdminRouter — router-level write isolation (111)", () => {
  const procType = (router: typeof adminRouter | typeof readOnlyAdminRouter) =>
    router._def.procedures as Record<string, { _def: { type: string } }>;

  const namesByType = (
    router: typeof adminRouter | typeof readOnlyAdminRouter,
    type: "query" | "mutation",
  ): string[] =>
    Object.entries(procType(router))
      .filter(([, p]) => p._def.type === type)
      .map(([k]) => k)
      .sort();

  // The full router's 4 mutations TODAY (the contract: emergency.update,
  // replay.run, governance.recordOutcome, approval.resolve). Asserted so this
  // test fails LOUDLY if a future plan adds a 5th mutation to the full router
  // without consciously deciding whether it belongs on the read plane.
  const FULL_MUTATIONS = [
    "approval.resolve",
    "emergency.update",
    "governance.recordOutcome",
    "replay.run",
  ];

  it("the FULL router exposes exactly the 4 known mutations", () => {
    expect(namesByType(adminRouter, "mutation")).toEqual(FULL_MUTATIONS);
  });

  it("the read-only plane exposes ZERO mutation procedures", () => {
    expect(namesByType(readOnlyAdminRouter, "mutation")).toEqual([]);
  });

  it("ALL of the full router's mutations are EXCLUDED from the read plane", () => {
    const roNames = Object.keys(procType(readOnlyAdminRouter));
    for (const mutation of FULL_MUTATIONS) {
      expect(roNames).not.toContain(mutation);
    }
  });

  it("the read plane preserves EVERY query procedure of the full router (reads are unaffected)", () => {
    // Write-isolation must subtract ONLY mutations — never a read. The read
    // plane's query set must equal the full router's query set exactly.
    expect(namesByType(readOnlyAdminRouter, "query")).toEqual(
      namesByType(adminRouter, "query"),
    );
  });

  it("the read-only caller has NO callable mutation procedures at runtime", async () => {
    const store = createInMemoryAuditStore({ records: ALL });
    const emergencyStore = createInMemoryEmergencyStateStore();
    const roCaller = createReadOnlyAdminCaller({
      store,
      emergencyStore,
      actor: operator,
    });

    // The four mutations do not exist on the read-only plane. The tRPC caller
    // is a lazy Proxy (every property access returns a callable), so presence is
    // proven by BEHAVIOUR: invoking the absent procedure rejects with tRPC's
    // "No procedure" NOT_FOUND — it never reaches a mutation resolver. The
    // STATIC type already lacks these members (a direct call is a compile
    // error), so we go through the dynamic shape to probe the wire surface.
    const dyn = roCaller as unknown as Record<
      string,
      Record<string, (input: unknown) => Promise<unknown>>
    >;
    // Each call uses input that WOULD be valid on the full router — so a
    // rejection proves the procedure is ABSENT, not merely input-rejected.
    await expect(
      dyn.emergency!.update!({
        newStatus: "DENY_ALL",
        reason: "should never reach a resolver on the read plane",
        confirmationPhrase: "DENY_ALL",
      }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
    await expect(
      dyn.replay!.run!({ intentHash: "a".repeat(64) }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
    await expect(
      dyn.governance!.recordOutcome!({
        intentHash: "a".repeat(64),
        observed: "succeeded",
        at: "2026-06-18T00:00:00.000Z",
      }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
    await expect(
      dyn.approval!.resolve!({ token: "tok-0", accepted: true }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
  });

  it("the read-only caller STILL serves reads (e.g. audit.query, emergency.state)", async () => {
    const store = createInMemoryAuditStore({ records: ALL });
    const emergencyStore = createInMemoryEmergencyStateStore();
    const roCaller = createReadOnlyAdminCaller({
      store,
      emergencyStore,
      actor: operator,
    });
    const audit = await roCaller.audit.query({ limit: 3 });
    expect(audit.records).toHaveLength(3);
    // The read plane shows kill-switch READ status only (no update).
    const state = await roCaller.emergency.state();
    expect(state.status).toBe("NORMAL");
    const history = await roCaller.emergency.history({ limit: 10 });
    expect(history).toHaveLength(0);
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
