import { describe, expect, it } from "vitest";
import { GUIDED_CASES } from "./guided-cases";
import { runPlayground } from "@/lib/kernel-runner";

/**
 * Guided-mode conformance (plan 132 · T1).
 *
 * Every `expectedKind` literal in `GUIDED_CASES` is advertised marketing copy
 * — the "Heads up" UI banner is the ONLY place it was ever cross-checked
 * against the real kernel, and it is checked nowhere in CI. This table drives
 * every step's `{ intentKind, payload, state }` through the SAME `runPlayground`
 * the `POST /api/playground/adjudicate` route uses, and asserts the live
 * `decision.kind` equals the advertised `expectedKind`. From now on, a marketing
 * literal that doesn't match real Pack policy fails the build instead of silently
 * misleading a reader.
 *
 * Invariants this encodes (000_index §D):
 *   #5 determinism — the same fixed-literal inputs reproduce the same kind.
 *   #6 fail-closed — REFUSE/ESCALATE/DEFER come from real Pack policy, unstubbed.
 *   §C monotonicity — REWRITE/REFUSE/ESCALATE add friction; none of these
 *      literals advertises a non-deterministic downgrade.
 */

interface FlatStep {
  readonly caseId: string;
  readonly stepId: string;
  readonly intentKind: string;
  readonly payload: Record<string, unknown>;
  readonly state?: unknown;
  readonly expectedKind: string;
}

const FLAT_STEPS: ReadonlyArray<FlatStep> = GUIDED_CASES.flatMap((c) =>
  c.steps.map((s) => ({
    caseId: c.id,
    stepId: s.id,
    intentKind: s.intentKind,
    payload: s.payload,
    state: s.state,
    expectedKind: s.expectedKind,
  })),
);

describe("guided-cases conformance: GUIDED_CASES drive the real kernel", () => {
  it("covers every documented marketing step (sanity: the table is non-empty)", () => {
    // Guards against a refactor silently emptying GUIDED_CASES and turning the
    // table-driven test below into a vacuous pass.
    expect(FLAT_STEPS.length).toBeGreaterThanOrEqual(14);
  });

  it.each(FLAT_STEPS)(
    "[$caseId/$stepId] $intentKind → $expectedKind",
    async ({ intentKind, payload, state, expectedKind }) => {
      const res = await runPlayground({ intentKind, payload, state });
      expect(res.decision.kind).toBe(expectedKind);
    },
  );

  it("is deterministic: re-running a step yields the identical decision kind", async () => {
    // §D-5: byte-identical replay of the pure decision. The shell mints a fresh
    // nonce/timestamp per call, but the decision KIND must not move.
    const step = FLAT_STEPS.find((s) => s.stepId === "pix-overshoot")!;
    const a = await runPlayground({
      intentKind: step.intentKind,
      payload: step.payload,
      state: step.state,
    });
    const b = await runPlayground({
      intentKind: step.intentKind,
      payload: step.payload,
      state: step.state,
    });
    expect(a.decision.kind).toBe("REWRITE");
    expect(b.decision.kind).toBe(a.decision.kind);
  });
});
