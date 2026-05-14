# ADR-105 — Guard metadata as a closed semantic-interoperability vocabulary

**Status**: Accepted (2026-05-13)
**Supersedes**: none
**Related**: ADR-101 (kernel audit emission), ADR-104 (envelope v2 nonce)

## Context

Through the v0.1 cycle the kernel's `Guard<K, P, S>` type was a bare
function: `(envelope, state) => Decision | null`. This kept the surface
minimal, but it left every downstream tool (`analyzePolicy` reachability,
REWRITE-scope checks, deprecation lifecycle, policy visualization,
explanation systems, static linting, fuzz instrumentation) without a way
to inspect what a guard *is*. Two specific gaps drove this ADR:

1. The `traceEntry` builder in `_adjudicateImpl` could only read
   `Function.name` to identify the matched guard. Factory-built guards
   (`createThresholdGuard({...})`) returned anonymous closures and lost
   their identity in the trace; `nameGuard()` existed as a workaround that
   mutated `Function.name` directly, but mutating a built-in property to
   smuggle metadata is a code-smell that future tooling would also need to
   work around.

2. `LearningEvent.basisCodes` identifies *which guard category and code*
   matched, but not *which guard within that category*. A Pack with five
   business guards all emitting `business:rule_satisfied` produced
   indistinguishable learning events. Analyzers, deprecation workflows,
   and rename tooling need a stable identifier per guard.

The synthesis at `docs/research/enhancement-todo.md` (P0-3) called for a
single shared metadata surface that solves both gaps without growing into
an open-ended escape hatch.

## Decision

Introduce a symbol-keyed metadata slot on guards, populated via a typed
`withMetadata` constructor, with a closed discriminated semantic
vocabulary (`GuardDescription`).

```ts
const GuardMetadataSymbol: unique symbol;

interface GuardMetadata {
  readonly name?: string;
  readonly author?: string;
  readonly since?: string;
  readonly description?: GuardDescription;  // optional — see rule 7
}

type GuardDescription =
  | { kind: "threshold"; threshold: number; comparator: ">=" | "<=" | ">" | "<"; emits?: Decision["kind"] }
  | { kind: "state_defer"; signal: string; timeoutMs: number }
  | { kind: "system_taint"; systemOnlyKinds: ReadonlyArray<string> }
  | { kind: "rewrite"; mutatesPayloadFields: ReadonlyArray<string> }
  | { kind: "opaque"; note?: string };

function withMetadata<G>(guard: G, meta: GuardMetadata): G;
function readGuardMetadata(guard: Guard): GuardMetadata | undefined;
```

The kernel reads metadata at trace-emission time. `LearningEvent.guardId`
(new field) is populated from the matched guard via the rule
`metadata.name ?? guard.name`. `nameGuard("foo", g)` becomes a thin
facade over `withMetadata(g, { name: "foo" })`. The L2 factories
(`createThresholdGuard`, `createStateDeferGuard`) auto-attach a typed
`description`.

## Evolution rules

Each rule is a hard rule, not a guideline. Together they make
`GuardDescription` a stable interoperability surface without forcing every
guard in the ecosystem to opt in.

1. **The built-in variant set is closed for interoperability guarantees,
   but tooling MUST tolerate unknown variants for forward compatibility
   and private ecosystem extensions.** This is the governance model —
   closed for what we promise, semi-open for what tooling must accept.
   Stating both halves explicitly is load-bearing; future contributors
   must not read "closed" as "tooling may throw on unknown."
2. **Variants are additive and discriminated** — new variants may be
   added in any minor version; the discriminator is `kind`.
3. **Existing variants are immutable once released** — field shapes
   within a released variant cannot change without a major version bump.
4. **Tooling may safely assume semantic stability of existing variants** —
   analyzers built against a variant in v0.X continue to work in v0.(X+N).
5. **Unknown variants MUST be ignored safely by tooling** — analyzers
   seeing a `kind` they don't recognize must skip, not throw. This
   protects forward-compat with private/experimental variants.
6. **Analyzers MUST branch on `kind`** — never assume completeness;
   always have a default branch that treats unknown as `opaque`.
7. **Absence of metadata MUST remain legal forever** —
   `readGuardMetadata(g)` returning `undefined` is a permanent valid
   state. User-authored guards, lightweight wrappers, and old Packs
   without metadata are first-class. No analyzer or kernel path may
   require metadata presence to operate correctly. `GuardMetadata.description`
   is itself optional for the same reason — required-presence would force
   fake metadata creation on user-authored guards.
8. **`opaque.note` is human-only** — analyzers MUST NOT parse it. It
   exists as an operator/debugger breadcrumb; no semantic meaning is
   conveyed.
