# ADR-002 — Reusable DEFER guard factory + signal-name reconciliation

**Status:** Accepted, 2026-04-27.
**Phase:** 1 (lighthouse Pack hardening before npm publish).
**Deciders:** maintainers.

## Context

[ADR-001](./ADR-001-payments-pix.md) committed to three intent kinds (`pix.charge.{create,confirm,refund}`) as the canonical Pack contract. Greenfield adopters use those intent kinds directly: their LLM (or webhook adapter) builds envelopes against `paymentsPixPack.policy` and the kernel adjudicates.

But a second adopter pattern surfaced that ADR-001 hadn't anticipated: **adopters whose LLM proposes a higher-level intent kind that subsumes PIX, and want to compose the Pack's DEFER semantics into their own bundle without rewriting their prompt vocabulary.**

IbateXas is the canonical adopter. Its LLM proposes an order-level checkout intent with a `paymentMethod` payload field; before this Pack existed, the inline DEFER guard lived in an in-repo `order-policy-bundle.ts`. Migrating IbateXas to consume this Pack faced two options:

1. **Rewrite the LLM prompt vocabulary** so `pix.charge.confirm` envelopes flow through the legacy inline bundle. Big change, hard to roll back.
2. **Expose a reusable factory** so the same DEFER predicate composes against any intent kind. Small change, no prompt churn.

