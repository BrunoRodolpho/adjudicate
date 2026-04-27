# @adjudicate/pack-payments-pix

> Lighthouse Pack for the [adjudicate](../../README.md) platform — the async PIX payment lifecycle, adjudicated. Exercises all six Decision outcomes (EXECUTE, REFUSE, ESCALATE, REQUEST_CONFIRMATION, DEFER, REWRITE).

## Status

`v0.1.0-experimental` — pending publish to npm. PackV0-conformant. Phase 1 lighthouse for the [platform roadmap](../../README.md#status).

## Why this Pack first

PIX is Brazil's instant-payment system. It's *async by design* — a customer creates a charge, the kernel parks it, the payment provider's webhook later confirms it, the kernel resumes. That webhook → DEFER → resume cycle is the kernel's hardest, most differentiated capability — sync-only Stripe doesn't prove it. This Pack is the smallest realistic surface that exercises every Decision outcome the kernel can return.

## Three intent kinds

| Intent | Taint | LLM-proposable | Description |
|---|---|---|---|
| `pix.charge.create` | UNTRUSTED | yes | Customer (or LLM on its behalf) proposes a charge. Kernel typically DEFERS awaiting webhook confirmation. |
| `pix.charge.confirm` | TRUSTED | **no** | Payment provider's webhook signals payment received. UNTRUSTED proposals are refused at the taint gate. |
| `pix.charge.refund` | UNTRUSTED | yes (when there's a confirmed charge) | Merchant proposes a full or partial refund. Subject to REWRITE-clamp, ESCALATE/REQUEST_CONFIRMATION thresholds, and several REFUSE paths. |

## What the policy does (six outcomes in one Pack)

| Outcome | Trigger |
|---|---|
| `EXECUTE` | Refund within thresholds on a confirmed charge; or TRUSTED confirm of a pending charge. |
| `REFUSE` | Charge not found · charge not confirmed · already refunded · invalid amount · UNTRUSTED webhook attempt. |
| `REWRITE` | Refund > original charge amount → clamped to original. |
| `REQUEST_CONFIRMATION` | Refund ≥ R$ 500 (default `CONFIRM_REFUND_THRESHOLD_CENTAVOS`). |
| `ESCALATE` | Refund ≥ R$ 1,000 (default `ESCALATE_REFUND_THRESHOLD_CENTAVOS`) → routes to `"supervisor"`; OR a confirm event landing on a charge already marked `failed` → routes to `"human"` for manual review. |
| `DEFER` | `pix.charge.create` parks awaiting `payment.confirmed` signal (15-min timeout). |

Read [`src/policies.ts`](./src/policies.ts) for the guard-by-guard contract.

## Quick start

```ts
import { adjudicate } from "@adjudicate/core/kernel";
import { buildEnvelope } from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

const state = { charges: new Map() };

const envelope = buildEnvelope({
  kind: "pix.charge.create",
  payload: {
    amountCentavos: 5_000,
    payerDocument: "12345678900",
    description: "iced coffee",
  },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
});

const decision = adjudicate(envelope, state, paymentsPixPack.policy);
// decision.kind === "DEFER"
// decision.signal === "payment.confirmed"
```

The full DEFER round-trip (park → webhook → resume) lives in [`@adjudicate/runtime`](../runtime/README.md)'s `resumeDeferredIntent`. This Pack only declares the DEFER outcome; persistence is the adopter's choice (Redis / Postgres / etc.). See [`tests/defer-round-trip.test.ts`](./tests/defer-round-trip.test.ts) for the integration-level contract.

## Adoption patterns

This Pack supports two distinct adoption shapes. Pick whichever maps onto your existing intent vocabulary:

### 1. Greenfield (canonical Pack-intent)

Your application's wire vocabulary uses `pix.charge.{create,confirm,refund}` directly. Dispatch envelopes against `paymentsPixPack.policy`. Webhook adapters build TRUSTED `pix.charge.confirm` envelopes and call [`resumeDeferredIntent`](../runtime/README.md) when the provider settles. This is the cleanest path for new applications.

### 2. Existing intent kind (factory pattern)

Your application already proposes higher-level intents (e.g. `order.confirm` with `paymentMethod=pix`) and you don't want to rewrite the LLM prompt to emit `pix.charge.confirm` directly. Compose `createPixPendingDeferGuard` into your own `PolicyBundle`:

```ts
import { createPixPendingDeferGuard } from "@adjudicate/pack-payments-pix";
import type { PolicyBundle, Guard } from "@adjudicate/core/kernel";

interface OrderState {
  readonly ctx: {
    readonly paymentMethod: string | null;
    readonly paymentStatus: string | null;
  };
}

const orderPixDefer: Guard<string, unknown, OrderState> =
  createPixPendingDeferGuard<OrderState>({
    readPaymentMethod: (s) => s.ctx.paymentMethod,
    readPaymentStatus: (s) => s.ctx.paymentStatus,
    matchesIntent: (kind) => kind === "order.confirm",
  });

const orderPolicyBundle: PolicyBundle<string, unknown, OrderState> = {
  stateGuards: [orderPixDefer /* ...other guards... */],
  authGuards: [],
  taint: { minimumFor: () => "UNTRUSTED" },
  business: [],
  default: "REFUSE",
};
```

The factory's `signal`, `timeoutMs`, `confirmedStatuses`, and `pixMethodLabel` are all overridable per call. Canonical example: IbateXas's `@ibatexas/llm-provider` composes the factory against `order.confirm` in `packages/llm-provider/src/order-policy-bundle.ts`. See [`tests/adopter-guard.test.ts`](./tests/adopter-guard.test.ts) for the contract.

## Composition into your `PackV0` consumer

The Pack is a `PackV0`-conformant value, ready for any registry or runtime that consumes the contract:

```ts
import type { PackV0 } from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

// Compile-time conformance — fails the build if the Pack drifts from PackV0.
const _check = paymentsPixPack satisfies PackV0;

// Use the Pack's policy + planner directly:
adjudicate(envelope, state, paymentsPixPack.policy);
paymentsPixPack.planner.plan(state, context);
```

## Customizing thresholds

Wrap the bundled `pixPolicyBundle` and replace just the threshold guards:

```ts
import { pixPolicyBundle } from "@adjudicate/pack-payments-pix";
// build a derived bundle with your own threshold guards in place of the defaults
```

A worked example lives in [`docs/runbook.md`](./docs/runbook.md) under "Stage 2: tightening for staging."

## Adoption — the 4-stage shadow → enforce runbook

[`docs/runbook.md`](./docs/runbook.md) walks through the staged rollout:

1. **Shadow read** — adjudicate runs alongside your existing PIX flow, recording divergences but never blocking.
2. **Shadow on cart-tier mutations** — broaden shadow to the easy intents (`refund` happy path).
3. **Enforce on read-likes** — flip to authoritative for low-risk intents.
4. **Enforce on financial mutations** — full enforcement, including `create` DEFER + `refund` REWRITE.

Each stage has explicit go / no-go criteria.

## Architectural notes

- See [`docs/ADR-001-payments-pix.md`](./docs/ADR-001-payments-pix.md) for *why* these three intent kinds and not others.
- The `PackV0` contract this Pack satisfies is documented in [`@adjudicate/core/src/pack.ts`](../core/src/pack.ts).
- Tests covering all six outcomes + the DEFER round-trip live in [`tests/six-outcomes.test.ts`](./tests/six-outcomes.test.ts).

## License

[MIT](../../LICENSE)
