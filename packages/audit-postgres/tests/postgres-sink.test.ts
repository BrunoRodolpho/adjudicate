import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  verifyAuditRecord,
} from "@adjudicate/core";
import {
  createPostgresSink,
  partitionMonthOf,
  recordToRow,
  type PostgresWriter,
} from "../src/postgres-sink.js";
import { rowToRecord } from "../src/replay.js";

function record(overrides: { decision?: "EXECUTE" | "REFUSE" } = {}) {
  const env = buildEnvelope({
    kind: "order.submit",
    payload: { sku: "X", qty: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "TRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
  const dec =
    overrides.decision === "REFUSE"
      ? decisionRefuse(refuse("SECURITY", "x", "y", "operator detail"), [
          basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT),
        ])
      : decisionExecute([
          basis("state", BASIS_CODES.state.TRANSITION_VALID),
          basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
        ]);
  return buildAuditRecord({
    envelope: env,
    decision: dec,
    durationMs: 7,
    resourceVersion: "v3",
    at: "2026-04-23T12:00:01.000Z",
  });
}

describe("partitionMonthOf", () => {
  it("extracts YYYY-MM from ISO-8601", () => {
    expect(partitionMonthOf("2026-04-23T12:00:00.000Z")).toBe("2026-04");
    expect(partitionMonthOf("2025-12-31T23:59:59.999Z")).toBe("2025-12");
  });

  it("falls back to UTC date for non-standard input", () => {
    // Real ISO-8601 always has YYYY-MM at the start; stay defensive.
    expect(partitionMonthOf("2026/04/23")).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("recordToRow", () => {
  it("flattens envelope + decision into row shape", () => {
    const r = record();
    const row = recordToRow(r);
    expect(row.intent_hash).toBe(r.intentHash);
    expect(row.session_id).toBe("s-1");
    expect(row.kind).toBe("order.submit");
    expect(row.principal).toBe("llm");
    expect(row.taint).toBe("TRUSTED");
    expect(row.decision_kind).toBe("EXECUTE");
    expect(row.refusal_kind).toBe(null);
    expect(row.refusal_code).toBe(null);
    expect(row.resource_version).toBe("v3");
    expect(row.duration_ms).toBe(7);
    expect(row.partition_month).toBe("2026-04");
    expect(row.recorded_at).toBe("2026-04-23T12:00:01.000Z");
  });

  it("includes refusal metadata when decision is REFUSE", () => {
    const r = record({ decision: "REFUSE" });
    const row = recordToRow(r);
    expect(row.decision_kind).toBe("REFUSE");
    expect(row.refusal_kind).toBe("SECURITY");
    expect(row.refusal_code).toBe("x");
  });

  it("flattens decision_basis to category:code strings", () => {
    const r = record();
    const row = recordToRow(r);
    expect(row.decision_basis).toEqual([
      "state:transition_valid",
      "auth:scope_sufficient",
    ]);
  });

  it("envelope_jsonb is parseable JSON of the original envelope", () => {
    const r = record();
    const row = recordToRow(r);
    const parsed = JSON.parse(row.envelope_jsonb);
    expect(parsed.intentHash).toBe(r.intentHash);
    expect(parsed.payload.sku).toBe("X");
  });
});

describe("PostgresSink — emit", () => {
  it("calls writer.insertAudit with the row", async () => {
    const writer: PostgresWriter = { insertAudit: vi.fn(async () => {}) };
    const sink = createPostgresSink({ writer });
    const r = record();
    await sink.emit(r);
    expect(writer.insertAudit).toHaveBeenCalledOnce();
    const calledRow = (writer.insertAudit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(calledRow.intent_hash).toBe(r.intentHash);
  });

  it("rethrows on writer failure and invokes onError", async () => {
    const onError = vi.fn();
    const writer: PostgresWriter = {
      insertAudit: async () => {
        throw new Error("db down");
      },
    };
    const sink = createPostgresSink({ writer, onError });
    await expect(sink.emit(record())).rejects.toThrow("db down");
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("rowToRecord — round-trip with recordToRow", () => {
  it("recovers the original AuditRecord", () => {
    const original = record();
    const row = recordToRow(original);
    const recovered = rowToRecord(row);
    expect(recovered.intentHash).toBe(original.intentHash);
    expect(recovered.envelope.kind).toBe(original.envelope.kind);
    expect(recovered.envelope.taint).toBe(original.envelope.taint);
    expect(recovered.decision.kind).toBe(original.decision.kind);
    expect(recovered.decision.basis.length).toBe(original.decision.basis.length);
    expect(recovered.durationMs).toBe(original.durationMs);
    expect(recovered.at).toBe(original.at);
  });

  it("recovers REFUSE decisions including refusal payload", () => {
    const original = record({ decision: "REFUSE" });
    const row = recordToRow(original);
    const recovered = rowToRecord(row);
    expect(recovered.decision.kind).toBe("REFUSE");
    if (recovered.decision.kind !== "REFUSE") return;
    expect(recovered.decision.refusal.kind).toBe("SECURITY");
    expect(recovered.decision.refusal.code).toBe("x");
  });

  it("round-trips a v3 record carrying a plan snapshot", () => {
    const env = buildEnvelope({
      kind: "order.submit",
      payload: { sku: "X" },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "TRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const original = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
      ]),
      durationMs: 7,
      at: "2026-04-23T12:00:01.000Z",
      plan: {
        visibleReadTools: ["search", "view_cart"],
        allowedIntents: ["order.submit"],
      },
    });
    const row = recordToRow(original);
    expect(row.record_version).toBe(4);
    expect(row.plan_jsonb).not.toBeNull();
    const recovered = rowToRecord(row);
    expect(recovered.version).toBe(4);
    expect(recovered.plan).toBeDefined();
    expect(recovered.plan!.visibleReadTools).toEqual(["search", "view_cart"]);
    expect(recovered.plan!.allowedIntents).toEqual(["order.submit"]);
    expect(recovered.plan!.planFingerprint).toBe(original.plan!.planFingerprint);
  });

  it("round-trips a v3 record carrying a supersedes link", () => {
    const env = buildEnvelope({
      kind: "order.submit",
      payload: { sku: "X" },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "TRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const original = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
      ]),
      durationMs: 4,
      at: "2026-04-23T12:00:01.000Z",
      supersedes: {
        predecessorIntentHash: "a".repeat(64),
        predecessorAt: "2026-04-23T11:59:00.000Z",
        reason: "confirmation_resolved",
        token: "cr-tok-1",
      },
    });
    const row = recordToRow(original);
    expect(row.record_version).toBe(4);
    expect(row.supersedes_jsonb).not.toBeNull();
    const recovered = rowToRecord(row);
    expect(recovered.version).toBe(4);
    expect(recovered.supersedes).toEqual({
      predecessorIntentHash: "a".repeat(64),
      predecessorAt: "2026-04-23T11:59:00.000Z",
      reason: "confirmation_resolved",
      token: "cr-tok-1",
    });
  });

  it("treats a v2 row (record_version=2, NULL supersedes_jsonb) as a v2 record without supersedes", () => {
    const original = record();
    const row = {
      ...recordToRow(original),
      record_version: 2 as const,
      supersedes_jsonb: null,
    };
    const recovered = rowToRecord(row);
    expect(recovered.version).toBe(2);
    expect(recovered.supersedes).toBeUndefined();
  });

  it("treats record_version=1 with NULL plan_jsonb as a v1 record (back-compat)", () => {
    // Simulate a row written by a pre-v2 backfill: record_version=1, plan_jsonb=null.
    const original = record();
    const row = { ...recordToRow(original), record_version: 1 as const, plan_jsonb: null };
    const recovered = rowToRecord(row);
    expect(recovered.version).toBe(1);
    expect(recovered.plan).toBeUndefined();
  });

  it("round-trips a record produced by adjudicateAndAudit (P0-2 forward-compat smoke test)", async () => {
    /*
     * Post-P0-2 the Anthropic adapter emits AuditRecords through
     * `adjudicateAndAudit` instead of building them by hand. This smoke
     * test pins the property: records produced by the kernel-side
     * emission path round-trip through Postgres serialization with
     * byte-equality on the load-bearing fields. Without this, a future
     * kernel change that adds a field could silently break audit-postgres
     * before P1-2 (supersession) bumps AUDIT_RECORD_VERSION.
     */
    const { adjudicateAndAudit } = await import("@adjudicate/core/kernel");
    const { buildEnvelope } = await import("@adjudicate/core");
    type AuditRecord = import("@adjudicate/core").AuditRecord;
    type AuditSink = import("@adjudicate/core").AuditSink;

    const env = buildEnvelope({
      kind: "order.submit",
      payload: { sku: "X", qty: 1 },
      actor: { principal: "llm", sessionId: "s-roundtrip" },
      taint: "UNTRUSTED",
      nonce: "n-roundtrip-test",
      createdAt: "2026-05-13T12:00:00.000Z",
    });

    const captured: AuditRecord[] = [];
    const captureSink: AuditSink = {
      async emit(r) {
        captured.push(r);
      },
    };

    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [],
      default: "EXECUTE" as const,
    };

    await adjudicateAndAudit(env, {}, policy, {
      sink: captureSink,
      plan: () => ({
        visibleReadTools: ["search"],
        allowedIntents: ["order.submit"],
      }),
    });

    expect(captured).toHaveLength(1);
    const original = captured[0]!;

    const row = recordToRow(original);
    const recovered = rowToRecord(row);

    expect(recovered.intentHash).toBe(original.intentHash);
    expect(recovered.envelope.kind).toBe(original.envelope.kind);
    expect(recovered.envelope.taint).toBe(original.envelope.taint);
    expect(recovered.envelope.nonce).toBe(original.envelope.nonce);
    expect(recovered.envelope.actor.principal).toBe(original.envelope.actor.principal);
    expect(recovered.envelope.actor.sessionId).toBe(original.envelope.actor.sessionId);
    expect(recovered.decision.kind).toBe(original.decision.kind);
    expect(recovered.decision.basis.length).toBe(original.decision.basis.length);
    expect(recovered.version).toBe(original.version);
    expect(recovered.plan).toBeDefined();
    expect(recovered.plan!.visibleReadTools).toEqual(["search"]);
    expect(recovered.plan!.allowedIntents).toEqual(["order.submit"]);
    expect(recovered.plan!.planFingerprint).toBe(original.plan!.planFingerprint);
  });
});

// A v4 record carrying every optional field that participates in the
// auditHash pre-image: resourceVersion, supersedes, kernelIdentity,
// policyVersion, kernelVersion.
function v4Record() {
  const env = buildEnvelope({
    kind: "order.submit",
    payload: { sku: "X", qty: 2 },
    actor: { principal: "llm", sessionId: "s-v4" },
    taint: "UNTRUSTED",
    nonce: "n-v4",
    createdAt: "2026-05-13T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
    ]),
    durationMs: 9,
    resourceVersion: "rv-1",
    at: "2026-05-13T12:00:01.000Z",
    policyVersion: "1.2.3",
    kernelVersion: "1.1.0",
    kernelIdentity: { id: "kernel-prod", version: "build-42" },
    supersedes: {
      predecessorIntentHash: "b".repeat(64),
      predecessorAt: "2026-05-13T11:59:00.000Z",
      reason: "confirmation_resolved",
      token: "cr-1",
    },
  });
}

describe("v4 tamper-evidence persistence (RC-K1)", () => {
  it("recordToRow populates every v4 column", () => {
    const r = v4Record();
    const row = recordToRow(r);
    expect(row.record_version).toBe(4);
    expect(row.audit_hash).toBe(r.auditHash);
    expect(row.policy_version).toBe("1.2.3");
    expect(row.kernel_version).toBe("1.1.0");
    expect(JSON.parse(row.kernel_identity_jsonb!)).toEqual({
      id: "kernel-prod",
      version: "build-42",
    });
    expect(row.supersedes_jsonb).not.toBeNull();
  });

  it("round-trips so verifyAuditRecord confirms the record is intact", () => {
    const r = v4Record();
    const recovered = rowToRecord(recordToRow(r));
    // auditHash survives the round-trip AND re-derivation matches it →
    // tamper-evidence preserved end-to-end (was missing_hash before RC-K1).
    expect(recovered.auditHash).toBe(r.auditHash);
    expect(verifyAuditRecord(recovered).verified).toBe(true);
    // Structural fidelity of the hashed optional fields.
    expect(recovered.policyVersion).toBe("1.2.3");
    expect(recovered.kernelVersion).toBe("1.1.0");
    expect(recovered.kernelIdentity).toEqual({
      id: "kernel-prod",
      version: "build-42",
    });
  });

  it("verifies a plain v4 record (no v3/v4 extras) after round-trip", () => {
    const recovered = rowToRecord(recordToRow(record()));
    expect(verifyAuditRecord(recovered).verified).toBe(true);
  });

  it("round-trips a signature without disturbing hash verification", () => {
    const signed = {
      ...v4Record(),
      signature: { keyId: "k1", alg: "ed25519", value: "sig-bytes" },
    };
    const recovered = rowToRecord(recordToRow(signed));
    expect(recovered.signature).toEqual({
      keyId: "k1",
      alg: "ed25519",
      value: "sig-bytes",
    });
    // signature is excluded from the hash pre-image, so verification holds.
    expect(verifyAuditRecord(recovered).verified).toBe(true);
  });

  it("flags tampering when a hashed field is mutated post-round-trip", () => {
    const recovered = rowToRecord(recordToRow(v4Record()));
    const tampered = { ...recovered, durationMs: recovered.durationMs + 1000 };
    expect(verifyAuditRecord(tampered).verified).toBe(false);
  });
});

describe("migration 008 — record_version CHECK (DataReviewer-001)", () => {
  const sql = readFileSync(
    new URL("../migrations/008-add-v4-fields.sql", import.meta.url),
    "utf-8",
  );

  it("widens the record_version CHECK to admit v4 inserts", () => {
    expect(sql).toMatch(
      /record_version\s+IN\s*\(\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\)/,
    );
  });

  it("adds the kernel_identity_jsonb column", () => {
    expect(sql).toMatch(/kernel_identity_jsonb/);
  });
});
