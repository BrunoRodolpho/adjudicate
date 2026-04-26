# ADR-001 — payments-pix Pack: three intents, async confirmation lifecycle

**Status:** Accepted, 2026-04-26.
**Phase:** 1 (lighthouse Pack for the adjudicate platform).
**Deciders:** maintainers.

## Context

The platform's Phase 1 lighthouse Pack must satisfy two constraints simultaneously:

1. **It must exercise the kernel's hardest capability — `DEFER` + signal resume.** Sync-only payment domains (e.g., card-only Stripe in the simple flow) don't prove this; the platform needs evidence the contract works for the async-with-webhook lifecycle that downstream Packs (`payments-stripe` SCA, `notifications-smtp` bounce handling, `billing` dunning) will inherit.

2. **It must be small enough to land in one focused iteration with full test coverage and runbook.** A real production payment provider has a dozen-plus intents (chargebacks, disputes, partial captures, currency conversions, recurring tokens). The Pack's lighthouse role is to validate `PackV0`, not to be a complete PIX SDK.

PIX (Brazil's instant payment system) is the right shape for both. It's *fundamentally* async — a charge is created, then waits for the payer to scan a QR code or paste a key into their bank app, then the provider's webhook signals success — which forces the DEFER round-trip into the lighthouse. And the minimum viable surface is small: create, confirm, refund.

## Decision

The Pack ships **three intent kinds** and nothing more in v0.x:

| Intent | Why | Why not bigger |
|---|---|---|
| `pix.charge.create` | The kernel's `DEFER` outcome only ever fires on async-creation. Skipping this kind would leave the most differentiated capability untested. | Could be split into `quote` + `commit`; not worth the complication for v0. The webhook arrival is what closes the loop. |
| `pix.charge.confirm` | The webhook intent. Required to demonstrate `TRUSTED`-only taint enforcement and the `EXECUTE` half of the round-trip. | A real provider may emit several webhook event types (confirmed, failed, expired). v0 collapses to just `confirmed`; failure paths land when the second pack (Stripe) shows the broader pattern. |
| `pix.charge.refund` | The richest single intent in payments — REWRITE (clamp), REFUSE (multiple modes), ESCALATE (large amount), REQUEST_CONFIRMATION (medium amount). One intent demonstrates four of the six Decision outcomes. | Partial-refund-multiple-times semantics omitted; would force tracking a `refundedSoFar` field in state. v0 keeps `refund` single-shot; the Pack contract supports the extension without reshape. |

`payments-pix` is **deliberately not** an SDK for the underlying provider (Mercado Pago, Cielo, etc.). It's an adjudicated policy + types + reference handlers. Real adopters wire their provider client into the handler shape.

## Consequences

**Positive:**

- All six Decision outcomes provably exercised by tests in one Pack.
- The DEFER round-trip is non-trivial to mock without committing to the actual contract — having a real Pack do it tightens the contract before a second Pack arrives.
- `PackV0` gets validated against the most-different domain shape first; greenfield Packs in Phase 5 (Stripe, billing) will catch the *next* set of API gaps, but at least the async-payment shape is honest.

**Negative / accepted trade-offs:**

- The Pack is small enough that adopters may need to fork it for production use (e.g., adding partial-refund tracking, multi-currency, dispute lifecycle). That's intentional for v0.x — extending is easier than de-extending. Phase 5's `payments-stripe` Pack will surface what should generalize.
- The `confirm` intent collapses several webhook event types into one. Splitting would require either compound payload types or multiple intent kinds; v0 punts.
- In-memory handlers ship with the Pack so tests run zero-dep, but they are explicitly "not for production" — calling that out in the README to prevent footguns.

**Open questions for v1:**

- Should partial-refund tracking move into `PixState`, or stay in adopter-side ledgers?
- Should the threshold guards (`ESCALATE_REFUND_THRESHOLD_CENTAVOS`, `CONFIRM_REFUND_THRESHOLD_CENTAVOS`) be configurable through the Pack object itself, or remain compile-time constants adopters override by composing PolicyBundles?
- What's the right shape for emitting per-Pack metrics (refund rate by basis, defer-resume latency) — Phase 6 observability work will likely answer this.

## Alternatives considered

- **`payments-stripe` first.** Closer temporal shape to existing IbateXas extraction work, easier mental model for English-language audience. Rejected because synchronous card flows don't exercise DEFER honestly, and the lighthouse's role is precisely to prove the kernel's hardest capability.
- **`commerce-medusa` first.** Already partially done as `examples/commerce-reference`; promoting to a Pack would mostly be packaging overhead. Rejected because the demo value is "first Pack across the package boundary," and commerce-reference doesn't push the contract anywhere new.
- **`billing` first.** Highest strategic differentiation (dunning + prorations + multi-cycle state machines); rejected because greenfield-first packs are how you get the entropy back and the lighthouse needs to be defensible against IbateXas's existing patterns.

The roadmap's [Phase 5 sequencing](../../../README.md#status) keeps `payments-stripe` → `notifications-smtp` → `invoicing` → `billing` as the planned validation sweep, so the unchosen alternatives still land — just after PackV0 is honest.
