import { describe, expect, it } from "vitest";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  basis,
  type AuditRecord,
} from "@adjudicate/core";
import { createInMemoryAuditStore, type AuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  ApprovalHistoryEntrySchema,
  ApprovalChainStepKindSchema,
  ApprovalChainStepSchema,
  type ApprovalHistoryQuery,
  type ApprovalHistoryResult,
  type ApprovalChainQuery,
  type ApprovalChainResult,
  type ApprovalRequestParsed,
} from "../src/schemas/approval.js";

/**
 * tRPC + schema coverage for the ADR-136 read-only operator surfaces:
 * `approval.history` (durable decision history from the registry projection)
 * and `approval.chain` (request → resolved → resumed, walked over the FROZEN
 * `AuditRecord.supersedes` lineage). Both follow the established posture:
 * actor-gated, and PRECONDITION_FAILED is the runtime feature-detection signal
 * when the optional `history`/`chain` port members are absent (same as the
 * existing `approval.list`/`resolve` precondition on `approvalPort`).
 */

const PARKED_HASH = "b".repeat(64);

// A seeded resumed-decision AuditRecord carrying the confirmation_resolved
// supersession (token + predecessor = the parked intent). This is the durable
// row `approval.chain` joins to via the frozen `supersedes` link.
const resumedRecord: AuditRecord = buildAuditRecord({
  envelope: buildEnvelope({
    kind: "deployment.rollback.execute",
    payload: { target: "a1b2c3d4" },
    actor: { principal: "llm", sessionId: "sess-dep-03" },
    taint: "UNTRUSTED",
    nonce: "n-resumed",
    createdAt: "2026-06-06T12:05:00.000Z",
  }),
  decision: decisionExecute([basis("state", "transition_valid")]),
  durationMs: 7,
  at: "2026-06-06T12:05:00.000Z",
  supersedes: {
    predecessorIntentHash: PARKED_HASH,
    predecessorAt: "2026-06-06T12:00:00.000Z",
    reason: "confirmation_resolved",
    token: "demo-approval-token",
  },
});

// The resumed decision's own intentHash IS the join key the projection carries.
const RESUMED_HASH = resumedRecord.intentHash;

