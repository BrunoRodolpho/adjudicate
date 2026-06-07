/**
 * ADR-135 — token-usage telemetry store. Folds the loop's `onTokenUsage` hook
 * into per-session AND per-tenant counters + bounded exhaustion events. The
 * store is TELEMETRY, outside the determinism boundary: clock/RNG-free on every
 * recorded value (timestamps are caller-supplied, event ids are a monotonic
 * sequence), never a kernel input.
 */
import { describe, expect, it } from "vitest";
import {
  createInMemoryTokenUsageStore,
  type TokenUsageSample,
} from "../src/token-usage-store.js";

function sample(over: Partial<TokenUsageSample> & { sessionId: string; at: string }): TokenUsageSample {
  return { ...over };
}

describe("createInMemoryTokenUsageStore — accumulation", () => {
  it("accumulates per-session across multiple samples", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 1000 });
    store.record(sample({ sessionId: "s1", prompt: 100, completion: 50, at: "2026-06-07T00:00:00.000Z" }));
    store.record(sample({ sessionId: "s1", prompt: 200, completion: 0, at: "2026-06-07T00:01:00.000Z" }));

    const sessions = store.sessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: "s1",
      consumed: 350,
      budget: 1000,
      remaining: 650,
      lastAt: "2026-06-07T00:01:00.000Z",
    });
  });

  it("prefers a pre-summed `total` over prompt+completion", () => {
    const store = createInMemoryTokenUsageStore();
    store.record(sample({ sessionId: "s1", total: 999, prompt: 1, completion: 1, at: "t1" }));
    expect(store.sessions()[0]?.consumed).toBe(999);
  });

  it("coerces non-finite / absent usage to 0 for sums", () => {
    const store = createInMemoryTokenUsageStore();
    store.record(sample({ sessionId: "s1", prompt: Number.NaN, completion: Infinity, at: "t1" }));
    store.record(sample({ sessionId: "s1", at: "t2" })); // no usage at all
    expect(store.sessions()[0]?.consumed).toBe(0);
  });

  it("aggregates per-tenant across the tenant's sessions (session-churn safe)", () => {
    const store = createInMemoryTokenUsageStore({ perTenantBudget: 10_000 });
    // Three distinct sessions, one tenant.
    store.record(sample({ sessionId: "s1", tenantId: "acme", total: 3000, at: "t1" }));
    store.record(sample({ sessionId: "s2", tenantId: "acme", total: 3000, at: "t2" }));
    store.record(sample({ sessionId: "s3", tenantId: "acme", total: 3000, at: "t3" }));

    const tenants = store.tenants();
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({
      tenantId: "acme",
      consumed: 9000,
      budget: 10_000,
      remaining: 1000,
      sessionCount: 3,
    });
    // The tenant aggregate equals the sum across its sessions.
    const sessSum = store.sessions().reduce((n, s) => n + s.consumed, 0);
    expect(tenants[0]?.consumed).toBe(sessSum);
  });

  it("totalConsumed sums all session consumption", () => {
    const store = createInMemoryTokenUsageStore();
    store.record(sample({ sessionId: "s1", total: 10, at: "t1" }));
    store.record(sample({ sessionId: "s2", total: 25, at: "t2" }));
    expect(store.totalConsumed()).toBe(35);
  });
});

describe("createInMemoryTokenUsageStore — exhaustion events", () => {
  it("emits a session exhaustion event exactly once on the crossing", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 100 });
    store.record(sample({ sessionId: "s1", total: 60, at: "t1" })); // 60, under
    expect(store.exhaustionEvents()).toHaveLength(0);
    store.record(sample({ sessionId: "s1", total: 50, at: "t2" })); // 110, crosses
    store.record(sample({ sessionId: "s1", total: 50, at: "t3" })); // 160, still over — no new event

    const events = store.exhaustionEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: "session",
      sessionId: "s1",
      consumed: 110,
      budget: 100,
      at: "t2",
    });
  });

  it("emits a tenant exhaustion event when the tenant cap is crossed by churned sessions", () => {
    // Per-session cap never tripped (each session stays small) but the tenant
    // cap is — the churn-evasion backstop.
    const store = createInMemoryTokenUsageStore({ sessionBudget: 10_000, perTenantBudget: 1000 });
    store.record(sample({ sessionId: "a", tenantId: "t", total: 400, at: "t1" }));
    store.record(sample({ sessionId: "b", tenantId: "t", total: 400, at: "t2" }));
    expect(store.exhaustionEvents()).toHaveLength(0);
    store.record(sample({ sessionId: "c", tenantId: "t", total: 400, at: "t3" })); // 1200 > 1000

    const events = store.exhaustionEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scope: "tenant", tenantId: "t", consumed: 1200, budget: 1000 });
    // No session-scope event, since each session stayed under the session cap.
    expect(store.exhaustionEvents({ scope: "session" })).toHaveLength(0);
  });

  it("returns events newest-first and respects scope/tenant/limit filters", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 10, perTenantBudget: 10 });
    store.record(sample({ sessionId: "s1", tenantId: "t1", total: 20, at: "t1" })); // session + tenant cross
    store.record(sample({ sessionId: "s2", tenantId: "t2", total: 20, at: "t2" })); // session + tenant cross

    const all = store.exhaustionEvents();
    // Newest-first: t2's events precede t1's.
    expect(all[0]?.at).toBe("t2");
    expect(all.at(-1)?.at).toBe("t1");

    expect(store.exhaustionEvents({ scope: "tenant" }).every((e) => e.scope === "tenant")).toBe(true);
    expect(store.exhaustionEvents({ tenantId: "t1" }).every((e) => e.tenantId === "t1")).toBe(true);
    expect(store.exhaustionEvents({ limit: 1 })).toHaveLength(1);
  });

  it("per-tenant budget override beats the default cap", () => {
    const store = createInMemoryTokenUsageStore({
      perTenantBudget: 100,
      perTenantBudgets: new Map([["vip", { tenantBudget: 100_000 }]]),
    });
    store.record(sample({ sessionId: "s1", tenantId: "vip", total: 500, at: "t1" }));
    // 500 < 100_000 override → no crossing.
    expect(store.exhaustionEvents()).toHaveLength(0);
    expect(store.tenants()[0]?.budget).toBe(100_000);
  });
});