A second, narrower issue: the platform Pack (pre-consolidation) shipped `PIX_CHARGE_CONFIRMED_SIGNAL = "pix.charge.confirmed"`. IbateXas production already publishes `payment.confirmed` from its webhook subscriber. Renaming the production NATS subject in the same window as the Pack adoption breaks the audit-replay invariant (records emitted before the rename can't be replayed against the post-rename policy without a translation layer).

## Decision

Two changes, shipping together in this Pack. (Exported Pack version: `0.1.0-experimental` in `src/index.ts`; package `0.2.1`.)

### 1. Add `createPixPendingDeferGuard<S>(options)` factory

Exported from `@adjudicate/pack-payments-pix` (`src/guards.ts`). Builds a `Guard<string, unknown, S>` that DEFERs when the configured intent kind targets a PIX-method payment in an unsettled status. Adopters supply state-shape readers (`readPaymentMethod`, `readPaymentStatus`), an optional intent-kind matcher (defaults to `pix.charge.confirm`), and may override `pixMethodLabel`, `confirmedStatuses`, `signal`, and `timeoutMs` per call.

The Pack's own `pixPolicyBundle` does NOT compose this factory — its DEFER semantics live on `pix.charge.create` via `deferChargeCreate` (a charge always parks awaiting the webhook), which is a slightly different shape. The factory is for adopters whose intent kinds don't map 1:1 onto the Pack's vocabulary.

This is the "rule of three" forcing function: instead of waiting until three Packs have inline DEFER guards before extracting the abstraction, the factory ships now because IbateXas validates the second use case. A future synchronous-PaymentIntent Pack (`payments-stripe`) would validate the third; revisit the factory's shape then.

### 2. Rename signal constant to match production wire

`PIX_CHARGE_CONFIRMED_SIGNAL` → `PIX_CONFIRMATION_SIGNAL`, value `"pix.charge.confirmed"` → `"payment.confirmed"` (`src/types.ts`). Same constant, new name and value. Defaults in `createPixPendingDeferGuard` and the Pack's own `deferChargeCreate` guard pick up the new value, and `paymentsPixPack.signals` declares `["payment.confirmed"]`.

A future v1.0.0 may rename the wire value back to `pix.charge.confirmed` (cleaner namespace alignment with intent kinds). That would be a breaking change requiring:

- A migration note in CHANGELOG.
- Documentation in IbateXas (and any other adopter) of the same-PR NATS subject rename.
- A grace window where both old and new audit records can be replayed against current policy (likely via a wire-vocabulary translation step at audit-record ingestion time).

The cost of that future rename is bounded; the cost of breaking IbateXas's audit-replay window in this consolidation was not.

### 3. Port `escalateFailedConfirm` state guard from IbateXas

ADR-001 didn't cover the case where a confirm webhook lands on a charge already marked `failed` (the temporal race: provider says paid, local record says failed). The platform Pack's pre-consolidation policy refused this. IbateXas's pack ESCALATEd to a human for manual reconciliation — operationally the right move.

Port the guard. Add `"failed"` to the `PixChargeStatus` union (`src/types.ts`; was missing from the platform pack's status union). `escalateFailedConfirm` runs BEFORE `validateConfirmTarget` in `pixPolicyBundle.stateGuards` (`src/policies.ts`) so the not-pending branch produces ESCALATE rather than REFUSE.

### 4. Add four refusal builders previously absent

`refuseChargeExpired`, `refuseChargeFailed`, `refuseRateLimitExceeded`, `refuseConfirmRequiresWebhook` (`src/refusals.ts`). None are emitted by the bundle today — they're for adopters who compose stricter pre-bundle guards. Listed in `paymentsPixPack.basisCodes` so governance review tracks them.

## Consequences

**Positive:**

- IbateXas migration unblocked. The factory is the load-bearing artifact, and it has a live adopter: `@ibatexas/pack-orders`' `src/policies.ts` composes `createPixPendingDeferGuard<OrderState>` against the `order.checkout.create` intent kind. (The original `@ibatexas/llm-provider` / `order-policy-bundle.ts` adopter cited in earlier drafts was removed when the legacy LLM brain was deleted; the composition migrated into `@ibatexas/pack-orders`, which is now the canonical example. IbateXas's own rule "new PIX-pending consumers MUST import the factory from this Pack" keeps it the mandated path.)
- Adopter pattern documented in README's "Adoption patterns" section. Greenfield vs. existing-intent-kind adoption are both first-class.
- `paymentsPixPack.basisCodes` grows from 5 to 9 entries — closer to a complete refusal taxonomy without changing emitted behavior.
- 31 tests across 6 files, including `adopter-guard.test.ts` (5 cases, pinning the factory contract) and `defer-round-trip.test.ts` (3 cases). DEFER round-trip is exercised end-to-end with `@adjudicate/runtime`'s `resumeDeferredIntent` against an in-memory Redis stub.

**Negative / accepted trade-offs:**

- Two adoption patterns means two code paths to test against future Pack changes. Mitigated by `adopter-guard.test.ts` pinning the factory contract; any future change to `createPixPendingDeferGuard` that breaks adopters trips that test.
- The wire-signal value `"payment.confirmed"` is namespace-misaligned with the intent kinds. Documented as a future v1.0 breaking change.
- The factory exposes two parallel mental models — Pack-canonical intents vs. adopter-defined intents. README must teach both. Acceptable: that's the actual adoption surface.

**Open questions for v1:**

- Should the factory's defaults (`pixMethodLabel: "pix"`, `confirmedStatuses: {confirmed, captured, paid}`) be exported as Pack-level constants alongside the factory, so adopters who override one still inherit the others? Currently the default set is internal to `guards.ts` (`PIX_CONFIRMED_STATUSES` is exported, but is the type-checked union, not the factory's default).
- Should `paymentsPixPack` carry a static `factoryShape` field declaring what factories are exported? Governance (AaC) review would benefit; not blocking now.

## Alternatives considered

- **Force IbateXas to rewrite its prompt vocabulary.** Rejected: too invasive. The Pack is meant to ease adoption, not gatekeep it.
- **Ship the factory in a separate `@adjudicate/pack-payments-pix-adapters` package.** Rejected: factories are part of the Pack's adoption surface, not a separate concern. Splitting them creates two-step adoption (install Pack → install adapters) for no structural benefit.
- **Translate the signal at the adopter's `defer-resolver` boundary.** I.e., the Pack stays at `"pix.charge.confirmed"` and the adopter maps `"payment.confirmed"` → `"pix.charge.confirmed"` before calling `resumeDeferredIntent`. Rejected: adds runtime coupling between adopter and Pack vocabulary, and every future adopter would need the same mapping. Cleaner to push the canonical name to match production wire and document the eventual rename as a versioned breaking change.
