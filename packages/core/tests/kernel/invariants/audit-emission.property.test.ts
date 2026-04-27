/**
 * Invariant: kernel-side audit emission.
 *
 * Every call to `adjudicateAndAudit` emits exactly one AuditRecord through
 * the supplied sink, and `result.record.decision === result.decision`. This
 * is the load-bearing claim of T1: production paths cannot accidentally
 * skip emission, and the emitted record matches the returned Decision
 * byte-for-byte.
 *
 * Property strategy: random (taint × default × ledger-state) tuples drive
 * the kernel; for each, assert sink.emit was called once and the record
 * mirrors the Decision.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  type AuditRecord,
  type AuditSink,
  type IntentEnvelope,
  type LedgerHit,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import {
  adjudicateAndAudit,
  _resetLearningSink,
  _resetMetricsSink,
  _resetShadowTelemetrySink,
} from "../../../src/kernel/index.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defaultArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");
const ledgerHitArb = fc.boolean();

function env(taint: Taint, nonce: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope<string, { x: number }>({
    kind: "order.tool.propose",
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s" },
    taint,
    // T8: vary `nonce` so distinct fc shrinks produce distinct hashes.
    // Pre-T8 we varied `createdAt`; v2 separates the idempotency key
    // from descriptive metadata.
    nonce,
    createdAt: "2026-04-23T12:00:00.000Z",
  });
}

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function bundle(
  def: "REFUSE" | "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [],
    default: def,
  };
}

afterEach(() => {
  _resetMetricsSink();
  _resetLearningSink();
  _resetShadowTelemetrySink();
});

describe("invariant: every adjudicateAndAudit call emits exactly one AuditRecord", () => {
  it("holds across taint × default × ledger-hit matrix", async () => {
    await fc.assert(
      fc.asyncProperty(
        taintArb,
        defaultArb,
        ledgerHitArb,
        fc.string({ minLength: 1, maxLength: 8 }),
        async (taint, def, hitLedger, nonce) => {
          const emit = vi.fn().mockResolvedValue(undefined);
          const sink: AuditSink = { emit };
          const ledger = hitLedger
            ? {
                checkLedger: async (): Promise<LedgerHit | null> => ({
                  resourceVersion: "v",
                  at: "2026-04-23T11:00:00.000Z",
                  sessionId: "s",
                  kind: "order.tool.propose",
                }),
                recordExecution: async () => "exists" as const,
              }
            : undefined;
          const result = await adjudicateAndAudit(env(taint, nonce), {}, bundle(def), {
            sink,
            ...(ledger ? { ledger } : {}),
          });
          expect(emit).toHaveBeenCalledTimes(1);
          const record = emit.mock.calls[0]![0] as AuditRecord;
          expect(record.decision.kind).toBe(result.decision.kind);
          expect(record.intentHash).toBe(env(taint, nonce).intentHash);
          expect(record.decision_basis).toEqual(result.decision.basis);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
