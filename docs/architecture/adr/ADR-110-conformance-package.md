# ADR-110 — `@adjudicate/conformance` shipped package

- **Status:** Accepted
- **Date:** 2026-05-18 (M3 overnight execution)
- **Related:** ADR-105 (closed metadata vocabulary), ADR-106 (guard exception isolation), ADR-109 (analyzer architecture)

> Scope note: this ADR covers the original six-check conformance slice
> (`runConformance` / AC-001..AC-006). The package has since matured
> (`packages/conformance` is at 1.1.0) and `index.ts` now also exports
> manifest validation, pack-trust, AI-BOM (ADR-127), config-seal
> (ADR-121), and pack-health. Those primitives are governed by their
> own ADRs (ADR-115 / ADR-121 / ADR-127), not this one.

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

Ship `@adjudicate/conformance` exposing
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

### Design note — two entry points by intent

Boot-time `assertPackConformance` and runtime `runConformance` overlap
in scope. The split is intentional: `assertPackConformance` is fast
structural validation (called by `installPack`); `runConformance` is
slower property-based validation (called by CI). Adopters can use both.

## Migration path

All milestones below are complete:

- The package ships and is published (`packages/conformance`, currently 1.1.0).
- `KERNEL_REFUSAL_CODES` in `core/src/pack-conformance.ts` now includes
  `guard_panic` (the SECURITY REFUSE code a thrown guard converts to,
  per ADR-106). The local overlay the basis-vocabulary-purity check
  carried pre-merge is removed — see the comment in
  `checks/basis-vocabulary-purity.ts`.
- The AC code catalog is frozen.

Note on the CLI gate: `runConformance` is wired into the CLI via the
`pack bom` command (`packages/cli/src/commands/pack-bom.ts`), which
composes fingerprint + conformance + health + manifest. The `pack lint`
command runs the kernel's fast structural check (`assertPackConformance`)
rather than the property suite, and `--strict` is an `analyze`-command
flag (escalate warnings to errors), not a conformance gate.

## References

- Implementation: `packages/conformance/src/` (this ADR scopes
  `runner.ts` + `checks/`; the package now also ships manifest /
  pack-trust / ai-bom / config-seal / pack-health under their own ADRs).
- Tests: `packages/conformance/tests/conformance.test.ts` (9 tests) for
  the conformance slice; the package additionally has `ai-bom.test.ts`,
  `config-seal.test.ts`, `manifest.test.ts`, `pack-health.test.ts`, and
  `pack-trust.test.ts` for the later primitives.
