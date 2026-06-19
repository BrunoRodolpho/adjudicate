/**
 * Pack conformance — fails the build if `paymentsPixPack` doesn't satisfy
 * `PackV0`. The compile-time check (the `satisfies` clause inside
 * `src/index.ts`) is the load-bearing guarantee; this test adds the
 * runtime-shape sanity checks plus a few invariants the contract doesn't
 * encode in the type system.
 */

import { describe, expect, test } from "vitest";

import type { PackV0 } from "@adjudicate/core";
import {
  PlanConformanceError,
  safePlan,
  staticPlanner,
} from "@adjudicate/core/llm";

import { paymentsPixPack } from "../src/index.js";
import { PIX_INTENTS, PIX_TOOLS } from "../src/capabilities.js";

describe("paymentsPixPack — PackV0 conformance", () => {
  test("declares the v0 contract", () => {
    // Compile-time conformance — fails to build if the Pack drifts from PackV0.
    const _conformance: PackV0 = paymentsPixPack;
    expect(paymentsPixPack.contract).toBe("v0");
  });

  test("id matches npm package convention", () => {
    expect(paymentsPixPack.id).toBe("pack-payments-pix");
  });

  test("version uses the -experimental pre-release tag (Phase 1 lighthouse)", () => {
    expect(paymentsPixPack.version).toBe("0.1.0-experimental");
  });

  test("declares non-empty, unique intents", () => {
    expect(paymentsPixPack.intents.length).toBeGreaterThan(0);
    const unique = new Set(paymentsPixPack.intents);
    expect(unique.size).toBe(paymentsPixPack.intents.length);
  });

  test("policy default is REFUSE (fail-safe)", () => {
    expect(paymentsPixPack.policy.default).toBe("REFUSE");
  });

  test("taint policy requires TRUSTED for the webhook intent only", () => {
    expect(paymentsPixPack.policy.taint.minimumFor("pix.charge.confirm")).toBe(
      "TRUSTED",
    );
    expect(paymentsPixPack.policy.taint.minimumFor("pix.charge.create")).toBe(
      "UNTRUSTED",
    );
    expect(paymentsPixPack.policy.taint.minimumFor("pix.charge.refund")).toBe(
      "UNTRUSTED",
    );
  });

  test("planner exposes create when no charges; refund only when there's a confirmed one", () => {
    const emptyState = paymentsPixPack.planner.plan(
      { charges: new Map() },
      { customerId: "c-1", merchantId: "m-1" },
    );
    expect(emptyState.allowedIntents).toContain("pix.charge.create");
    expect(emptyState.allowedIntents).not.toContain("pix.charge.refund");
    expect(emptyState.allowedIntents).not.toContain("pix.charge.confirm");

    const withConfirmed = paymentsPixPack.planner.plan(
      {
        charges: new Map([
          [
            "cha-1",
            {
              id: "cha-1",
              amountCentavos: 1000,
              status: "confirmed",
              nonce: "n-test", createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
        ]),
      },
      { customerId: "c-1", merchantId: "m-1" },
    );
    expect(withConfirmed.allowedIntents).toContain("pix.charge.create");
    expect(withConfirmed.allowedIntents).toContain("pix.charge.refund");
    // The webhook intent is NEVER LLM-proposable, regardless of state.
    expect(withConfirmed.allowedIntents).not.toContain("pix.charge.confirm");
  });

  // 024 (T4) — the shipped planner is now wrapped with the pack-bound 3-arg
  // `safePlan(planner, PIX_TOOLS, { intents: PIX_INTENTS })`, so the
  // `assertPlanSubsetOfPack` invariant is engaged on every plan() — not only at
  // install. Pin both legs: PIX_INTENTS matches the Pack's declared intents, and
  // a planner advertising an intent ABSENT from PIX_INTENTS throws loud.
  test("PIX_INTENTS equals the Pack's declared intents (no drift between capabilities.ts and index.ts)", () => {
    expect([...PIX_INTENTS].sort()).toEqual([...paymentsPixPack.intents].sort());
  });

  test("the pack-bound safePlan form THROWS when a planner advertises an undeclared intent (subset invariant engaged — non-vacuous)", () => {
    const rogue = safePlan(
      staticPlanner({
        visibleReadTools: [],
        // A money-mover the Pack never declared — the exact leak T4 closes.
        allowedIntents: ["pix.charge.create", "pix.charge.drain_all"],
      }),
      PIX_TOOLS,
      { intents: PIX_INTENTS },
    );
    expect(() => rogue.plan({ charges: new Map() }, { customerId: "c", merchantId: "m" })).toThrow(
      PlanConformanceError,
    );
  });

  test("declares the refusal-code taxonomy the policy emits", () => {
    expect(paymentsPixPack.basisCodes.length).toBeGreaterThan(0);
    // Spot-check the codes the policy actually returns at runtime.
    expect(paymentsPixPack.basisCodes).toContain("pix.charge.not_found");
    expect(paymentsPixPack.basisCodes).toContain("pix.charge.amount_invalid");
    expect(paymentsPixPack.basisCodes).toContain(
      "pix.charge.already_refunded",
    );
  });
});
