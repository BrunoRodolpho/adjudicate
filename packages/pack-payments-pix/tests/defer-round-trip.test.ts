/**
 * DEFER round-trip — park-on-create, resume-on-signal.
 *
 * Pins the integration contract between the Pack's DEFER guard and
 * `@adjudicate/runtime`'s `resumeDeferredIntent`:
 *
 *   1. Adjudicate a `pix.charge.create` → kernel returns DEFER on
 *      PIX_CONFIRMATION_SIGNAL.
 *   2. Persist the parked envelope under the session's defer key.
 *   3. Webhook arrives; adopter calls `resumeDeferredIntent`.
 *   4. Resume succeeds exactly once; duplicate webhook delivery is
 *      suppressed by the SET-NX ledger.
 *   5. The follow-up `pix.charge.confirm` envelope (TRUSTED taint, from
 *      the webhook adapter) executes against the now-pending charge
 *      state — proving the round-trip ends in a productive Decision.
 */

import { describe, expect, it, vi } from "vitest";
import { adjudicate } from "@adjudicate/core/kernel";
import { buildEnvelope } from "@adjudicate/core";
import {
  resumeDeferredIntent,
  type DeferRedis,
} from "@adjudicate/runtime";
import {
  PIX_CONFIRMATION_SIGNAL,
  pixPolicyBundle,
  type PixCharge,
  type PixState,
} from "../src/index.js";

const DET_TIME = "2026-04-26T12:00:00.000Z";

function makeRedis(initialPendingValue: string | null = null) {
  const store = new Map<string, string>();
  if (initialPendingValue !== null) {
    store.set("ENV:defer:pending:s-1", initialPendingValue);
  }
  const redis: DeferRedis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key, value, options) => {
      if (options.NX && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const had = store.delete(key);
      return had ? 1 : 0;
    }),
  };
  return { redis, store };
}

const rk = (raw: string) => `ENV:${raw}`;

describe("DEFER round-trip via @adjudicate/runtime", () => {
  it("parks on create, resumes once on signal, suppresses duplicates", async () => {
    // Step 1 — kernel adjudicates pix.charge.create → DEFER.
    const initialState: PixState = { charges: new Map() };
    const createEnvelope = buildEnvelope({
      kind: "pix.charge.create",
      payload: {
        amountCentavos: 4500,
        payerDocument: "11144477735",
        description: "Round-trip test",
      },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      createdAt: DET_TIME,
    });
    const deferDecision = adjudicate(
      createEnvelope,
      initialState,
      pixPolicyBundle,
    );
    expect(deferDecision.kind).toBe("DEFER");
    if (deferDecision.kind !== "DEFER") return;
    expect(deferDecision.signal).toBe(PIX_CONFIRMATION_SIGNAL);

    // Step 2 — adopter persists the parked envelope.
    const parked = JSON.stringify({
      envelope: {
        intentHash: createEnvelope.intentHash,
        kind: createEnvelope.kind,
        actor: { sessionId: "s-1" },
        payload: createEnvelope.payload,
      },
      signal: PIX_CONFIRMATION_SIGNAL,
      parkedAt: DET_TIME,
    });
    const { redis } = makeRedis(parked);

    // Step 3 — webhook lands → resume succeeds.
    const first = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: PIX_CONFIRMATION_SIGNAL,
      redis,
      rk,
    });
    expect(first.resumed).toBe(true);
    expect(first.intentHash).toBe(createEnvelope.intentHash);

    // Step 4 — second resume on the same redis sees the pending key
    // gone (deleted by the first resume) → no_parked_envelope.
    const second = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: PIX_CONFIRMATION_SIGNAL,
      redis,
      rk,
    });
    expect(second.resumed).toBe(false);
    expect(second.reason).toBe("no_parked_envelope");
  });

  it("the post-resume confirm envelope EXECUTEs against the now-pending charge", () => {
    // After the webhook resume, the adopter's executor runs the create
    // handler (which inserts the charge as `pending`), then dispatches
    // a TRUSTED `pix.charge.confirm` envelope built from the webhook
    // payload. This second envelope must be ALLOWED — proving the
    // round-trip ends in a state where the kernel grants execution.
    const pendingCharge: PixCharge = {
      id: "ch_round",
      amountCentavos: 4500,
      status: "pending",
      createdAt: DET_TIME,
    };
    const stateAfterCreate: PixState = {
      charges: new Map([[pendingCharge.id, pendingCharge]]),
    };
    const confirmEnvelope = buildEnvelope({
      kind: "pix.charge.confirm",
      payload: {
        chargeId: "ch_round",
        providerTxId: "tx_abc",
        confirmedAt: DET_TIME,
      },
      actor: { principal: "system", sessionId: "s-1" },
      taint: "TRUSTED",
      createdAt: DET_TIME,
    });
    const decision = adjudicate(
      confirmEnvelope,
      stateAfterCreate,
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("park signal mismatch is reported by resume", async () => {
    const parked = JSON.stringify({
      envelope: {
        intentHash: "h-fake",
        kind: "pix.charge.create",
        actor: { sessionId: "s-1" },
        payload: {},
      },
      signal: "some.other.signal",
      parkedAt: DET_TIME,
    });
    const { redis } = makeRedis(parked);
    const result = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: PIX_CONFIRMATION_SIGNAL,
      redis,
      rk,
    });
    expect(result.resumed).toBe(false);
    expect(result.reason).toBe("signal_mismatch");
  });
});
