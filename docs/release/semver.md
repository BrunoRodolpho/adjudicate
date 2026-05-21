# Semver Policy

> The version contract for `@adjudicate/*`. Adopters get to read these rules
> once and predict, for any release, exactly what is allowed to change.

---

## Scope

This document covers every package published under the `@adjudicate/*` scope:
`@adjudicate/core`, `@adjudicate/audit`, `@adjudicate/audit-postgres`,
`@adjudicate/runtime`, `@adjudicate/primitives`, `@adjudicate/cli`,
`@adjudicate/analyze`, `@adjudicate/eslint-config`, the integration adapter
(`@adjudicate/anthropic`), the domain Packs (`pack-*`),
`@adjudicate/observability`, and `@adjudicate/migrate`.

Internal helper packages and apps (`apps/*`, `examples/*`, `bench`) are NOT
covered — they're consumed only via the repo and need no semver promise.

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

## The pre-`v1.0` window

We are currently in the `v0.x` line. Per semver, `v0.x` releases may
include breaking changes in minor bumps. We hold ourselves to a stricter
standard than the spec mandates:

- **`v0.x` minor bumps may break public types.** We will document every
  break in CHANGELOG.md with a migration path (codemod, if applicable).
- **`v0.x` patch bumps never break public types.** This is the same rule
  as post-v1 — we don't reach for the patch lane to ship breaks.
- **The five headline interfaces are stable across `v0.x` minors**
  (`IntentEnvelope`, `Decision`, `PolicyBundle`, `CapabilityPlanner`,
  `AuditSink`). Other surfaces may evolve.

The Pack ecosystem assumes the headline five are immovable; if they
move, every Pack rebuilds.

---

## Post-`v1.0` compatibility window

Once `v1.0.0` ships:

- The **24-month deprecation horizon** begins. Any public API that exists
  in `v1.0.0` and is not subsequently marked `@deprecated` is guaranteed
  to keep working through at least `v3.0.0` (assuming MAJOR-per-year
  cadence) or for 24 months, whichever is longer.
- Deprecated APIs remain in the published code for **at least** two
  consecutive MAJORs after the deprecation lands. Removal is scheduled
  in `docs/release/deprecations.md`.
- The audit record schema may evolve through additive minors; the loader
  in `@adjudicate/audit` reads every shipped schema version.

This is stronger than most JS-ecosystem projects offer. The reason: the
asset adopters build on adjudicate is the policy bundle, and policy
bundles are designed to live for years. We make the substrate match.

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
> `vX.Y′.Z′`, produce a Decision that classifies as `IDENTICAL` or
> `BASIS_ONLY` per `@adjudicate/core`'s `replay-classify`.**

`BASIS_ONLY` covers additive basis codes (we added a new code but the
Decision kind + structural meaning is the same). `IDENTICAL` covers every
other case. Any drift beyond these two classes is a MAJOR.

This is the rule everything else folds into. When we draft a change, the
question we ask first is "does the replay harness still classify this as
IDENTICAL or BASIS_ONLY for every existing audit row?" — if no, the
change is breaking, regardless of how the diff looks.

---

## Release cadence

- **Patch releases**: on demand, typically within a week of a regression
  being filed.
- **Minor releases**: roughly monthly, paced by milestone planning.
- **Major releases**: yearly at most, post-`v1.0`. Pre-`v1.0` is
  milestone-driven without a fixed cadence.

Pre-release tags (`v0.5.0-rc.0`, etc.) are used for adopter dogfooding
when a minor introduces significant new surface area. The headline rule
applies: even `-rc` tags don't break the replay invariant for already-
stored audit rows.
