import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createInMemoryEscalationSink } from "../src/store/escalation-store.js";
import { createEscalateRateLimiter } from "../src/trpc/escalate-rate-limit.js";
import {
  createAdminCaller,
  createReadOnlyAdminCaller,
} from "../src/trpc/index.js";
import type { AdminContext } from "../src/trpc/index.js";
import { EscalateRecommendationSchema } from "../src/schemas/emergency.js";
import type { Actor } from "../src/schemas/emergency.js";
import { fixtureExecute } from "./fixtures.js";

/**
 * 114 — escalate / recommend surface conformance.
 *
 * The escalate mutation is the ONE friction-monotone write the Inspector-General
 * OBSERVER plane is permitted. These tests pin:
 *   - friction-only enum (rejects any allow/bypass/override value);
 *   - uniform actor gate (UNAUTHORIZED without an actor);
 *   - feature-detection (PRECONDITION_FAILED when the escalation sink is absent);
 *   - per-actor rate-limit (TOO_MANY_REQUESTS over the window);
 *   - it records a FACT, never a Decision;
 *   - it READS the target (NOT_FOUND for an unknown hash) but never mutates it;
 *   - it is callable on the READ-ONLY plane (the SOLE permitted write there).
 */

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

// A real audited decision the operator can escalate against (shared fixture).
const record = fixtureExecute;
const KNOWN_HASH = record.intentHash;
const UNKNOWN_HASH = "e".repeat(64);

interface Wiring {
  readonly actor?: Actor | null;
  readonly withSink?: boolean;
  readonly rateLimiter?: AdminContext["escalateRateLimiter"];
}

function ctxFor(opts: Wiring = {}): AdminContext {
  const store = createInMemoryAuditStore({ records: [record] });
  const emergencyStore = createInMemoryEmergencyStateStore();
  return {
    store,
    emergencyStore,
    actor: opts.actor === undefined ? operator : opts.actor,
    ...(opts.withSink !== false
      ? { escalationSink: createInMemoryEscalationSink() }
      : {}),
    ...(opts.rateLimiter ? { escalateRateLimiter: opts.rateLimiter } : {}),
  };
}

describe("escalate.raise — friction-only enum (wire-level monotonicity)", () => {
  it("accepts ONLY pause / review / escalate (the closed friction-only vocabulary)", () => {
    expect(EscalateRecommendationSchema.options).toEqual([
      "pause",
      "review",
      "escalate",
    ]);
  });

  it("rejects an allow/bypass/override/EXECUTE recommendation at the wire", async () => {
    const caller = createAdminCaller(ctxFor());
    for (const forbidden of ["allow", "bypass", "override", "EXECUTE"]) {
      await expect(
        caller.escalate.raise({
          intentHash: KNOWN_HASH,
          // Deliberately smuggle a friction-DECREASING verb — the enum admits
          // none, so Zod rejects it before the handler runs (BAD_REQUEST).
          recommendation: forbidden as never,
          reason: "attempting to smuggle a friction-decreasing recommendation",
        }),
      ).rejects.toThrow();
    }
  });

  it("each friction-increasing recommendation succeeds and records a FACT (never a Decision)", async () => {
    for (const rec of ["pause", "review", "escalate"] as const) {
      const caller = createAdminCaller(ctxFor());
      const result = await caller.escalate.raise({
        intentHash: KNOWN_HASH,
        recommendation: rec,
        reason: `recommend ${rec} pending operator investigation`,
      });
      expect(result.kind).toBe("escalation.raised");
      expect(result.recommendation).toBe(rec);
      expect(result.intentHash).toBe(KNOWN_HASH);
      expect(result.raisedBy.id).toBe("op-1");
      // The output is a recorded FACT — it carries NO `decision` field (the
      // closed 6-outcome algebra is untouched).
      expect("decision" in result).toBe(false);
    }
  });
});

