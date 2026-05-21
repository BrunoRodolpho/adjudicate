# @example/commerce-reference

A pared-down e-commerce surface that exercises the kernel's cart →
checkout → payment patterns: **REWRITE** on quantity caps, **DEFER** on
PIX-pending payment, refusals + auth gates, and state-aware capability
planning.

## What's demonstrated

| Pattern | Where | Outcome |
|---|---|---|
| Quantity clamping | `clampToCatalogMax` in [policies.ts](./src/policies.ts) | `REWRITE` with `BASIS_CODES.business.QUANTITY_CAPPED` |
| Unknown SKU | same guard, refusal branch | `REFUSE` (`STATE`, `cart.unknown_sku`) |
| Empty cart at checkout | `requireNonEmptyCartForCheckout` | `REFUSE` (`STATE`, `cart.empty`) |
| Unauthenticated checkout | `requireAuthForCheckout` | `REFUSE` (`AUTH`, `auth.not_authenticated`) |
| Cancelling shipped order | `requireOrderForCancel` | `REFUSE` (`STATE`, `order.already_shipped`) |
| Async payment (PIX) | `deferOnPendingPayment` | `DEFER` on `payment.confirmed` (15-min timeout) |
| State-aware tool visibility | [`capabilities.ts`](./src/capabilities.ts) | MUTATING tools structurally hidden when `order.status === "shipped"` |

## Run it

```bash
pnpm --filter @example/commerce-reference test
```

## Read it

- [`src/types.ts`](./src/types.ts) — domain shape (5 intent kinds, cart/order state, taint policy)
- [`src/policies.ts`](./src/policies.ts) — `PolicyBundle` with REWRITE / REFUSE / DEFER guards
- [`src/capabilities.ts`](./src/capabilities.ts) — `CapabilityPlanner` keyed on `OrderStatus`
- [`src/refusals.ts`](./src/refusals.ts) — typed builder per refusal code
- [`tests/order-flow.test.ts`](./tests/order-flow.test.ts) — exercises every pattern above

## Design notes

**`default: "REFUSE"`** — fail-safe polarity. An intent that doesn't
match any positive guard is denied. The vacation-approval example uses
`default: "EXECUTE"` (allow-unless-denied); commerce favors deny-unless-allowed
because the cost of an erroneous EXECUTE is real money.

**No XState here.** IbateXas's production order machine uses XState for
the rich `cart -> checkout -> awaiting_payment -> paid -> shipped`
transitions. This example uses a single `OrderStatus` field on
`CommerceState` to keep the surface area small and the examples lesson
focused on the kernel pattern, not the state-machine library. Adopters
who want XState wire it themselves — the kernel doesn't care.

**The DEFER + resume cycle.** The `deferOnPendingPayment` guard returns
a DEFER decision; the runtime side parks the envelope at a session-keyed
Redis key. When the payment provider's webhook fires, the adopter calls
`resumeDeferredIntent({ sessionId, signal: "payment.confirmed", ... })`
from `@adjudicate/runtime`, which re-emits the parked envelope through
the kernel — at which point the adjudicator can EXECUTE because
`paymentStatus` is now `confirmed`. Replay protection is content-addressed
via `intentHash`, so duplicate webhook deliveries fold into a single
execution.

## Production wiring

Real adopters typically add: state-machine integration (XState or
similar) on top of `OrderStatus`, locale-specific refusal copy via
`@adjudicate/locales-pt-BR` or a custom `RefusalMessages` map, a real
payment-provider webhook handler that calls `resumeDeferredIntent`, and
session-tenant namespacing on the runtime Redis keys. The kernel adapts
to all of them without changes — that's the point.
