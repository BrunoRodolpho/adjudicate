# ADR-002 — Reusable DEFER guard factory + signal-name reconciliation

**Status:** Accepted, 2026-04-27.
**Phase:** 1 (lighthouse Pack hardening before npm publish).
**Deciders:** maintainers.

## Context

[ADR-001](./ADR-001-payments-pix.md) committed to three intent kinds (`pix.charge.{create,confirm,refund}`) as the canonical Pack contract. Greenfield adopters use those intent kinds directly: their LLM (or webhook adapter) builds envelopes against `paymentsPixPack.policy` and the kernel adjudicates.

But during the platform consolidation (April 2026 — IbateXas → standalone repo), a real-world adopter pattern surfaced that ADR-001 hadn't anticipated: **adopters whose LLM proposes a higher-level intent kind that subsumes PIX, and want to compose the Pack's DEFER semantics into their own bundle without rewriting their prompt vocabulary.**

IbateXas is the canonical example. Its LLM proposes `order.confirm` with a `paymentMethod` payload field; the inline DEFER guard previously lived in `packages/llm-provider/src/order-policy-bundle.ts`. Migrating IbateXas to consume this Pack faced two options:

1. **Rewrite the LLM prompt vocabulary** so `pix.charge.confirm` envelopes flow through the existing `order-policy-bundle.ts`. Big change, hard to roll back.
2. **Expose a reusable factory** so the same DEFER predicate composes against any intent kind. Small change, no prompt churn.

A second, narrower issue: the platform Pack (pre-consolidation) shipped `PIX_CHARGE_CONFIRMED_SIGNAL = "pix.charge.confirmed"`. IbateXas production already publishes `payment.confirmed` from its Stripe webhook subscriber. Renaming the production NATS subject in the same window as the Pack adoption breaks the audit-replay invariant (records emitted before the rename can't be replayed against the post-rename policy without a translation layer).

## Decision

**Two changes, both shipping in pack v0.2.0-experimental.**

### 1. Add `createPixPendingDeferGuard<S>(options)` factory

Exported from `@adjudicate/pack-payments-pix`. Builds a `Guard<string, unknown, S>` that DEFERs when the configured intent kind targets a PIX-method payment in an unsettled status. Adopters supply state-shape readers, an optional intent-kind matcher, and may override the signal/timeout/confirmed-statuses set per call.

The Pack's own `pixPolicyBundle` does NOT compose this factory — its DEFER semantics live on `pix.charge.create` (a charge always parks awaiting the webhook), which is a slightly different shape. The factory is for adopters whose intent kinds don't map 1:1 onto the Pack's vocabulary.

This is the "rule of three" forcing function: instead of waiting until three Packs have inline DEFER guards before extracting the abstraction, the factory ships now because IbateXas validates the second use case. Phase 5's `payments-stripe` Pack will validate the third (synchronous PaymentIntent flow); revisit the factory's shape then.

### 2. Rename signal constant to match production wire

`PIX_CHARGE_CONFIRMED_SIGNAL` → `PIX_CONFIRMATION_SIGNAL`, value `"pix.charge.confirmed"` → `"payment.confirmed"`. Same constant, new name and value. Defaults in `createPixPendingDeferGuard` and the Pack's own `deferChargeCreate` guard pick up the new value.

Future v1.0.0 may rename the wire value back to `pix.charge.confirmed` (cleaner namespace alignment with intent kinds). That would be a breaking change requiring:

- A migration note in CHANGELOG.
- Documentation in IbateXas (and any other adopter) of the same-PR NATS subject rename.
- A grace window where both old and new audit records can be replayed against current policy (likely via a wire-vocabulary translation step at audit-record ingestion time).

The cost of that future rename is bounded; the cost of breaking IbateXas's audit-replay window in this consolidation PR is not.

### 3. Port `escalateFailedConfirm` state guard from IbateXas

ADR-001 didn't cover the case where a confirm webhook lands on a charge already marked `failed` (the temporal race: provider says paid, local record says failed). The platform Pack's pre-consolidation policy refused this as `pix.charge.invalid_state_for_confirm`. IbateXas's pack ESCALATEd to a human for manual reconciliation — operationally the right move.

Port the guard. Add `"failed"` as a `PixChargeStatus` enum value (was missing from the platform pack's status union). Run `escalateFailedConfirm` BEFORE `validateConfirmTarget` in `pixPolicyBundle.stateGuards` so the not-pending branch produces ESCALATE rather than REFUSE.

### 4. Add four refusal builders previously absent

`refuseChargeExpired`, `refuseChargeFailed`, `refuseRateLimitExceeded`, `refuseConfirmRequiresWebhook`. None are emitted by the bundle in v0.2 — they're for adopters who compose stricter pre-bundle guards. Listed in `paymentsPixPack.basisCodes` so Phase 6 governance review tracks them.

## Consequences

**Positive:**

- IbateXas migration unblocked. The factory is the load-bearing artifact.
- Adopter pattern documented in README's new "Adoption patterns" section. Greenfield vs. existing-intent-kind adoption are both first-class.
- `paymentsPixPack.basisCodes` grows from 5 to 9 entries — closer to a complete refusal taxonomy without changing emitted behavior.
- Test count rises from 20 to 28 (+5 adopter-guard, +3 defer-round-trip). DEFER round-trip is now exercised end-to-end with `@adjudicate/runtime`'s `resumeDeferredIntent` against an in-memory Redis stub.

**Negative / accepted trade-offs:**

- Two adoption patterns means two code paths to test against future Pack changes. Mitigated by the adopter-guard test pinning the factory contract; any future change to `createPixPendingDeferGuard` that breaks adopters trips that test.
- The wire-signal value `"payment.confirmed"` is namespace-misaligned with the intent kinds. Documented as a future v1.0 breaking change.
- The factory exposes two parallel mental models — Pack-canonical intents vs. adopter-defined intents. README must teach both. Acceptable: that's the actual adoption surface, and pretending one doesn't exist is dishonest.

**Open questions for v1:**

- Should the factory's defaults (`pixMethodLabel: "pix"`, `confirmedStatuses: {confirmed, captured, paid}`) be Pack-level constants exported alongside, so adopters who override one still inherit the others? Currently they're internal.
- Should `paymentsPixPack` carry a static `factoryShape` field declaring what factories are exported? Phase 6 AaC review would benefit; not blocking now.

## Alternatives considered

- **Force IbateXas to rewrite its prompt vocabulary.** Rejected: too invasive. The Pack is meant to ease adoption, not gatekeep it.
- **Ship the factory in a separate `@adjudicate/pack-payments-pix-adapters` package.** Rejected: factories are part of the Pack's adoption surface, not a separate concern. Splitting them creates two-step adoption (install Pack → install adapters) for no structural benefit.
- **Translate signal at IbateXas's `defer-resolver.ts` boundary.** I.e., the Pack stays at `"pix.charge.confirmed"` and IbateXas maps `"payment.confirmed"` → `"pix.charge.confirmed"` before calling `resumeDeferredIntent`. Rejected: adds runtime coupling between adopter and Pack vocabulary. Worse, every future adopter would need to do the same mapping. Cleaner to push the canonical name to match production wire and document the eventual rename as a versioned breaking change.
