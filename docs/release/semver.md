# Semver Policy

> The version contract for `@adjudicate/*`. Adopters get to read these rules
> once and predict, for any release, exactly what is allowed to change.

---

## Scope

This document covers every package published under the `@adjudicate/*` scope:

- **Kernel & audit**: `@adjudicate/core`, `@adjudicate/audit`,
  `@adjudicate/audit-postgres`, `@adjudicate/canonical`,
  `@adjudicate/primitives`, `@adjudicate/runtime`.
- **Adapters**: `@adjudicate/adapter-core`, `@adjudicate/anthropic`,
  `@adjudicate/openai`.
- **Tooling & operations**: `@adjudicate/cli`, `@adjudicate/analyze`,
  `@adjudicate/admin-sdk`, `@adjudicate/migrate`,
  `@adjudicate/observability`, `@adjudicate/conformance`,
  `@adjudicate/approval-engine`, `@adjudicate/drift`,
  `@adjudicate/red-team`, `@adjudicate/locales-pt-br`.
- **Domain Packs** (`@adjudicate/pack-*`): `pack-access-governance`,
  `pack-deployments-approval`, `pack-identity-kyc`,
  `pack-incident-response`, `pack-payments-pix`.

`@adjudicate/eslint-config` is `private` (not published); its versioned
rules are still governed by the ESLint-config rule in
[What does NOT count as breaking](#what-does-not-count-as-breaking).

Apps and fixtures (`apps/*`, `examples/*`, `bench`) are NOT covered —
they're consumed only via the repo and need no semver promise.

---

## Versioning rules

We follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
The three categories below describe how we interpret the spec for this
codebase specifically.

### MAJOR — breaking change

A bump from `0.Y.Z → 1.0.0`, or from `X.Y.Z → (X+1).0.0` post-`v1`.
Required when **any** of the following changes:

- A public type's shape (added required field, removed field, renamed field,
  narrowed value union, widened return type beyond the documented contract).
- A public function's signature (added required parameter, removed parameter,
  changed return type's runtime shape).
- An exported identifier is removed or renamed.
- An invariant the kernel previously enforced is relaxed (e.g., guard
  ordering, taint floor enforcement, fail-closed default).
- A `Decision.kind` value is removed or its semantic changes (replay safety
  depends on this set being closed and stable).
- The audit record schema gains a required field (existing readers break)
  or removes a field readers depend on.
- The `AuditRecord.version` constant moves forward in a way that older
  readers cannot tolerate (per [ADR on audit versioning]).

### MINOR — additive

A bump from `X.Y.Z → X.(Y+1).0`. Allowed for:

- New exported function / type / module / subpath export.
- New optional field on a public type (default `undefined`; old code that
  ignores it keeps working).
- New `Decision.kind`-adjacent surface that does NOT change the closed enum
  (e.g., adding fields onto an existing kind's payload that consumers can
  destructure).
- New `BASIS_CODES` entries within an existing category. Adopters who
  pattern-match on category prefixes keep working; new codes are surfaced
  via the audit trail.
- New sinks, new exporters, new codemods.
- Renaming an internal identifier whose previous name was never exported.

The rule of thumb: adopters who recompile against the new version with no
code changes must build, link, and run. If we can't promise that, we owe
them a MAJOR.

### PATCH — fix or doc

A bump from `X.Y.Z → X.Y.(Z+1)`. Reserved for:

- Bug fixes that move behaviour closer to the documented spec (a previously
  silent failure now surfaces a `RefusalKind` correctly).
- Tightening internal types where the public shape is unchanged.
- Documentation, type-jsdoc, README, runbook fixes.
- Performance improvements that don't change observable behaviour.

> **A bug fix that changes the Decision an adopter previously observed is a
> MAJOR, not a PATCH.** Even if the previous behaviour was unintended.
> Replay safety is the headline product; we don't break it silently.

---

## Compatibility window (post-`v1.0`)

The kernel has shipped its first MAJOR: `@adjudicate/core` is `1.x` and
`@adjudicate/audit` is `2.x`. The post-`v1.0` compatibility window is in
force.

- The **24-month deprecation horizon** applies. Any public API that
  exists at its package's first stable MAJOR and is not subsequently
  marked `@deprecated` is guaranteed to keep working through at least two
  more MAJORs or 24 months, whichever is longer. Per-surface horizons are
  set by the stability tiers in
  [`docs/release/deprecations.md`](./deprecations.md) (Headline ≥ 36
  months; Pack-author 24 months; Operator 12 months).