describe("createInMemoryTokenUsageStore — determinism & bounds", () => {
  it("uses the caller-supplied `at` verbatim and never a wall-clock", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 1 });
    store.record(sample({ sessionId: "s1", total: 5, at: "2099-01-01T00:00:00.000Z" }));
    expect(store.sessions()[0]?.lastAt).toBe("2099-01-01T00:00:00.000Z");
    expect(store.exhaustionEvents()[0]?.at).toBe("2099-01-01T00:00:00.000Z");
  });

  it("event ids are a deterministic monotonic sequence (RNG-free)", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 1 });
    store.record(sample({ sessionId: "s1", total: 5, at: "t1" }));
    store.record(sample({ sessionId: "s2", total: 5, at: "t2" }));
    const ids = store.exhaustionEvents().map((e) => e.id);
    // Both ids are of the form evt:<n>, and distinct/sequential.
    expect(ids.every((id) => /^evt:\d+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it("two identical sample streams produce byte-identical state (reproducible)", () => {
    const make = () => {
      const s = createInMemoryTokenUsageStore({ sessionBudget: 100, perTenantBudget: 150 });
      s.record(sample({ sessionId: "a", tenantId: "t", total: 60, at: "t1" }));
      s.record(sample({ sessionId: "b", tenantId: "t", total: 100, at: "t2" }));
      return s;
    };
    const a = make();
    const b = make();
    expect(JSON.stringify(a.sessions())).toBe(JSON.stringify(b.sessions()));
    expect(JSON.stringify(a.tenants())).toBe(JSON.stringify(b.tenants()));
    expect(JSON.stringify(a.exhaustionEvents())).toBe(JSON.stringify(b.exhaustionEvents()));
  });

  it("LRU-evicts the oldest session beyond maxSessions (churn-flood bound)", () => {
    const store = createInMemoryTokenUsageStore({ maxSessions: 2 });
    store.record(sample({ sessionId: "s1", total: 1, at: "t1" }));
    store.record(sample({ sessionId: "s2", total: 1, at: "t2" }));
    store.record(sample({ sessionId: "s3", total: 1, at: "t3" })); // evicts s1 (oldest)

    const ids = store.sessions().map((s) => s.sessionId);
    expect(ids).not.toContain("s1");
    expect(ids).toContain("s2");
    expect(ids).toContain("s3");
    expect(store.sessions()).toHaveLength(2);
  });

  it("touching a session moves it to most-recently-used (escapes eviction)", () => {
    const store = createInMemoryTokenUsageStore({ maxSessions: 2 });
    store.record(sample({ sessionId: "s1", total: 1, at: "t1" }));
    store.record(sample({ sessionId: "s2", total: 1, at: "t2" }));
    store.record(sample({ sessionId: "s1", total: 1, at: "t3" })); // touch s1 → MRU
    store.record(sample({ sessionId: "s3", total: 1, at: "t4" })); // evicts s2 (now oldest)

    const ids = store.sessions().map((s) => s.sessionId);
    expect(ids).toContain("s1");
    expect(ids).not.toContain("s2");
    expect(ids).toContain("s3");
  });

  it("bounds the exhaustion-event ring at maxEvents (oldest evicted)", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 1, maxEvents: 2 });
    store.record(sample({ sessionId: "s1", total: 5, at: "t1" }));
    store.record(sample({ sessionId: "s2", total: 5, at: "t2" }));
    store.record(sample({ sessionId: "s3", total: 5, at: "t3" }));

    const events = store.exhaustionEvents();
    expect(events).toHaveLength(2);
    // Newest-first; the oldest (t1) was evicted.
    expect(events.map((e) => e.at)).toEqual(["t3", "t2"]);
  });

  it("a tenant counter survives even when its sessions are LRU-evicted", () => {
    // Tenant aggregate is bounded by tenant cardinality, not session churn.
    const store = createInMemoryTokenUsageStore({ maxSessions: 1, perTenantBudget: 50 });
    store.record(sample({ sessionId: "s1", tenantId: "t", total: 30, at: "t1" }));
    store.record(sample({ sessionId: "s2", tenantId: "t", total: 30, at: "t2" })); // evicts s1 from session map

    expect(store.sessions()).toHaveLength(1); // only the latest session row remains
    // Tenant still reflects the full aggregate + a crossing event.
    expect(store.tenants()[0]?.consumed).toBe(60);
    expect(store.exhaustionEvents({ scope: "tenant" })).toHaveLength(1);
  });
});
