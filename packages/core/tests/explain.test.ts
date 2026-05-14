/**
 * explainRecord — translate AuditRecord → DecisionExplanation.
 *
 * The kernel ships a default English registry; adopters extend it. These
 * tests pin the behaviour expected by the operator console's WhyNotPanel.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPLANATION_REGISTRY,
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  explainRecord,
  refuse,
  type AuditRecord,
} from "../src/index.js";

function envFixture() {
  return buildEnvelope({
    kind: "order.refund",
    payload: { amount: 1000 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test",
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

function execFixture(): AuditRecord {
  return buildAuditRecord({
    envelope: envFixture(),
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
    ]),
    durationMs: 4,
    at: "2026-05-13T12:00:01.000Z",
  });
}

describe("explainRecord", () => {
  it("returns a DecisionExplanation with the record's intentHash and the registry locale", () => {
    const out = explainRecord(execFixture(), DEFAULT_EXPLANATION_REGISTRY);
    expect(out.intentHash).toBe(envFixture().intentHash);
    expect(out.locale).toBe("en-US");
  });

  it("renders one bullet per basis entry", () => {
    const out = explainRecord(execFixture(), DEFAULT_EXPLANATION_REGISTRY);
    expect(out.bullets).toHaveLength(2);
    expect(out.bullets[0]).toContain("valid state transition");
    expect(out.bullets[1]).toContain("sufficient scope");
  });

  it("substitutes {field} placeholders from basis.details", () => {
    const record = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionRefuse(
        refuse("SECURITY", "kill_switch_active", "Down"),
        [
          basis("kill", BASIS_CODES.kill.ACTIVE, {
            reason: "deploy_block",
            toggledAt: "2026-05-13T11:59:00.000Z",
            tenant: "acme",
          }),
        ],
      ),
      durationMs: 1,
      at: "2026-05-13T12:00:01.000Z",
    });
    const out = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(out.bullets[0]).toBe(
      "The kill switch is active (reason: deploy_block, toggled at 2026-05-13T11:59:00.000Z).",
    );
  });

  it("falls back to 'category:code' literal when no template matches", () => {
    const record = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionExecute([
        // Synthetic basis with no registered template.
        { category: "business", code: "unknown_future_code" as never },
      ]),
      durationMs: 1,
      at: "2026-05-13T12:00:01.000Z",
    });
    const out = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(out.bullets[0]).toBe("business:unknown_future_code");
  });

  it("uses headlines override when provided for the decision kind", () => {
    const out = explainRecord(execFixture(), {
      ...DEFAULT_EXPLANATION_REGISTRY,
      headlines: {
        EXECUTE: (r) => `Refunded ${r.envelope.kind} for the customer.`,
      },
    });
    expect(out.headline).toBe("Refunded order.refund for the customer.");
  });

  it("uses defaultHeadline when no headlines override exists", () => {
    const out = explainRecord(execFixture(), DEFAULT_EXPLANATION_REGISTRY);
    expect(out.headline).toBe("Executed: order.refund");
  });

  it("keeps literal {field} when the basis details lack the key (misconfig surfacing)", () => {
    const out = explainRecord(
      buildAuditRecord({
        envelope: envFixture(),
        decision: decisionRefuse(refuse("SECURITY", "kill_switch_active", "Down"), [
          basis("kill", BASIS_CODES.kill.ACTIVE), // details omitted
        ]),
        durationMs: 1,
        at: "2026-05-13T12:00:01.000Z",
      }),
      DEFAULT_EXPLANATION_REGISTRY,
    );
    expect(out.bullets[0]).toBe(
      "The kill switch is active (reason: {reason}, toggled at {toggledAt}).",
    );
  });
});
