/**
 * ADR-124: the optional metadataProvider runs after buildAuditRecord and before
 * sink.emit, on the main path AND the kill-switch path, defensively (a throwing
 * provider never blocks emission), and never affects the Decision or intentHash.
 */
import { describe, expect, it, vi } from "vitest";
import { adjudicateAndAudit, createRuntimeContext } from "../../src/kernel/index.js";
import { buildEnvelope } from "../../src/envelope.js";
import type { AuditRecord, AuditSink, PolicyBundle } from "../../src/index.js";

const policy: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: { minimumFor: () => "UNTRUSTED" },
  business: [() => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] })],
  default: "REFUSE",
};

function env(nonce = "n-1") {
  return buildEnvelope({
    kind: "x.do",
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: "2026-04-29T12:00:00.000Z",
  });
}

function capturingSink(): { sink: AuditSink; records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return { sink: { async emit(r) { records.push(r); } }, records };
}

describe("metadataProvider (ADR-124)", () => {
  it("attaches metadata to the emitted record on the main path", async () => {
    const { sink, records } = capturingSink();
    await adjudicateAndAudit(env(), {}, policy, {
      sink,
      metadataProvider: (r) => ({ hallucination_score: 0.42, kind: r.decision.kind }),
    });
    expect(records[0]!.metadata).toEqual({ hallucination_score: 0.42, kind: "EXECUTE" });
  });

  it("runs on the kill-switch path too", async () => {
    const ctx = createRuntimeContext({ id: "mp" });
    ctx.killSwitch.set(true, "test");
    const { sink, records } = capturingSink();
    await adjudicateAndAudit(env(), {}, policy, {
      sink,
      context: ctx,
      metadataProvider: () => ({ tagged: true }),
    });
    expect(records[0]!.decision.kind).toBe("REFUSE");
    expect(records[0]!.metadata).toEqual({ tagged: true });
  });

  it("a throwing provider does NOT block emission (record emitted without metadata)", async () => {
    const { sink, records } = capturingSink();
    await adjudicateAndAudit(env(), {}, policy, {
      sink,
      metadataProvider: () => {
        throw new Error("scorer boom");
      },
    });
    expect(records.length).toBe(1);
    expect(records[0]!.metadata).toBeUndefined();
  });

  it("does not affect the Decision or intentHash vs no provider", async () => {
    // A FIXED clock is load-bearing here: `at` and `durationMs` are part of the
    // hashed `baseRecord`, so two real-time adjudicateAndAudit calls would derive
    // DIFFERENT auditHashes whether or not metadata is involved — making the
    // metadata-exclusion assertion below racy (it passed only when both calls
    // landed in the same millisecond). Pinning the clock isolates the metadata
    // variable so the auditHash equality genuinely tests "metadata excluded".
    const clock = { nowIso: () => "2026-04-29T12:00:00.000Z", nowMs: () => 1_000 };
    const a = capturingSink();
    const b = capturingSink();
    await adjudicateAndAudit(env("same"), {}, policy, { sink: a.sink, clock });
    await adjudicateAndAudit(env("same"), {}, policy, { sink: b.sink, clock, metadataProvider: () => ({ x: 1 }) });
    expect(a.records[0]!.intentHash).toBe(b.records[0]!.intentHash);
    expect(a.records[0]!.decision.kind).toBe(b.records[0]!.decision.kind);
    // Same input + same clock; the ONLY difference is metadata. Equal auditHash
    // ⟹ metadata is excluded from the pre-image. (b carries metadata, a does not.)
    expect(b.records[0]!.metadata).toEqual({ x: 1 });
    expect(a.records[0]!.metadata).toBeUndefined();
    expect(a.records[0]!.auditHash).toBe(b.records[0]!.auditHash); // metadata excluded from hash
  });

  it("a provider returning undefined yields no metadata", async () => {
    const { sink, records } = capturingSink();
    await adjudicateAndAudit(env(), {}, policy, { sink, metadataProvider: () => undefined });
    expect(records[0]!.metadata).toBeUndefined();
  });
});
