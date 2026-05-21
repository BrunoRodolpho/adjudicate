# ADR-110 — `@adjudicate/conformance` shipped package

**Status**: Accepted (2026-05-18 — M3 overnight execution)
**Related**: ADR-105 (closed metadata vocabulary), ADR-106 (guard exception isolation), ADR-109 (analyzer architecture)

## Context

The framework's correctness claims live as property tests in
`packages/core/tests/kernel/invariants/`:
- UNTRUSTED inputs never EXECUTE on taint-protected kinds
- Same input → same Decision (replay determinism)
- intentHash deterministic across `buildEnvelope` calls
- Basis codes drawn only from `BASIS_CODES` ∪ `Pack.basisCodes`
- Guard ordering: `state → taint → auth → business`
- `policy.default = "EXECUTE"` rejected unless opted in

These tests run against framework-internal fixtures. Adopters cannot
verify their own Packs satisfy them without copying the test code.

## Decision

Ship `@adjudicate/conformance` v0.4.0 as a public package exposing
`runConformance(pack, options) → ConformanceReport`. Six checks
ship with stable IDs (`AC-001` through `AC-006`), one per invariant.

### Determinism contract

The package is itself deterministic:

- Random envelope generation uses a seeded LCG (`s = (s * 1664525 + 1013904223) >>> 0`).
- `Math.random()` is forbidden.
- `Date.now()` is not used; deterministic timestamps are synthesized
  from the LCG.
- Same `(pack, options.seed)` produces byte-identical `ConformanceReport`.

This means CI runs are repeatable — a Pack that passes today passes
tomorrow against the same conformance package version.

### Closed catalog discipline

Per ADR-105, the AC code catalog is:
1. Closed for interoperability guarantees.
2. Additive (new checks get new codes).
3. Immutable once released (an AC-001 failure today means the same
   thing in 2030).
4. Forward-compatible (unknown codes pass through tooling).

Severity is mutable across minor versions following deprecation policy.

## Consequences

### Positive

- Adopters can run `runConformance(myPack)` in their CI alongside
  their unit tests.
- Pack quality tier (`docs/pack-ecosystem/quality-scoring.md`) Silver+
  requires conformance to pass.
- The same suite that validates first-party Packs validates community
  Packs — the bar is uniform.
- Determinism contract means flake-free CI: pass/fail does not depend
  on JIT warmup, GC pauses, or wall-clock.

### Negative

- The `KERNEL_REFUSAL_CODES` set in `pack-conformance.ts` doesn't
  include `guard_panic` (post-M1 addition). The harness compensates
  with a local overlay. Follow-up: align `KERNEL_REFUSAL_CODES` so
  the overlay becomes a no-op.

- Boot-time `assertPackConformance` and runtime `runConformance`
  overlap in scope. The split is intentional: `assertPackConformance`
  is fast structural validation (called by `installPack`);
  `runConformance` is slower property-based validation (called by
  CI). Adopters can use both.

## Migration path

- v0.4 ships the package.
- v0.5 wires `runConformance` into `pack lint --strict` as a required gate.
- v1.0 freezes the AC code catalog.

## References

- Implementation: `packages/conformance/src/`.
- Tests: `packages/conformance/tests/conformance.test.ts` (9 tests).
