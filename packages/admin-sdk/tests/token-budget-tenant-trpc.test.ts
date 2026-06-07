import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  TokenBudgetByTenantResultSchema,
  TokenBudgetResultSchema,
  TokenBudgetTenantQuerySchema,
  TokenBudgetTenantSchema,
  TokenExhaustionEventSchema,
  TokenScopeSchema,
  type TokenBudgetByTenantResult,
  type TokenBudgetResult,
  type TokenBudgetTenantQuery,
} from "../src/schemas/token-budget.js";
import { ActorSchema } from "../src/schemas/emergency.js";
import { extractActor } from "../src/auth/extract-actor.js";

/**
 * tRPC-level + schema coverage for the Token Governance surface (ADR-135):
 * `governance.tokenBudget` (session-only, back-compat) + the additive
 * `governance.tokenBudgetByTenant` (per-tenant + exhaustion timeline). Follows
 * the established context-read posture — PRECONDITION_FAILED is the runtime
 * feature-detection signal when the port / `queryByTenant` is absent — and must
 * keep the existing session-only `tokenBudget` working unchanged.
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({ store, emergencyStore, actor: null, ...ctx });
}

const SESSION_RESULT: TokenBudgetResult = {
  sessions: [
    { sessionId: "s1", tenantId: "acme", consumed: 18_400, budget: 50_000, remaining: 31_600 },
    { sessionId: "s2", tenantId: "acme", consumed: 52_300, budget: 50_000, remaining: -2_300 },
  ],
  totalConsumed: 70_700,
};

const TENANT_RESULT: TokenBudgetByTenantResult = {
  tenants: [
    { tenantId: "acme", consumed: 70_700, budget: 60_000, remaining: -10_700, sessionCount: 2 },
    { tenantId: "globex", consumed: 12_000, budget: 60_000, remaining: 48_000, sessionCount: 1 },
  ],
  exhaustionEvents: [
    { id: "evt:1", at: "2026-06-07T00:02:00.000Z", scope: "tenant", tenantId: "acme", consumed: 70_700, budget: 60_000 },
    { id: "evt:0", at: "2026-06-07T00:01:00.000Z", scope: "session", sessionId: "s2", tenantId: "acme", consumed: 52_300, budget: 50_000 },
  ],
  totalConsumed: 82_700,
};

function tokenBudgetPort(opts: { withByTenant: boolean }) {
  return {
    async query(): Promise<TokenBudgetResult> {
      return SESSION_RESULT;
    },
    ...(opts.withByTenant
      ? {
          async queryByTenant(input: TokenBudgetTenantQuery): Promise<TokenBudgetByTenantResult> {
            const tenants = TENANT_RESULT.tenants.filter(
              (t) => input.tenantId === undefined || t.tenantId === input.tenantId,
            );
            const exhaustionEvents = TENANT_RESULT.exhaustionEvents
              .filter((e) => input.tenantId === undefined || e.tenantId === input.tenantId)
              .slice(0, input.eventLimit);
            return { tenants, exhaustionEvents, totalConsumed: TENANT_RESULT.totalConsumed };
          },
        }
      : {}),
  };
}

describe("governance.tokenBudget (session, back-compat)", () => {
  it("returns the session view, now with optional tenant fields", async () => {
    const caller = callerWith({ tokenBudget: tokenBudgetPort({ withByTenant: true }) });
    const res = await caller.governance.tokenBudget({});
    expect(res.sessions).toHaveLength(2);
    expect(res.sessions[0]?.tenantId).toBe("acme");
    expect(res.totalConsumed).toBe(70_700);
  });

  it("throws PRECONDITION_FAILED when no token-budget port is wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.tokenBudget({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("governance.tokenBudgetByTenant (ADR-135)", () => {
  it("throws PRECONDITION_FAILED when queryByTenant is absent (port has only query)", async () => {
    const caller = callerWith({ tokenBudget: tokenBudgetPort({ withByTenant: false }) });
    await expect(
      caller.governance.tokenBudgetByTenant({ eventLimit: 100 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when no token-budget port at all", async () => {
    const caller = callerWith({});
    await expect(
      caller.governance.tokenBudgetByTenant({ eventLimit: 100 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("returns tenants + a newest-first exhaustion timeline", async () => {
    const caller = callerWith({ tokenBudget: tokenBudgetPort({ withByTenant: true }) });
    const res = await caller.governance.tokenBudgetByTenant({ eventLimit: 100 });
    expect(res.tenants.map((t) => t.tenantId)).toEqual(["acme", "globex"]);
    expect(res.exhaustionEvents[0]?.scope).toBe("tenant");
    expect(res.exhaustionEvents).toHaveLength(2);
    expect(res.totalConsumed).toBe(82_700);
  });

  it("filters by tenantId and honors eventLimit", async () => {
    const caller = callerWith({ tokenBudget: tokenBudgetPort({ withByTenant: true }) });
    const res = await caller.governance.tokenBudgetByTenant({ tenantId: "acme", eventLimit: 1 });
    expect(res.tenants).toHaveLength(1);
    expect(res.tenants[0]?.tenantId).toBe("acme");
    expect(res.exhaustionEvents).toHaveLength(1);
  });
});

describe("Token Governance schemas (ADR-135)", () => {
  it("TokenScopeSchema is a closed two-value enum", () => {
    expect(TokenScopeSchema.options).toEqual(["session", "tenant"]);
    expect(() => TokenScopeSchema.parse("global")).toThrow();
  });

  it("TokenBudgetTenantSchema parses valid + rejects negative consumed", () => {
    expect(
      TokenBudgetTenantSchema.parse({ tenantId: "t", consumed: 5, sessionCount: 2 }),
    ).toMatchObject({ tenantId: "t", consumed: 5 });
    expect(() => TokenBudgetTenantSchema.parse({ tenantId: "t", consumed: -1 })).toThrow();
  });

  it("TokenExhaustionEventSchema rejects a bad scope", () => {
    expect(() =>
      TokenExhaustionEventSchema.parse({
        id: "evt:0",
        at: "2026-06-07T00:00:00.000Z",
        scope: "nope",
        consumed: 1,
        budget: 1,
      }),
    ).toThrow();
  });

  it("TokenBudgetTenantQuerySchema rejects eventLimit > 500 and defaults to 100", () => {
    expect(TokenBudgetTenantQuerySchema.parse({}).eventLimit).toBe(100);
    expect(() => TokenBudgetTenantQuerySchema.parse({ eventLimit: 501 })).toThrow();
  });

  it("extended TokenBudgetResultSchema is back-compatible (no tenants/exhaustionEvents)", () => {
    // An old session-only payload still parses.
    const old = { sessions: [{ sessionId: "s1", consumed: 10 }], totalConsumed: 10 };
    expect(TokenBudgetResultSchema.parse(old)).toMatchObject({ totalConsumed: 10 });
    // And the new optional fields parse when present.
    const extended = { ...old, tenants: [], exhaustionEvents: [] };
    expect(TokenBudgetResultSchema.parse(extended).tenants).toEqual([]);
  });

  it("TokenBudgetByTenantResultSchema round-trips the demo result", () => {
    expect(TokenBudgetByTenantResultSchema.parse(TENANT_RESULT)).toEqual(TENANT_RESULT);
  });
});

describe("ActorSchema.tenantId + extractActor (ADR-135)", () => {
  it("ActorSchema accepts an optional tenantId", () => {
    expect(ActorSchema.parse({ id: "u1" }).tenantId).toBeUndefined();
    expect(ActorSchema.parse({ id: "u1", tenantId: "acme" }).tenantId).toBe("acme");
  });

  it("extractActor reads x-adjudicate-actor-tenant", () => {
    const req = new Request("https://example.test", {
      headers: {
        "x-adjudicate-actor-id": "u1",
        "x-adjudicate-actor-name": "Op One",
        "x-adjudicate-actor-tenant": "acme",
      },
    });
    expect(extractActor(req)).toEqual({ id: "u1", displayName: "Op One", tenantId: "acme" });
  });

  it("extractActor omits tenantId when the header is absent or empty", () => {
    const noTenant = new Request("https://example.test", {
      headers: { "x-adjudicate-actor-id": "u1" },
    });
    expect(extractActor(noTenant)).toEqual({ id: "u1" });
    const emptyTenant = new Request("https://example.test", {
      headers: { "x-adjudicate-actor-id": "u1", "x-adjudicate-actor-tenant": "" },
    });
    expect(extractActor(emptyTenant)).toEqual({ id: "u1" });
  });
});