const store: AuditStore = createInMemoryAuditStore({ records: [resumedRecord] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({ store, emergencyStore, actor: null, ...ctx });
}

const resolvedProjection: ApprovalRequestParsed = {
  token: "demo-approval-token",
  sessionId: "sess-dep-03",
  intentHash: RESUMED_HASH,
  intentKind: "deployment.rollback.execute",
  prompt: "Confirm rollback of production to a1b2c3d4? This is destructive.",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "approved",
  requestedAt: "2026-06-06T12:00:00.000Z",
  resolvedAt: "2026-06-06T12:05:00.000Z",
  resolvedBy: { id: "alice", displayName: "Alice Operator" },
};

/**
 * Reference approval port with history + chain — exactly the shape the console
 * adopter wires. `history` projects resolved entries (carrying the CLAIMED
 * `resolvedBy`); `chain` walks `store.getByIntentHash(...).supersedes` to build
 * the request → resolved → resumed steps. Token presence only — never the value.
 */
function approvalPortWithHistoryChain() {
  return {
    async list() {
      return [resolvedProjection];
    },
    async resolve() {
      return resolvedProjection;
    },
    async history(input: ApprovalHistoryQuery): Promise<ApprovalHistoryResult> {
      let rows = [resolvedProjection].filter((r) => r.status !== "pending");
      if (input.status) rows = rows.filter((r) => r.status === input.status);
      if (input.sessionId) rows = rows.filter((r) => r.sessionId === input.sessionId);
      return {
        entries: rows.slice(0, input.limit).map((r) => ({
          token: r.token,
          sessionId: r.sessionId,
          intentHash: r.intentHash,
          intentKind: r.intentKind,
          status: r.status,
          requestedAt: r.requestedAt,
          ...(r.resolvedAt ? { resolvedAt: r.resolvedAt } : {}),
          ...(r.resolvedBy ? { resolvedBy: r.resolvedBy } : {}),
        })),
      };
    },
    async chain(input: ApprovalChainQuery): Promise<ApprovalChainResult> {
      const resumed = await store.getByIntentHash(input.intentHash);
      const steps: ApprovalChainResult["steps"] = [
        {
          kind: "requested" as const,
          at: resolvedProjection.requestedAt,
          intentHash: input.intentHash,
          tokenPresent: true,
          status: "pending" as const,
        },
        {
          kind: "resolved" as const,
          at: resolvedProjection.resolvedAt!,
          intentHash: input.intentHash,
          tokenPresent: true,
          status: resolvedProjection.status,
          actor: resolvedProjection.resolvedBy!,
        },
      ];
      if (resumed?.supersedes) {
        steps.push({
          kind: "resumed" as const,
          at: resumed.at,
          intentHash: resumed.intentHash,
          supersedesReason: resumed.supersedes.reason,
          tokenPresent: resumed.supersedes.token !== undefined,
          status: "approved" as const,
        });
      }
      return { steps };
    },
  };
}

describe("Approval history/chain schemas (ADR-136)", () => {
  it("ApprovalHistoryEntrySchema round-trips a resolved entry with claimed actor", () => {
    const parsed = ApprovalHistoryEntrySchema.parse({
      token: "t1",
      sessionId: "s1",
      intentHash: "0x1",
      intentKind: "deployment.rollback.execute",
      status: "approved",
      requestedAt: "2026-06-06T12:00:00.000Z",
      resolvedAt: "2026-06-06T12:05:00.000Z",
      resolvedBy: { id: "alice" },
    });
    expect(parsed.resolvedBy?.id).toBe("alice");
  });

  it("ApprovalChainStepKindSchema is the closed 3-value enum", () => {
    expect(ApprovalChainStepKindSchema.options).toEqual(["requested", "resolved", "resumed"]);
    expect(ApprovalChainStepKindSchema.safeParse("made_up").success).toBe(false);
  });

  it("ApprovalChainStepSchema rejects a non-frozen supersession reason", () => {
    const bad = {
      kind: "resumed",
      at: "2026-06-06T12:05:00.000Z",
      supersedesReason: "made_up_reason",
      tokenPresent: true,
    };
    expect(ApprovalChainStepSchema.safeParse(bad).success).toBe(false);
  });
});

describe("approval.history (ADR-136)", () => {
  it("lists resolved entries with the claimed actor", async () => {
    const caller = callerWith({
      actor: { id: "alice" },
      approvalPort: approvalPortWithHistoryChain(),
    });
    const out = await caller.approval.history({ limit: 100 });
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.status).toBe("approved");
    expect(out.entries[0]!.resolvedBy?.id).toBe("alice");
    expect(out.entries[0]!.intentKind).toBe("deployment.rollback.execute");
  });

  it("UNAUTHORIZED without an actor", async () => {
    const caller = callerWith({ approvalPort: approvalPortWithHistoryChain() });
    await expect(caller.approval.history({ limit: 100 })).rejects.toThrow(/actor required/i);
  });

  it("PRECONDITION_FAILED when the history port member is unwired", async () => {
    const caller = callerWith({
      actor: { id: "alice" },
      approvalPort: {
        async list() {
          return [resolvedProjection];
        },
        async resolve() {
          return resolvedProjection;
        },
      },
    });
    await expect(caller.approval.history({ limit: 100 })).rejects.toThrow(/not configured/i);
  });

  it("PRECONDITION_FAILED when approvalPort itself is absent", async () => {
    const caller = callerWith({ actor: { id: "alice" } });
    await expect(caller.approval.history({ limit: 100 })).rejects.toThrow(/not configured/i);
  });
});

describe("approval.chain (ADR-136)", () => {
  it("walks the seeded supersession into request → resolved → resumed", async () => {
    const caller = callerWith({
      actor: { id: "alice" },
      approvalPort: approvalPortWithHistoryChain(),
    });
    const out = await caller.approval.chain({ intentHash: RESUMED_HASH });
    expect(out.steps.map((s) => s.kind)).toEqual(["requested", "resolved", "resumed"]);
    const resumed = out.steps.find((s) => s.kind === "resumed")!;
    expect(resumed.supersedesReason).toBe("confirmation_resolved");
    // Token PRESENCE only — never the value.
    expect(resumed.tokenPresent).toBe(true);
    expect(JSON.stringify(out)).not.toContain("demo-approval-token");
  });

  it("UNAUTHORIZED without an actor", async () => {
    const caller = callerWith({ approvalPort: approvalPortWithHistoryChain() });
    await expect(caller.approval.chain({ intentHash: RESUMED_HASH })).rejects.toThrow(
      /actor required/i,
    );
  });

  it("PRECONDITION_FAILED when the chain port member is unwired", async () => {
    const caller = callerWith({
      actor: { id: "alice" },
      approvalPort: {
        async list() {
          return [resolvedProjection];
        },
        async resolve() {
          return resolvedProjection;
        },
      },
    });
    await expect(caller.approval.chain({ intentHash: RESUMED_HASH })).rejects.toThrow(
      /not configured/i,
    );
  });

  it("rejects a malformed intentHash at the schema boundary", async () => {
    const caller = callerWith({
      actor: { id: "alice" },
      approvalPort: approvalPortWithHistoryChain(),
    });
    await expect(caller.approval.chain({ intentHash: "not-a-hash" })).rejects.toThrow();
  });
});
