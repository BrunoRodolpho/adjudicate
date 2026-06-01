/**
 * Microbenchmarks for adjudicateAndAudit() with in-memory ledger + sink.
 *
 * Measures the full audit-emitting path including ledger SET-NX claim,
 * metrics dispatch, learning emission, and AuditRecord build. No I/O —
 * everything in-process.
 */

import { bench, describe } from "vitest";
import {
  buildEnvelope,
  installPack,
  noopAuditSink,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { adjudicateAndAudit } from "@adjudicate/core/kernel";
import { createMemoryLedger } from "@adjudicate/audit";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

const PIX_POLICY: PolicyBundle<string, unknown, unknown> = paymentsPixPack.policy as PolicyBundle<
  string,
  unknown,
  unknown
>;

// installPack-wrapped policy (matches production default: auditBasisDrift: true).
// warn is suppressed so the default-sink notice does not pollute bench output.
const { pack: INSTALLED_PACK } = installPack(paymentsPixPack, { warn: () => {} });
const PIX_POLICY_WRAPPED = INSTALLED_PACK.policy as PolicyBundle<string, unknown, unknown>;

const PIX_STATE = {
  charges: new Map([
    [
      "ch-1",
      {
        id: "ch-1",
        amountCentavos: 5000,
        status: "confirmed" as const,
        customerId: "c-1",
        merchantId: "m-1",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ],
  ]),
  customerId: "c-1",
  merchantId: "m-1",
  nowISO: "2024-01-01T00:00:00.000Z",
};

const sink = noopAuditSink();
const ledger = createMemoryLedger();

const REFUSE_ENVELOPE_BASE = (i: number): IntentEnvelope =>
  buildEnvelope({
    kind: "pix.charge.confirm",
    payload: { chargeId: "ch-NONEXISTENT" },
    actor: { principal: "llm", sessionId: "s-bench" },
    taint: "UNTRUSTED",
    nonce: `bench-nonce-refuse-${i}`,
  });

describe("adjudicateAndAudit() — full audit-emitting path", () => {
  let i = 0;
  bench(
    "REFUSE path (no EXECUTE → no ledger claim)",
    async () => {
      const envelope = REFUSE_ENVELOPE_BASE(i++);
      await adjudicateAndAudit(envelope, PIX_STATE, PIX_POLICY, { sink, ledger });
    },
    { iterations: 200 },
  );
});

// installPack-wrapped policy (production default). The bare-policy block above
// reflects the underlying cost; this reflects the recommended boot where
// installPack(pack) returns the withBasisAudit-wrapped policy.
describe("adjudicateAndAudit() with installPack-wrapped policy (production default)", () => {
  let i = 1000;
  bench(
    "REFUSE path (no EXECUTE → no ledger claim)",
    async () => {
      const envelope = REFUSE_ENVELOPE_BASE(i++);
      await adjudicateAndAudit(envelope, PIX_STATE, PIX_POLICY_WRAPPED, { sink, ledger });
    },
    { iterations: 200 },
  );
});
