# Extension policy

> **Status.** Normative. Defines what can be extended, by whom, and
> under what discipline post-v1. Companion to
> [`semver.md`](./semver.md), [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md),
> and [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md).
>
> The framework's defining property post-v1 is its *predictability of
> evolution*. This document codifies how that predictability is
> maintained.

---

## 1. Extension philosophy

Every change to the framework either:

1. extends a surface that is explicitly *extension-open*; or
2. crosses a frozen boundary and therefore is governed by
   `SEMVER_GOVERNANCE.md`.

If you don't know which, the freeze matrix
([`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md)) is the source of truth.
Every public surface carries an `Extension policy: closed | additive |
open` column.

The framework rejects ad-hoc extension. Three permanent rules:

- **Closed enums stay closed.** Six `Decision.kind` values; eleven
  `BasisCategory` values; three `Taint` values; the closed sets in
  §4 of [`docs/specs/MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md).
  Widening them is a coordinated MAJOR with multi-runtime co-release.
- **Wire formats stay frozen.** `IntentEnvelope v2`, `AuditRecord v5`,
  canonical-JSON hash recipe. Any change is a new version published
  alongside golden vectors. (`AuditRecord` is at `AUDIT_RECORD_VERSION
  = 5`; the v5 `metadata` field is governance/observability data
  EXCLUDED from the `auditHash` pre-image, so it does not perturb
  tamper-evidence.)
- **Public functions widen additively or not at all.** New optional
  fields and new optional parameters are MINOR; required additions are
  MAJOR.

---

## 2. Extension categories

### 2.1 Adopter-side extension (always allowed)

Adopters extend the framework via the public composition surface
without framework involvement:

- **New Packs** under their own npm scope.
- **New basis codes** declared on `Pack.basisCodes` (Pack-local
  vocabulary; the kernel's `BASIS_CODES` is left untouched).
- **New guards** built with the L2 primitives or hand-written.
- **New refusal-message locales** via `RefusalMessages` injection.
- **New sinks** (audit, metrics, learning) by implementing the public
  interfaces.
- **New `ExplanationRegistry` entries** by merging adopter registries
  into `DEFAULT_EXPLANATION_REGISTRY`.
- **New telemetry consumers** by composing
  `createEcosystemTelemetry()` snapshots into their own pipelines.

No ADR, no framework review, no opt-in required. The framework's
public surface is the contract.

### 2.2 Framework-side additive extension (MINOR-bumpable)

The following can be extended additively in a MINOR release:

- **New optional fields** on `AuditRecord`, on Pack manifest, on Pack
  contract — when they do not break v1 readers.
- **New `BASIS_CODES.<category>.<CODE>` entries** within an existing
  category.
- **New `SEMCONV.*` attributes** — opt-in for consumers, additive
  across dashboards.
- **New `AdapterErrorCode` values.**
- **New `KillSwitchEventSource` values, new `ReplayFailureClass`
  values, new `OperationalIncidentClass` values** — these are closed
  but additive enums.
- **New Tier 1 / Tier 2 / Tier 3 analyzers** (`AJD-1NN`, `AJD-2NN`,
  `AJD-3NN`).
- **New conformance checks** (`AC-NNN`).
- **New CLI subcommands and CLI options.**
- **New codemods** in `@adjudicate/migrate`.

Each requires:

- A CHANGELOG entry naming the surface and the addition.
- A test that covers the new behaviour.
- A row in the freeze matrix.

No ADR is required unless the addition crosses an architectural
boundary (§3).

### 2.3 Framework-side architectural extension (ADR required)

Anything that:

- introduces a new public package;
- adds a new sink seam, a new ledger seam, a new bridge seam;
- adds a new persistence layer that other packages would reuse;
- introduces a new closed-enum dimension that adopters consume;
- changes the failure-mode of a load-bearing primitive;
- introduces a new framework-side default that adopters can disable
  but not override silently;

requires:

- A numbered ADR in `docs/architecture/adr/ADR-NNN-<slug>.md` covering
  motivation, design, rejected alternatives, and lifecycle.
- A freeze-matrix entry classifying the new surface (typically
  `experimental` for one MINOR cycle, then promoted on adopter
  feedback).
- A CHANGELOG entry referencing the ADR.

### 2.4 Framework-side breaking extension (MAJOR coordinated)

Any change that:

- breaks the closed `Decision` algebra;
- changes the wire format;
- alters the canonical-JSON hash recipe;
- removes a public export;
- narrows a previously-widened surface;
- changes the kernel's evaluation order (`state → taint → auth →
  business → default`);
- changes the fail-closed default;
- changes the determinism guarantee on `adjudicate()`;

is a MAJOR governed by `SEMVER_GOVERNANCE.md` §"Coordinated MAJOR
procedure". Multi-runtime implementations must be involved in the
release sequencing.

---

## 3. ADR criteria

An ADR is required when **any of these triggers** applies:

1. New public surface that adopters will compose against.
2. A change that touches replay determinism, audit immutability, or
   the freeze matrix's `frozen` tier.
3. A new cross-package dependency (e.g., a new package that publishes
   types another package consumes).
4. A new external-system dependency (a new database, a new transport).
5. A new opt-in default that changes adopter behaviour without explicit
   action.
6. A new policy that constrains adopters (e.g., a new conformance
   check that fails previously-passing Packs).

ADRs are numbered consecutively (`ADR-101` through `ADR-136` are
shipped). New ADRs append; deletions are MAJOR.

### 3.1 ADR template

```markdown
# ADR-NNN: <Title>

## Status

Proposed | Accepted | Rejected | Superseded by ADR-XXX | Deprecated

## Context

What pressure does this change relieve? Cite the operational evidence,
the adopter pull, or the invariant-level value justifying it.

## Decision

What changes. Be concrete: name the surface, the freeze tier, the
semver impact, the replay-classification impact.

## Rejected alternatives

What did we consider and decline. Each rejected option carries a
one-line "why declined" so the next ADR author does not re-litigate.

## Lifecycle

Experimental until: <event>
Frozen at: <version>
Deprecation horizon: <semver tier or calendar>

## Migration

If the change requires adopters to update code, name the codemod (or
state "no codemod — hand-edit per the cookbook entry").
```

---

## 4. Experimental-surface policy

New surfaces start as `experimental` in the freeze matrix unless the
ADR explicitly justifies a higher tier. Experimental means:

- Removal or rename is MINOR through the v1 line.
- Marked `@experimental` in JSDoc.
- Listed in [`docs/release/api-surface.md`](./api-surface.md) under its
  owning package's `## @adjudicate/<pkg>` section, with experimental
  status noted inline on the entry.
- The freeze matrix carries a `Tol.` column value of `by-evidence` or
  `scheduled`.

A surface is promoted from `experimental` to `frozen` when:

- At least one external adopter has used it in production.
- The shape has not changed in two consecutive MINOR releases.
- A test exists pinning the public shape (snapshot test or equivalent).
- The promotion is recorded in the freeze matrix and CHANGELOG.

If the surface fails to attract use within four MINOR releases, the
default is to deprecate (not promote silently). The ecosystem's
prediction quality depends on dormant experimental surfaces *not*
becoming permanent maintenance burden.

---

## 5. Deprecation lifecycle

Every deprecation goes through these stages:

1. **Marker landed.** The export keeps working; `@deprecated since
   vX.Y` JSDoc annotation appears; the freeze matrix tier flips to
   `deprecation-target`; the deprecations calendar (`deprecations.md`)
   gains a row with the removal target.
2. **Codemod ships.** Same release as the marker, in `@adjudicate/migrate`.
3. **Two MAJORs minimum elapse.** Per `semver.md` post-v1 window:
   removal is allowed only at the second MAJOR after the deprecation.
4. **Removal.** Identifier deleted in a MAJOR; the freeze matrix row
   flips to `removed` and is retained for migration discoverability.

No identifier is removed silently. Adopters who watch deprecations.md
get 24 months minimum of advance notice.

---

## 6. Compatibility-guarantee matrix

A high-level summary of what kind of change each surface admits.
Always defer to `V1_FREEZE_MATRIX.md` for per-surface authority.

| Surface group                  | Add field | Remove field | Add enum value | Remove enum value | Notes                                       |
|---|---|---|---|---|---|
| Wire-format types (`IntentEnvelope`, `AuditRecord`) | MAJOR     | MAJOR        | MAJOR          | MAJOR             | Wire-equivalence is the load-bearing claim. |
| Closed enums (`Decision.kind`, `Taint`)             | MAJOR     | MAJOR        | MAJOR          | MAJOR             | Coordinated MAJOR with multi-runtime co-release. |
| Additive enums (`BasisCategory.code`, `SEMCONV.*`)   | n/a       | n/a          | MINOR          | MAJOR             | Category-level changes are MAJOR.            |
| Function signatures (kernel, primitives, adapter-core) | MINOR (opt) | MAJOR    | n/a            | n/a               | Required parameters or return-shape changes are MAJOR. |
| Public interfaces (`Sink`, `Ledger`, `Bridge`)      | MINOR (opt) | MAJOR    | n/a            | n/a               | Adding required methods is MAJOR.            |
| CLI subcommands                                     | MINOR     | MAJOR        | n/a            | n/a               | Exit codes are part of the contract.         |
| Conformance checks (`AC-NNN`)                       | MINOR     | MINOR        | n/a            | n/a               | Removing a check that previously failed Packs is MAJOR. |
| Analyzer diagnostics (`AJD-NNN`)                    | MINOR     | MINOR        | n/a            | n/a               | Removal is MINOR because adopters silence by ID.|
| Pack manifest fields                                | MINOR (opt) | MAJOR    | MINOR          | MAJOR             | Required field add is MAJOR; quality-tier vocabulary additions are MINOR. |
| Telemetry snapshot schema (`EcosystemTelemetrySnapshot`)  | MINOR (opt) | MAJOR | n/a            | n/a               | Schema version pinned to `1` until coordinated.|

---

## 7. Examples — applied

### 7.1 "Add a new sink interface method"

Adding a *required* method to `AuditSink` is MAJOR (existing
implementations break). Adding an *optional* method (with documented
no-op default) is MINOR. Prefer the optional path; if mandatory, ship
the change at the next MAJOR with a clear migration guide.

### 7.2 "Expose `Decision.confidence`"

Rejected (cf. `PROJECT_STATUS_AND_NEXT_STEPS.md`). The closed Decision
algebra forbids field-level extensions. Adopters who want confidence
expose it as envelope metadata excluded from `intentHash`.

### 7.3 "Add a new SEMCONV attribute"

Adopt: add the `adjudicate.<scope>.<name>` key to `SEMCONV` in a MINOR;
update the freeze matrix §19 row; add an attribute-level test.

### 7.4 "Generalise the kill-switch to a feature-flag framework"

Decline. Out of scope per `PROJECT_STATUS_AND_NEXT_STEPS.md` and §10
of [`docs/pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md).
The kill switch is a fail-closed lever, not a routing layer.

### 7.5 "Add a YAML Pack DSL"

Decline. Permanently out of scope (§3 of
`PROJECT_STATUS_AND_NEXT_STEPS.md` *Explicitly rejected*). Pack
declarative content is `GuardMetadata`.

---

## 8. Review obligations

Every PR that touches the public surface ships with:

- A CHANGELOG entry naming the surface and the change category
  (additive | extension | deprecation | breaking).
- A freeze-matrix update if the change crosses a tier.
- A type-snapshot test or API-surface diff that pins the new shape.
- A `pnpm check:freeze-matrix` pass in CI.

Reviewers verify the freeze tier, the semver impact, and the
replay-classification impact. The `replay-classify` invariant is the
last gate: if existing audit rows would replay-classify differently,
the change is MAJOR regardless of how the diff looks.

---

## 9. Permanently out-of-scope

These directions are out-of-scope for the v1 line. Re-proposing them
requires an ADR explicitly addressing the rejection rationale.

- Edge-deployed adjudication / sovereign-AI compute / agent service mesh.
- Plugin container / dynamic runtime mutation.
- YAML or JSON Pack DSL.
- Post-hoc LLM output filter as a kernel feature.
- `Decision.metadata` / `Decision.confidence` field.
- Centralised Pack registry, hosted control plane, marketplace economics.
- MCP-server-style separate Pack registry.
- Generalised workflow engine / orchestration platform / agent runtime.

The framework is a deterministic governance substrate. Every accepted
extension preserves that identity.
