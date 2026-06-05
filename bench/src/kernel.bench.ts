/**
 * Microbenchmarks for kernel hot paths.
 *
 * Run via `pnpm -F @adjudicate/bench bench:kernel`. Numbers compared against
 * thresholds documented in docs/perf/. Regression detection is by manual
 * inspection in v0.2; CI gate post-v0.4.
 *
 * Methodology:
 * - Warmup: vitest-bench default (5 iterations)
 * - Sample: vitest-bench default (≥10 iterations, statistical convergence)
 * - Single-process, single-thread, hot CPU
 * - Numbers reflect adjudicate-only cost; no I/O, no audit emit
 */

import { bench, describe } from "vitest";
import {
  adjudicate,
  adjudicateWithTrace,
  buildEnvelope,
  installPack,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

// ── Fixtures: build once, run many ─────────────────────────────────────────
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

const EXECUTE_ENVELOPE: IntentEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "ch-1",
    refundCentavos: 3000,
    reason: "customer-request",
  },
  actor: { principal: "llm", sessionId: "s-bench" },
  taint: "UNTRUSTED",
  nonce: "bench-nonce-execute",
});

const REWRITE_ENVELOPE: IntentEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "ch-1",
    refundCentavos: 999_999_999, // way over original; triggers REWRITE clamp
    reason: "customer-request",
  },
  actor: { principal: "llm", sessionId: "s-bench" },
  taint: "UNTRUSTED",
  nonce: "bench-nonce-rewrite",
});

const REFUSE_ENVELOPE: IntentEnvelope = buildEnvelope({
  kind: "pix.charge.confirm",
  payload: { chargeId: "ch-NONEXISTENT" }, // triggers state guard refusal
  actor: { principal: "llm", sessionId: "s-bench" },
  taint: "UNTRUSTED",
  nonce: "bench-nonce-refuse",
});

// ── adjudicate() — pure kernel hot path ────────────────────────────────────

describe("adjudicate() pure", () => {
  bench(
    "EXECUTE path (valid refund)",
    () => {
      adjudicate(EXECUTE_ENVELOPE, PIX_STATE, PIX_POLICY);
    },
    { iterations: 1000 },
  );

  bench(
    "REWRITE path (refund clamp)",
    () => {
      adjudicate(REWRITE_ENVELOPE, PIX_STATE, PIX_POLICY);
    },
    { iterations: 1000 },
  );

  bench(
    "REFUSE path (charge not found)",
    () => {
      adjudicate(REFUSE_ENVELOPE, PIX_STATE, PIX_POLICY);
    },
    { iterations: 1000 },
  );
});

describe("adjudicateWithTrace() — same hot path + trace allocation", () => {
  bench(
    "EXECUTE path with trace",
    () => {
      adjudicateWithTrace(EXECUTE_ENVELOPE, PIX_STATE, PIX_POLICY);
    },
    { iterations: 1000 },
  );
});

// ── buildEnvelope() — hash derivation cost ─────────────────────────────────

describe("buildEnvelope()", () => {
  const PAYLOAD = {
    chargeId: "ch-1",
    refundCentavos: 3000,
    reason: "customer-request",
  };
  bench(
    "buildEnvelope (sha256 canonical-JSON)",
    () => {
      buildEnvelope({
        kind: "pix.charge.refund",
        payload: PAYLOAD,
        actor: { principal: "llm", sessionId: "s" },
        taint: "UNTRUSTED",
        nonce: "n",
      });
    },
    { iterations: 1000 },
  );
});

// ── adjudicate() with installPack-wrapped policy (production default) ────────
// The bare-policy blocks above reflect the underlying kernel cost. These rows
// reflect the framework's recommended boot — installPack(pack) defaults to
// auditBasisDrift: true, returning the withBasisAudit-wrapped policy.

describe("adjudicate() with installPack-wrapped policy (production default)", () => {
  bench(
    "EXECUTE path (valid refund)",
    () => {
      adjudicate(EXECUTE_ENVELOPE, PIX_STATE, PIX_POLICY_WRAPPED);
    },
    { iterations: 1000 },
  );

  bench(
    "REFUSE path (charge not found)",
    () => {
      adjudicate(REFUSE_ENVELOPE, PIX_STATE, PIX_POLICY_WRAPPED);
    },
    { iterations: 1000 },
  );
});
