# ADR-108 — `@adjudicate/primitives` Layer 2 expansion

**Status**: Accepted (2026-05-18 — M2 overnight execution)
**Supersedes**: none
**Related**: ADR-105 (guard metadata closed vocabulary), `docs/concepts.md §9` (architectural direction)

## Context

`@adjudicate/primitives` shipped at v0.1 with three factories:

- `createThresholdGuard` — comparator + onCross
- `createStateDeferGuard` — match + signal + timeoutMs + basis
- `createSystemTaintPolicy` — system-only intent enumeration

These cover patterns that PIX and KYC Packs *already* shared identically.

Three more patterns appeared in PIX/KYC/deployments policy bodies that
satisfy the rule-of-two extraction discipline:

1. **REWRITE-clamping**: PIX's `clampRefundToOriginal` rebuilds the
   envelope with one field replaced. The pattern (extract value, compare
   to cap, rebuild envelope with clamped field, emit `decisionRewrite`)
   repeats in any Pack with a payload-clamping requirement.

2. **REQUEST_CONFIRMATION threshold**: PIX's
   `requestConfirmForMediumRefund` is `createThresholdGuard` +
   `onCross: decisionRequestConfirmation(...)`. The factory expression
   is verbose; a dedicated `createConfirmGuard` is the right shape.

3. **ESCALATE threshold**: PIX's `escalateLargeRefunds` is similarly
   `createThresholdGuard` + `onCross: decisionEscalate(...)`.

A fourth pattern — domain-level idempotency — appears in adopter
landscape (IbateXas's order-confirm flow) but does not appear in any
shipped first-party Pack. It's added preemptively because the
implementation is trivial and the GuardMetadata `opaque` variant
documents the abstraction.

## Decision

Add four factories to `@adjudicate/primitives`:

1. **`createRewriteGuard`** — REWRITE factory. Single-field clamp, with
   metadata `description: { kind: "rewrite", mutatesPayloadFields: [field] }`.

2. **`createConfirmGuard`** — REQUEST_CONFIRMATION factory. Thin alias
   over `createThresholdGuard` with `onCross` pinned to
   `decisionRequestConfirmation`.

3. **`createEscalateGuard`** — ESCALATE factory. Thin alias over
   `createThresholdGuard` with `onCross` pinned to `decisionEscalate`.
   Carries the route (`human` | `supervisor`).

4. **`createIdempotencyGuard`** — Domain-level idempotency. Carries
   `description: { kind: "opaque", note: "domain-level idempotency check" }`.

All four factories produce guards via `withMetadata` per ADR-105, so the
M2 analyzer (`@adjudicate/analyze`) can reason about them statically.

The three existing factories are unchanged. Pack authors who already use
`createThresholdGuard` with `onCross: decisionEscalate(...)` continue to
work — the new factories are syntactic conveniences, not replacements.

## Consequences

### Positive

- Pack #4 (next community Pack) can be authored more declaratively.
- Analyzer (ADR-109) has more `GuardMetadata.description` variants to
  reason about — `escalate` and `confirm` are tracked through their
  parent `createThresholdGuard` metadata; `rewrite` is its own variant.
- The `mutatesPayloadFields` declaration becomes universally available
  via `createRewriteGuard` (instead of requiring authors to remember
  `withMetadata({ description: { kind: "rewrite", ... } })` manually).

### Negative

- The package surface grows by 4 factories. Each is small (~30 LOC + tests),
  but each new factory is an additional API stability commitment for
  v1.0. Mitigated by: (a) factories are additive — pre-existing factories
  unchanged; (b) closed-vocabulary discipline (ADR-105) bounds the
  evolution; (c) the rule-of-two ensures each factory has at least two
  validating adopter use cases.

### Neutral

- PIX/KYC/deploy guards are NOT refactored to consume the new factories
  in this milestone. Decision D-005 logs the deferral: the existing
  guards work fine and refactoring is cosmetic. Future Packs may use
  the new factories from day one.

## Alternatives considered

### One-mega-factory `createGuard({ onMatch, decision })`

Rejected. Conflates the patterns and gives Pack authors no compile-time
guidance about WHICH Decision the factory produces. The current set of
narrow factories matches the rule-of-three: each factory has at most
one Decision kind in `onCross`.

### Macros (template strings)

Rejected on sight. The 1980s expert-systems shells died of this.
Stay in TypeScript per `docs/concepts.md §9.4`.

### Generated factories from `BASIS_CODES`

Considered. Rejected because the closed-vocabulary discipline (ADR-105)
applies to BASIS_CODES, not to factory inputs — generating a factory
per code adds friction without leverage. The four factories chosen
are the four patterns visible in production code.

## Migration path

- v0.3 ships the expanded surface.
- Pack authors opt in by adopting new factories at their own pace.
- v1.0 freezes the public surface; further additions require ADR.

## References

- Implementation: `packages/primitives/src/guards.ts` lines (createRewriteGuard, createConfirmGuard, createEscalateGuard, createIdempotencyGuard).
- Tests: `packages/primitives/tests/m2-factories.test.ts`.
- Deferred consumption: `docs/execution/decisions-log.md` §D-005.
