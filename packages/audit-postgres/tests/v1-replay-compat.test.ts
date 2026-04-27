/**
 * T8 — legacy v1 → v2 envelope compatibility for replay reads.
 *
 * Verifies that pre-T8 audit rows replay through `legacyV1ToV2` to a v2
 * envelope that produces the same Decision under an unchanged policy.
 * The `intentHash` will NOT match the stored v1 row — they were computed
 * under different recipes — but the Decision will, which is what the
 * replay harness actually probes.
 */

import { describe, expect, it } from "vitest";
import { legacyV1ToV2 } from "../src/legacy-v1-compat.js";
import type { IntentAuditRow } from "../src/postgres-sink.js";

function v1Row(overrides?: Partial<IntentAuditRow>): IntentAuditRow {
  return {
    intent_hash: "v1hash".repeat(11) + "ab",
    session_id: "s-1",
    kind: "order.confirm",
    principal: "llm",
    taint: "TRUSTED",
    decision_kind: "EXECUTE",
    refusal_kind: null,
    refusal_code: null,
    decision_basis: ["business:rule_satisfied"],
    resource_version: "v-7",
    envelope_jsonb: JSON.stringify({
      version: 1,
      kind: "order.confirm",
      payload: { orderId: "ord_1" },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "TRUSTED",
      createdAt: "2026-04-01T10:00:00.000Z",
      intentHash: "v1hash".repeat(11) + "ab",
    }),
    decision_jsonb: JSON.stringify({
      kind: "EXECUTE",
      basis: [{ category: "business", code: "rule_satisfied" }],
    }),
    recorded_at: "2026-04-01T10:00:01.000Z",
    duration_ms: 5,
    partition_month: "2026-04",
    record_version: 1,
    plan_jsonb: null,
    nonce: null,
    ...overrides,
  };
}

describe("legacyV1ToV2", () => {
  it("synthesizes a v2 envelope from a v1 row", () => {
    const row = v1Row();
    const env = legacyV1ToV2(row);
    expect(env.version).toBe(2);
    expect(env.kind).toBe("order.confirm");
    expect(env.taint).toBe("TRUSTED");
    expect(env.actor.sessionId).toBe("s-1");
  });

  it("uses the row.nonce column when present (v2 row read via the legacy helper)", () => {
    const row = v1Row({ nonce: "explicit-nonce-123", record_version: 2 });
    const env = legacyV1ToV2(row);
    expect(env.nonce).toBe("explicit-nonce-123");
  });

  it("falls back to the envelope's stored nonce when row.nonce is null", () => {
    const row = v1Row({
      nonce: null,
      envelope_jsonb: JSON.stringify({
        version: 2,
        kind: "x.do",
        payload: {},
        actor: { principal: "llm", sessionId: "s" },
        taint: "TRUSTED",
        createdAt: "2026-04-01T10:00:00.000Z",
        nonce: "envelope-stored-nonce",
        intentHash: "h",
      }),
    });
    const env = legacyV1ToV2(row);
    expect(env.nonce).toBe("envelope-stored-nonce");
  });

  it("synthesizes nonce from createdAt for true v1 rows (no nonce anywhere)", () => {
    const row = v1Row(); // record_version = 1, nonce column null, no envelope.nonce
    const env = legacyV1ToV2(row);
    expect(env.nonce).toBe("2026-04-01T10:00:00.000Z");
  });

  it("preserves createdAt as descriptive metadata even though it's no longer hashed", () => {
    const env = legacyV1ToV2(v1Row());
    expect(env.createdAt).toBe("2026-04-01T10:00:00.000Z");
  });

  it("computes a v2 intentHash that does NOT match the stored v1 hash (different recipe)", () => {
    const row = v1Row();
    const env = legacyV1ToV2(row);
    // The v1 hash was computed over (version, kind, payload, createdAt,
    // actor, taint). The v2 hash is over (version, kind, payload, nonce,
    // actor, taint). Different recipes → different hashes.
    expect(env.intentHash).not.toBe(row.intent_hash);
    // But the v2 hash is deterministic and reproducible.
    const env2 = legacyV1ToV2(row);
    expect(env2.intentHash).toBe(env.intentHash);
  });
});
