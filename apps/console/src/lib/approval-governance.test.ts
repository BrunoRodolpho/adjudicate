import { describe, expect, it } from "vitest";
import { approverCount, escalationDue, quorumProgress } from "./approval-governance";

describe("quorumProgress", () => {
  it("returns null when the row carries no quorum policy", () => {
    expect(quorumProgress({ quorum: undefined, approvals: [{ id: "a", at: "t" }] })).toBeNull();
  });

  it("counts distinct approvers by default (N/M, met when N>=M)", () => {
    const p = quorumProgress({
      quorum: { minApprovals: 2 },
      approvals: [
        { id: "a", at: "t1" },
        { id: "a", at: "t2" }, // dup — ignored
        { id: "b", at: "t3" },
      ],
    });
    expect(p).toEqual({ count: 2, required: 2, met: true });
  });

  it("counts raw votes when distinctApprovers is false", () => {
    const p = quorumProgress({
      quorum: { minApprovals: 3, distinctApprovers: false },
      approvals: [
        { id: "a", at: "t1" },
        { id: "a", at: "t2" },
      ],
    });
    expect(p).toEqual({ count: 2, required: 3, met: false });
  });
});

describe("approverCount", () => {
  it("is 0 when absent", () => {
    expect(approverCount({ approvals: undefined })).toBe(0);
    expect(approverCount({ approvals: [{ id: "a", at: "t" }] })).toBe(1);
  });
});

describe("escalationDue", () => {
  const at = "2026-06-17T00:00:00.000Z";
  const base = Date.parse(at);

  it("is true once a pending row passes its escalation deadline", () => {
    const row = { status: "pending" as const, requestedAt: at, escalation: { afterMs: 1000, to: "human" as const } };
    expect(escalationDue(row, base + 999)).toBe(false);
    expect(escalationDue(row, base + 1000)).toBe(true);
  });

  it("is false without an escalation policy or once resolved", () => {
    expect(escalationDue({ status: "pending", requestedAt: at }, base + 10_000)).toBe(false);
    expect(
      escalationDue({ status: "approved", requestedAt: at, escalation: { afterMs: 1, to: "human" } }, base + 10_000),
    ).toBe(false);
  });
});
