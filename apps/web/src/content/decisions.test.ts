import { describe, expect, it } from "vitest";
import { DECISIONS, DECISIONS_ORDER } from "./decisions";
import { runPlayground } from "@/lib/kernel-runner";

/**
 * DECISIONS preset conformance (plan 132 · §7 drift-closure for the homepage).
 *
 * `DECISIONS[k].playgroundPreset` is the pre-filled payload that advertises the
 * `k` outcome. It is consumed LIVE by the homepage centerpieces — StepReceipt
 * (`real: true`, renders the ReceiptCard for `DECISIONS.REWRITE.playgroundPreset`
 * under hardcoded REWRITE / quantity_capped / 100%→25% copy), MagicMoment
 * (reads back `decision.rewritten.payload.rampPercent`), and StepConsole (pins
 * the highlighted REWRITE row's real intentHash). If a preset re-adjudicates to
 * a different kind than the surrounding copy hardcodes, the most prominent
 * marketing page renders a self-contradictory decision — the exact drift class
 * this plan exists to eliminate (§1).
 *
 * The guided/sandbox conformance tests cover GUIDED_CASES / SANDBOX_SCHEMAS but
 * NOT these DECISIONS presets, so before this test the StepReceipt REWRITE
 * preset silently re-adjudicated to ESCALATE (production/100%/no-approval →
 * clamp-then-escalate, 011) while the rail claimed REWRITE — and no test or §5
 * gate caught it. This table drives every preset through the SAME runPlayground
 * the page uses and asserts the live `decision.kind` equals the advertised
 * outcome key, so the drift is now a build failure for the homepage too.
 *
 * Invariants (000_index §D): #5 determinism (fixed-literal inputs → fixed kind),
 * #6 fail-closed (REFUSE/ESCALATE/DEFER come from real Pack policy, unstubbed).
 */

interface PresetCase {
  readonly kind: string;
  readonly intentKind: string;
  readonly payload: Record<string, unknown>;
  readonly state?: unknown;
}

const PRESET_CASES: ReadonlyArray<PresetCase> = DECISIONS_ORDER.map((kind) => {
  const p = DECISIONS[kind].playgroundPreset;
  return { kind, intentKind: p.intentKind, payload: p.payload, state: p.state };
});

describe("DECISIONS preset conformance: every playgroundPreset drives runPlayground to its advertised kind", () => {
  it("covers all six closed outcomes (sanity: the table is non-empty and complete)", () => {
    // Guards against a refactor silently shrinking DECISIONS_ORDER and making
    // the table-driven test below vacuous.
    expect(PRESET_CASES).toHaveLength(6);
    expect(new Set(PRESET_CASES.map((c) => c.kind)).size).toBe(6);
  });

  it.each(PRESET_CASES)(
    "DECISIONS.$kind.playgroundPreset → $kind",
    async ({ kind, intentKind, payload, state }) => {
      const res = await runPlayground({ intentKind, payload, state });
      expect(res.decision.kind).toBe(kind);
    },
  );

  it("REWRITE preset (the live StepReceipt centerpiece) is a genuine, surviving ramp clamp", async () => {
    // The most prominent page renders this LIVE under a hardcoded
    // REWRITE / quantity_capped / 100%→25% annotation rail. Pin not just the
    // kind but the load-bearing shape the rail and MagicMoment assert, so the
    // homepage copy can never drift from the audited decision again.
    const p = DECISIONS.REWRITE.playgroundPreset;
    const res = await runPlayground({
      intentKind: p.intentKind,
      payload: p.payload,
      state: p.state,
    });
    expect(res.decision.kind).toBe("REWRITE");
    if (res.decision.kind !== "REWRITE") throw new Error("unreachable");
    // MagicMoment reads this back as the "fixed" ramp; StepReceipt's rail
    // narrates "the swap from 100% to 25%".
    expect((res.decision.rewritten.payload as { rampPercent?: number }).rampPercent).toBe(25);
    expect((p.payload as { rampPercent?: number }).rampPercent).toBe(100);
    // StepReceipt's basis annotation hardcodes `quantity_capped`.
    expect(
      res.decision.basis.some(
        (b) => b.category === "business" && b.code === "quantity_capped",
      ),
    ).toBe(true);
  });
});
