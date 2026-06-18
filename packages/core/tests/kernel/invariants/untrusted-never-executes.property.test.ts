/**
 * Invariant: UNTRUSTED never yields EXECUTE (when policy demands TRUSTED or higher).
 *
 * This is the load-bearing property of the Zero-Trust bridge. If it fails once,
 * the kernel has a path by which user-origin content escalates authority.
 *
 * Phrased as an invariant over the *outcome*, not over the implementation —
 * regardless of which guard, which state, or which business rule, an UNTRUSTED
 * envelope MUST NOT produce EXECUTE for an intent kind whose policy demands
 * TRUSTED/SYSTEM.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  decisionRewrite,
  noopAuditSink,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import { adjudicateAndAudit } from "../../../src/kernel/adjudicate-and-audit.js";
import type { Guard, PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");

const HIGH_TRUST_KINDS = [
  "payment.send",
  "order.submit",
  "pix.send",
  "refund.issue",
] as const;

const intentKindArb = fc.constantFrom(...HIGH_TRUST_KINDS);

const hightrustPolicy: TaintPolicy = {
  minimumFor: () => "SYSTEM",
};

function emptyBundle(
  defaultKind: "REFUSE" | "EXECUTE" = "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: hightrustPolicy,
    business: [],
    default: defaultKind,
  };
}

// TestReviewer-008: fuzz with deeply-nested JSON-safe payloads instead of the
// trivial { x: 1 }; coverage comes from payload SHAPE. numRuns capped at 1_000
// (recursive payloads are heavier than a flat scalar — same cap as
// v2-hash-stability).
function env(
  kind: string,
  taint: Taint,
  payload: Record<string, unknown>,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

describe("invariant: UNTRUSTED never yields EXECUTE when policy demands SYSTEM", () => {
  it("holds for any UNTRUSTED envelope and any high-trust intent kind", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "UNTRUSTED", payload), {}, emptyBundle());
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds when the default is EXECUTE (fail-open default must still refuse taint)", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(
          env(kind, "UNTRUSTED", payload),
          {},
          emptyBundle("EXECUTE"),
        );
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds when the default is REFUSE", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(
          env(kind, "UNTRUSTED", payload),
          {},
          emptyBundle("REFUSE"),
        );
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: TRUSTED never yields EXECUTE when policy demands SYSTEM", () => {
  it("blocks TRUSTED from SYSTEM-minimum kinds", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "TRUSTED", payload), {}, emptyBundle());
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: SYSTEM passes the taint gate for any intent kind", () => {
  it("allows SYSTEM-taint envelopes through the taint layer", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "SYSTEM", payload), {}, emptyBundle());
        expect(decision.kind).toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

// ── 011/T1+T2+T5: REWRITE never launders an UNTRUSTED proposal to EXECUTE ──
//
// Two complementary properties:
//   (a) the PURE kernel blocks a taint-ELEVATING rewrite (UNTRUSTED→SYSTEM) at
//       `gateRewrite` — it REFUSEs, never returns the REWRITE (invariant #7, §C).
//   (b) the AUDITED shell re-adjudicates a surviving REWRITE and only a
//       second-pass EXECUTE reaches the executor — a rewrite whose rewritten
//       envelope is still UNTRUSTED for a SYSTEM-min kind never EXECUTEs
//       (invariant #1).
describe("invariant: a REWRITE never elevates taint or bypasses the taint gate", () => {
  const permissivePolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

  function bundleWithBusiness(
    guard: Guard<string, unknown, unknown>,
    taint: TaintPolicy = permissivePolicy,
    def: "REFUSE" | "EXECUTE" = "REFUSE",
  ): PolicyBundle<string, unknown, unknown> {
    return {
      stateGuards: [],
      authGuards: [],
      taint,
      business: [guard],
      default: def,
    };
  }

  it("(a) pure kernel: a taint-elevating REWRITE (UNTRUSTED→SYSTEM) REFUSEs, never REWRITE/EXECUTE", () => {
    const original = env("order.submit", "UNTRUSTED", { x: 1 });
    // A rewritten envelope that ELEVATES taint to SYSTEM (friction-decreasing).
    const elevated = buildEnvelope<string, unknown>({
      kind: "order.submit",
      payload: { x: 1 },
      actor: original.actor,
      taint: "SYSTEM",
      nonce: "n-elevated",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    const guard: Guard<string, unknown, unknown> = () =>
      decisionRewrite(elevated, "laundering attempt", []);
    const decision = adjudicate(original, {}, bundleWithBusiness(guard));
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(
      decision.basis.some(
        (b) => b.category === "taint" && b.code === "propagation_violation",
      ),
    ).toBe(true);
  });

  it("(a') a non-elevating REWRITE (same taint) survives the gate as REWRITE", () => {
    const original = env("order.submit", "UNTRUSTED", { x: 1 });
    const same = buildEnvelope<string, unknown>({
      kind: "order.submit",
      payload: { x: 2 },
      actor: original.actor,
      taint: "UNTRUSTED",
      nonce: "n-same",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    const guard: Guard<string, unknown, unknown> = () =>
      decisionRewrite(same, "clamp", []);
    const decision = adjudicate(original, {}, bundleWithBusiness(guard));
    expect(decision.kind).toBe("REWRITE");
  });

  it("(b) audited shell: a REWRITE re-adjudicating to a taint REFUSE never EXECUTEs", async () => {
    // SYSTEM-min policy. The original is SYSTEM (passes the gate to reach the
    // rewrite guard); the rewrite drops taint to UNTRUSTED (allowed — that is
    // friction-INCREASING). The rewritten envelope then fails the taint gate on
    // re-adjudication, so the second pass is REFUSE — never EXECUTE.
    const systemMin: TaintPolicy = { minimumFor: () => "SYSTEM" };
    const original = env("order.submit", "SYSTEM", { x: 1 });
    const downgraded = buildEnvelope<string, unknown>({
      kind: "order.submit",
      payload: { x: 1 },
      actor: original.actor,
      taint: "UNTRUSTED",
      nonce: "n-downgraded",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    const guard: Guard<string, unknown, unknown> = (e) =>
      e.taint === "SYSTEM"
        ? decisionRewrite(downgraded, "downgrade", [])
        : null;
    const { decision } = await adjudicateAndAudit(
      original,
      {},
      // default EXECUTE makes the failure mode maximally adversarial.
      bundleWithBusiness(guard, systemMin, "EXECUTE"),
      { sink: noopAuditSink() },
    );
    expect(decision.kind).not.toBe("EXECUTE");
    expect(decision.kind).toBe("REFUSE");
  });

  it("(b') a REWRITE whose rewritten envelope re-adjudicates to EXECUTE keeps REWRITE", async () => {
    // Permissive taint + default EXECUTE: the rewritten envelope re-adjudicates
    // to EXECUTE, so the REWRITE stands (the adapter executes the rewritten bytes).
    const original = env("order.submit", "UNTRUSTED", { x: 1 });
    const clamped = buildEnvelope<string, unknown>({
      kind: "order.submit",
      payload: { x: 9 },
      actor: original.actor,
      taint: "UNTRUSTED",
      nonce: "n-clamped",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    // Rewrite only on the ORIGINAL payload; the rewritten payload ({x:9}) falls
    // through to the EXECUTE default. (Single-pass: no REWRITE→REWRITE loop.)
    const guard: Guard<string, unknown, unknown> = (e) =>
      (e.payload as { x: number }).x === 1
        ? decisionRewrite(clamped, "clamp", [])
        : null;
    const { decision, record } = await adjudicateAndAudit(
      original,
      {},
      bundleWithBusiness(guard, permissivePolicy, "EXECUTE"),
      { sink: noopAuditSink() },
    );
    expect(decision.kind).toBe("REWRITE");
    // The audit row indexes the EXECUTED (rewritten) hash, linked back to original.
    expect(record.intentHash).toBe(clamped.intentHash);
    expect(record.supersedes?.reason).toBe("rewrite_executed");
    expect(record.supersedes?.predecessorIntentHash).toBe(original.intentHash);
  });

  it("(b'') REWRITE→REWRITE is bounded to a single pass (collapses to REFUSE)", async () => {
    // A guard that ALWAYS rewrites would recurse; the shell bounds it to one
    // pass — the second-pass REWRITE collapses to REFUSE, never EXECUTE.
    const original = env("order.submit", "UNTRUSTED", { x: 1 });
    const alwaysRewriteTarget = buildEnvelope<string, unknown>({
      kind: "order.submit",
      payload: { x: 2 },
      actor: original.actor,
      taint: "UNTRUSTED",
      nonce: "n-loop",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    const guard: Guard<string, unknown, unknown> = () =>
      decisionRewrite(alwaysRewriteTarget, "always rewrite", []);
    const { decision } = await adjudicateAndAudit(
      original,
      {},
      bundleWithBusiness(guard, permissivePolicy, "EXECUTE"),
      { sink: noopAuditSink() },
    );
    expect(decision.kind).not.toBe("EXECUTE");
    expect(decision.kind).toBe("REFUSE");
  });
});

describe("invariant: taint-only test, no other guards fire", () => {
  it("the refusal carries taint basis when it short-circuits on taint", () => {
    fc.assert(
      fc.property(taintArb, intentKindArb, jsonSafePayloadArb, (taint, kind, payload) => {
        const decision = adjudicate(env(kind, taint, payload), {}, emptyBundle());
        if (taint !== "SYSTEM") {
          expect(decision.kind).toBe("REFUSE");
          if (decision.kind !== "REFUSE") return;
          expect(
            decision.basis.some(
              (b) => b.category === "taint" && b.code === "level_insufficient",
            ),
          ).toBe(true);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