describe("escalate.raise — uniform actor gate", () => {
  it("rejects a null actor with UNAUTHORIZED", async () => {
    const caller = createAdminCaller(ctxFor({ actor: null }));
    await expect(
      caller.escalate.raise({
        intentHash: KNOWN_HASH,
        recommendation: "review",
        reason: "unauthenticated escalation attempt — must be rejected",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("escalate.raise — feature-detected escalation sink", () => {
  it("throws PRECONDITION_FAILED when no escalation sink is wired", async () => {
    const caller = createAdminCaller(ctxFor({ withSink: false }));
    await expect(
      caller.escalate.raise({
        intentHash: KNOWN_HASH,
        recommendation: "pause",
        reason: "escalation with no sink wired — must precondition-fail",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("UNAUTHORIZED takes precedence over PRECONDITION_FAILED (actor checked first)", async () => {
    const caller = createAdminCaller(ctxFor({ actor: null, withSink: false }));
    await expect(
      caller.escalate.raise({
        intentHash: KNOWN_HASH,
        recommendation: "pause",
        reason: "no actor AND no sink — actor gate wins",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("escalate.raise — reads the target decision (never mutates it)", () => {
  it("rejects an escalation against an unknown intentHash with NOT_FOUND", async () => {
    const caller = createAdminCaller(ctxFor());
    await expect(
      caller.escalate.raise({
        intentHash: UNKNOWN_HASH,
        recommendation: "escalate",
        reason: "escalation against a non-existent decision — must NOT_FOUND",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not mutate the audit record it reads", async () => {
    const store = createInMemoryAuditStore({ records: [record] });
    const ctx: AdminContext = {
      store,
      emergencyStore: createInMemoryEmergencyStateStore(),
      actor: operator,
      escalationSink: createInMemoryEscalationSink(),
    };
    const caller = createAdminCaller(ctx);
    const before = await store.getByIntentHash(KNOWN_HASH);
    await caller.escalate.raise({
      intentHash: KNOWN_HASH,
      recommendation: "review",
      reason: "confirm the audit record is unchanged after escalation",
    });
    const after = await store.getByIntentHash(KNOWN_HASH);
    expect(after).toEqual(before);
  });
});

describe("escalate.raise — per-actor rate limit (TOO_MANY_REQUESTS)", () => {
  it("rejects the (N+1)th escalation within the window for the same actor", async () => {
    // Tiny window so the limit fires deterministically: 2 per window.
    const rateLimiter = createEscalateRateLimiter({
      maxPerWindow: 2,
      windowMs: 60_000,
    });
    const caller = createAdminCaller(ctxFor({ rateLimiter }));
    const raise = (n: number) =>
      caller.escalate.raise({
        intentHash: KNOWN_HASH,
        recommendation: "review",
        reason: `rate-limit probe number ${n} within the window`,
      });
    await expect(raise(1)).resolves.toMatchObject({ kind: "escalation.raised" });
    await expect(raise(2)).resolves.toMatchObject({ kind: "escalation.raised" });
    await expect(raise(3)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("rate-limits PER actor (a second actor has its own window)", async () => {
    const rateLimiter = createEscalateRateLimiter({
      maxPerWindow: 1,
      windowMs: 60_000,
    });
    const sink = createInMemoryEscalationSink();
    const mk = (actor: Actor) =>
      createAdminCaller({
        store: createInMemoryAuditStore({ records: [record] }),
        emergencyStore: createInMemoryEmergencyStateStore(),
        actor,
        escalationSink: sink,
        escalateRateLimiter: rateLimiter,
      });
    const a = mk({ id: "op-a" });
    const b = mk({ id: "op-b" });
    const input = {
      intentHash: KNOWN_HASH,
      recommendation: "review" as const,
      reason: "per-actor window isolation check",
    };
    await expect(a.escalate.raise(input)).resolves.toMatchObject({
      kind: "escalation.raised",
    });
    // op-a is now over its (1-per-window) limit ...
    await expect(a.escalate.raise(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    // ... but op-b has its own fresh window.
    await expect(b.escalate.raise(input)).resolves.toMatchObject({
      kind: "escalation.raised",
    });
  });
});

describe("escalate.raise — callable on the READ-ONLY plane (the SOLE write there)", () => {
  it("the read-only caller can raise an escalation (friction-monotone write permitted)", async () => {
    const sink = createInMemoryEscalationSink();
    const roCaller = createReadOnlyAdminCaller({
      store: createInMemoryAuditStore({ records: [record] }),
      emergencyStore: createInMemoryEmergencyStateStore(),
      actor: operator,
      escalationSink: sink,
    });
    const result = await roCaller.escalate.raise({
      intentHash: KNOWN_HASH,
      recommendation: "pause",
      reason: "inspector-general recommends a hold pending review",
    });
    expect(result.kind).toBe("escalation.raised");
    const history = await sink.history(10);
    expect(history).toHaveLength(1);
    expect(history[0]!.recommendation).toBe("pause");
  });

  it("the read-only caller STILL cannot reach an authorize/weaken mutation", async () => {
    const roCaller = createReadOnlyAdminCaller({
      store: createInMemoryAuditStore({ records: [record] }),
      emergencyStore: createInMemoryEmergencyStateStore(),
      actor: operator,
      escalationSink: createInMemoryEscalationSink(),
    });
    const dyn = roCaller as unknown as Record<
      string,
      Record<string, (input: unknown) => Promise<unknown>>
    >;
    await expect(
      dyn.approval!.resolve!({ token: "tok-0", accepted: true }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
  });
});
