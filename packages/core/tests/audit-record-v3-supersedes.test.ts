/**
 * AuditRecord v3 — supersedes link to predecessor adjudications.
 *
 * The v2 → v3 bump must be additive: existing fields unchanged, new
 * `supersedes` optional, v2 records still load.
 */

import { describe, expect, it } from "vitest";
import {
  AUDIT_RECORD_VERSION,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  basis,
  BASIS_CODES,
  type Supersession,
  type SupersessionReason,
} from "../src/index.js";

function envFixture() {
  return buildEnvelope({
    kind: "order.tool.propose",
    payload: { sku: "X", qty: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test",
    createdAt: "2026-04-23T12:00:00.000Z",
  });
}

function decisionFixture() {
  return decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]);
}

describe("AUDIT_RECORD_VERSION is 5", () => {
  it("the live version literal is 5", () => {
    expect(AUDIT_RECORD_VERSION).toBe(5);
  });
});

describe("AuditRecord supersedes (v3)", () => {
  const reasons: readonly SupersessionReason[] = [
    "confirmation_resolved",
    "defer_resumed",
    "rewrite_executed",
    "replay",
    "lgpd_scrub",
  ];

  for (const reason of reasons) {
    it(`carries supersedes when reason=${reason}`, () => {
      const supersession: Supersession = {
        predecessorIntentHash: "a".repeat(64),
        predecessorAt: "2026-04-23T11:59:00.000Z",
        reason,
        token: reason === "confirmation_resolved" ? "cr-token-1" : undefined,
      };
      const r = buildAuditRecord({
        envelope: envFixture(),
        decision: decisionFixture(),
        durationMs: 5,
        at: "2026-04-23T12:00:01.000Z",
        supersedes: supersession,
      });
      expect(r.version).toBe(5);
      expect(r.supersedes).toEqual(supersession);
    });
  }

  it("omits supersedes when not supplied (back-compat: v3-shaped record under v4)", () => {
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
    });
    expect(r.version).toBe(5);
    expect(r.supersedes).toBeUndefined();
  });

  it("supersedes is preserved through JSON round-trip (Postgres replay)", () => {
    const supersession: Supersession = {
      predecessorIntentHash: "b".repeat(64),
      predecessorAt: "2026-04-23T11:00:00.000Z",
      reason: "defer_resumed",
      token: "resume-tok",
    };
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 2,
      at: "2026-04-23T12:00:01.000Z",
      supersedes: supersession,
    });
    const round = JSON.parse(JSON.stringify(r)) as typeof r;
    expect(round.supersedes).toEqual(supersession);
  });
});
