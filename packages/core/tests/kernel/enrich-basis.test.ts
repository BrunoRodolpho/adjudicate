/**
 * TestReviewer-001: kernel-boundary coverage for `enrichBasis`
 * (packages/core/src/kernel/adjudicate.ts) — the four under-tested Decision
 * kinds DEFER / REWRITE / ESCALATE / REQUEST_CONFIRMATION.
 *
 * `enrichBasis` prepends the accumulated pass-basis (schema → state → taint →
 * auth) to a guard's Decision while preserving each kind's discriminant fields.
 * Each test wires ONE guard returning the kind under test into a bundle's
 * `business` array, runs adjudicate() under a permissive taint policy, and
 * asserts (1) the kind, (2) the kind-specific fields survive verbatim, and
 * (3) the prior-phase pass-basis is prepended (basis[0] === "schema") with the
 * guard's own basis last.
 *
 * Pure-additive test file. Touches no production source.
 */
import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionRequestConfirmation,
  decisionRewrite,
} from "@adjudicate/core";
import { adjudicate } from "../../src/kernel/adjudicate.js";
import type { Guard, PolicyBundle } from "../../src/kernel/policy.js";

const ENV = buildEnvelope({
  kind: "order.tool.propose",
  payload: { toolName: "noop" },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  nonce: "n-enrich-basis",
  createdAt: "2026-04-23T12:00:00.000Z",
});

const PASS_BASIS = [basis("business", BASIS_CODES.business.RULE_SATISFIED)];

function bundleWith(
  guard: Guard<string, unknown, unknown>,
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [guard],
    default: "REFUSE",
  };
}

describe("enrichBasis — DEFER branch", () => {
  it("preserves signal, timeoutMs, and prepends pass-basis", () => {
    const guard: Guard<string, unknown, unknown> = () =>
      decisionDefer("manager.approval", 86_400_000, PASS_BASIS);
    const d = adjudicate(ENV, {}, bundleWith(guard));
    expect(d.kind).toBe("DEFER");
    if (d.kind !== "DEFER") return;
    expect(d.signal).toBe("manager.approval");
    expect(d.timeoutMs).toBe(86_400_000);
    // schema + state + taint + auth phases ran before business guard
    expect(d.basis[0]?.category).toBe("schema");
    expect(d.basis.at(-1)?.category).toBe("business");
  });
});

describe("enrichBasis — REWRITE branch", () => {
  it("preserves rewritten envelope, reason, and prepends pass-basis", () => {
    const rewrittenEnv = buildEnvelope({
      kind: "order.tool.propose",
      payload: { toolName: "noop_clamped" },
      actor: ENV.actor,
      taint: ENV.taint,
      nonce: "n-enrich-basis-rewritten",
      createdAt: ENV.createdAt,
    });
    const guard: Guard<string, unknown, unknown> = () =>
      decisionRewrite(rewrittenEnv, "quantity_capped", PASS_BASIS);
    const d = adjudicate(ENV, {}, bundleWith(guard));
    expect(d.kind).toBe("REWRITE");
    if (d.kind !== "REWRITE") return;
    expect((d.rewritten.payload as { toolName: string }).toolName).toBe("noop_clamped");
    expect(d.reason).toBe("quantity_capped");
    expect(d.basis[0]?.category).toBe("schema");
  });
});

describe("enrichBasis — ESCALATE branch", () => {
  it("preserves to, reason, and prepends pass-basis", () => {
    const guard: Guard<string, unknown, unknown> = () =>
      decisionEscalate("supervisor", "self-approval", PASS_BASIS);
    const d = adjudicate(ENV, {}, bundleWith(guard));
    expect(d.kind).toBe("ESCALATE");
    if (d.kind !== "ESCALATE") return;
    expect(d.to).toBe("supervisor");
    expect(d.reason).toBe("self-approval");
    expect(d.basis[0]?.category).toBe("schema");
  });
});

describe("enrichBasis — REQUEST_CONFIRMATION branch", () => {
  it("preserves prompt and prepends pass-basis", () => {
    const guard: Guard<string, unknown, unknown> = () =>
      decisionRequestConfirmation("Confirm this action?", PASS_BASIS);
    const d = adjudicate(ENV, {}, bundleWith(guard));
    expect(d.kind).toBe("REQUEST_CONFIRMATION");
    if (d.kind !== "REQUEST_CONFIRMATION") return;
    expect(d.prompt).toBe("Confirm this action?");
    expect(d.basis[0]?.category).toBe("schema");
  });
});
