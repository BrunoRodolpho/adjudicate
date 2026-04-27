---
"@adjudicate/pack-payments-pix": minor
---

Add `createPixPendingDeferGuard` factory + adopter-guard pattern; rename signal constant; ESCALATE-on-failed-confirm; +4 refusal builders.

- **NEW: `createPixPendingDeferGuard<S>(options)`** — reusable factory for adopters with their own intent kinds (e.g. `order.confirm` with `paymentMethod=pix`). Composes the same DEFER semantics into bespoke `PolicyBundle`s without rewriting prompt vocabulary. See README's "Adoption patterns" and `tests/adopter-guard.test.ts`.
- **RENAMED: signal constant `PIX_CHARGE_CONFIRMED_SIGNAL` → `PIX_CONFIRMATION_SIGNAL`**; value `"pix.charge.confirmed"` → `"payment.confirmed"`. Matches production NATS wire used by adopters consolidating from inline implementations. v1.0 may rename back to `"pix.charge.confirmed"` as a documented breaking change. See ADR-002.
- **RENAMED: `PIX_CHARGE_DEFER_TIMEOUT_MS` → `PIX_DEFAULT_DEFER_TIMEOUT_MS`** — signals it's the *default* (overridable per call via the factory).
- **NEW: `escalateFailedConfirm` state guard** — confirm event landing on a charge marked `failed` ESCALATEs to a human for manual reconciliation. Runs before `validateConfirmTarget`. New `"failed"` status added to `PixChargeStatus`.
- **NEW: `PIX_CONFIRMED_STATUSES`** (Pack-vocabulary set), `PIX_DEFAULT_EXPIRY_SECONDS` (60 minutes default).
- **NEW: 4 refusal builders** — `refuseChargeExpired`, `refuseChargeFailed`, `refuseRateLimitExceeded`, `refuseConfirmRequiresWebhook`. Not emitted by `pixPolicyBundle` directly (for adopter-composed pre-bundle guards); included in `paymentsPixPack.basisCodes` for Phase 6 governance.
- **NEW: integration test** — `tests/defer-round-trip.test.ts` exercises the full park/resume cycle end-to-end against `@adjudicate/runtime`'s `resumeDeferredIntent` with an in-memory Redis stub. Pack now declares `@adjudicate/runtime` as a devDependency.
- Test count: 20 → 28 (+5 adopter-guard, +3 defer-round-trip).
- ADR-002 documents the design rationale.

**Migration:** consumers of `PIX_CHARGE_CONFIRMED_SIGNAL` and `PIX_CHARGE_DEFER_TIMEOUT_MS` rename to `PIX_CONFIRMATION_SIGNAL` and `PIX_DEFAULT_DEFER_TIMEOUT_MS`. Wire signal value changes from `"pix.charge.confirmed"` to `"payment.confirmed"` — adopters publishing to NATS need to align their wire vocabulary.