9. **Metadata is attached to concrete executable guards, not synthesized
   across composition boundaries.** v0.1: combinators (`and`, `or`,
   `not` from `combinators.ts`) remain structurally opaque unless
   explicitly annotated via `withMetadata`. Trace representation
   surfaces leaf-guard metadata, not synthesized composite metadata.
   Future composition-aware metadata propagation is deferred — the
   principle here is *do not invent inconsistent propagation rules now
   that future contributors will quietly diverge from*. If
   combinator-aware metadata becomes necessary, ship it as an explicit
   ADR amendment with one canonical synthesis rule.
10. **`withMetadata(g, m) === g`. Metadata is per-field immutable and
    additively composable.** The attachment mechanism is
    `Object.defineProperty` per field with `configurable: false,
    writable: false` — individual fields cannot be mutated post-attachment.
    Wrapping is prohibited. Composition across L2 factories (which attach
    `description`) and `nameGuard` (which attaches `name`) succeeds when
    the calls write disjoint fields; this is the canonical PIX/KYC
    pattern `nameGuard("escalateLargeRefunds", createThresholdGuard(...))`.
    Reattaching a field with the same value is idempotent. Reattaching a
    field with a different value throws TypeError — per-field overrides
    require composing a fresh guard via `(...args) => g(...args)` and
    re-attaching from scratch, which is intentionally inconvenient.

## Consequences

### Positive

- Trace + learning identity is now stable across factory-built guards;
  `LearningEvent.guardId` populated end-to-end via the
  `metadata.name ?? guard.name` derivation.
- Five downstream P1/P2 tickets (`analyzePolicy` reachability, REWRITE-scope
  check, deprecation lifecycle, `PolicyBundleDescriptor`, fuzz harness)
  unblock against a single shared metadata surface instead of inventing
  five overlapping ones.
- L2 factories now declare their semantic shape automatically — every
  PIX and KYC threshold/defer guard carries metadata with no Pack-author
  code change.
- `nameGuard` semantics simplify: it's now `withMetadata(g, { name })` —
  no more `Function.name` mutation as a workaround.

### Negative

- `adjudicateAndAudit` and `adjudicateAndLearn` now call
  `adjudicateWithTrace` internally instead of pure `adjudicate()`, paying
  one small array allocation per call to populate the trace. Trace
  fidelity is structurally guaranteed (shared implementation), so this
  is a constant-cost addition with no correctness risk.
- The discriminated `GuardDescription` union is a one-way door —
  variants released here cannot be reshaped. The closed-vocabulary
  governance model in rule 1 makes this explicit, but contributors must
  resist "let's just add a field" pressure on existing variants.

### Neutral

- v0.1 ships only five variants. Future variants (rate-limit, quorum,
  self-actor) extend the union additively per rule 2. Each new variant
  costs one PR + one ADR amendment.

## Alternatives considered

### Free-string `description: string`

Reviewer's initial preference. Rejected because once analyzers exist,
free-text descriptions become pseudo-APIs immediately: regex parsers,
prompt-based extractors, undocumented conventions, semantic drift —
none of which we can retract safely. The closed discriminated union
prevents this trap structurally.

### Decision-shape change (`Decision.metadata?: Record<string, unknown>`)

Rejected. Open-shape escape hatches are how every closed-enum vocabulary
the author has worked on has died. The Decision algebra's six closed
kinds are the load-bearing claim that justifies the framework existing;
adding a stringly-typed metadata bag corrodes that claim. If a future
need appears, extend the closed enum deliberately — do not invent a
metadata bag.

### YAML/JSON Pack DSL

Rejected on sight. The 1980s expert-systems shell ecosystem died of DSL
proliferation. Stay in TypeScript; let `GuardDescription` carry the
structured-but-typed declarative content.

### Composition-aware metadata propagation in v0.1

Deferred. Rule 9 makes the principle explicit: do not invent inconsistent
propagation rules now that future contributors will quietly diverge from.
Combinators stay opaque unless explicitly annotated; if propagation
becomes necessary later, it ships as an explicit ADR amendment with one
canonical synthesis rule.

## References

- Synthesis TODO: `docs/research/enhancement-todo.md` (P0-3)
- ADR-104: envelope v2 nonce (precedent for closed-enum governance)
- ADR-101: kernel audit emission (the LearningEvent shape this ADR
  extends)
- Comparable governance models: ESTree, LSP capability negotiation,
  OpenTelemetry semantic conventions — all treat the platform vocabulary
  as closed-for-guarantees, semi-open-for-tolerance.