- Deprecated APIs remain in the published code for **at least** two
  consecutive MAJORs after the deprecation lands. Each one carries a
  `@deprecated` JSDoc tag, a removal target, and (when mechanical) a
  codemod in `@adjudicate/migrate`. The live calendar is in
  [`docs/release/deprecations.md`](./deprecations.md).
- The audit record schema may evolve through additive minors; the loader
  in `@adjudicate/audit` reads every shipped schema version.

The **five headline interfaces** — `IntentEnvelope`, `Decision`,
`PolicyBundle`, `CapabilityPlanner`, `AuditSink` — are the most stable
surface in the scope. Deprecating any of them requires an ADR (see the
Headline tier in `deprecations.md`). The Pack ecosystem assumes these
five are immovable; if they move, every Pack rebuilds.

This is stronger than most JS-ecosystem projects offer. The reason: the
asset adopters build on adjudicate is the policy bundle, and policy
bundles are designed to live for years. We make the substrate match.

> **Per-package versions differ.** Not every package is post-`v1`.
> Adapters, packs, and some tooling are still `0.x`; for those, a minor
> bump may break public types (documented in CHANGELOG with a migration
> path). The post-`v1.0` window above applies once a given package cuts
> its first stable MAJOR — `@adjudicate/core` and `@adjudicate/audit`
> already have.

---

## What does NOT count as breaking

These are explicitly minor changes despite looking risky:

- **Internal performance changes** that don't alter Decision outcomes,
  audit shape, or basis codes. Latency improvements are minor.
- **Renaming or rearranging files inside a package**, as long as no
  exported subpath is removed (`@adjudicate/core/kernel` MUST keep
  resolving even if its underlying file moves).
- **Tightening internal types** that were never exported.
- **Adding new ADRs** or runbooks. Docs are not API.
- **Adding new ESLint rules** to `@adjudicate/eslint-config` (the rules
  themselves are versioned; adopters who pin a config version don't
  receive new rules until they bump).

---

## Replay invariant — the load-bearing rule

The single rule that constrains every change above:

> **A bundle that produced a particular Decision at version `vX.Y.Z` must,
> when replayed against the same envelope + state in any later version
> `vX.Y′.Z′`, classify as `IDENTICAL` or (within the documented tolerance)
> `BASIS_ONLY` per the replay longevity model.**

The `IDENTICAL` / `BASIS_ONLY` vocabulary is defined in
[`docs/specs/REPLAY_LONGEVITY_MODEL.md`](../specs/REPLAY_LONGEVITY_MODEL.md):
`IDENTICAL` means same Decision kind, basis flat-set, and supersession;
`BASIS_ONLY` means the kind is identical but the basis set was re-ordered
or refined. Any `DECISION_KIND` drift on a `v1.x` replay is a MAJOR.

The mechanical classifier behind this is `@adjudicate/core`'s
`classify()` in `packages/core/src/replay-classify.ts`. It returns `null`
when two Decisions match, otherwise a `ReplayMismatch` whose `kind` is the
first axis of divergence: `DECISION_KIND` > `BASIS_DRIFT` >
`REFUSAL_CODE_DRIFT`. A `null` result is the `IDENTICAL` case; a
`BASIS_DRIFT`-only mismatch (with a non-empty `basisDelta`) is the
`BASIS_ONLY` case the longevity model tolerates; any other `kind` is
breaking. (The kernel's shadow-mode `DivergenceClass` in
`packages/core/src/kernel/shadow.ts` — `NONE` / `BASIS_ONLY` /
`DECISION_KIND` / `PAYLOAD_REWRITE` — is a separate, live-traffic
classifier; don't conflate it with the replay-harness shape above.)

This is the rule everything else folds into. When we draft a change, the
question we ask first is "does the replay harness still classify this as
`IDENTICAL` or `BASIS_ONLY` for every existing audit row?" — if no, the
change is breaking, regardless of how the diff looks.

---

## Release cadence

- **Patch releases**: on demand, typically within a week of a regression
  being filed.
- **Minor releases**: roughly monthly, paced by milestone planning.
- **Major releases**: yearly at most for a stabilized package. Packages
  still on `0.x` are milestone-driven without a fixed cadence.

Pre-release tags (`-rc.0`, etc.) are used for adopter dogfooding when a
minor introduces significant new surface area. The headline rule applies:
even `-rc` tags don't break the replay invariant for already-stored audit
rows.
