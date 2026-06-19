# ADR-116 — Post-v1 extension discipline

- **Status:** Accepted
- **Date:** 2026-05 (v1.0-RC milestone; original ADR carried no explicit date)
- **Related:** `docs/release/EXTENSION_POLICY.md`, `docs/release/SEMVER_GOVERNANCE.md`, `docs/pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md`

## Context

The framework has shipped the v1.0 release candidate. Architecture,
wire format, semantic conventions, and provider-neutral contracts are
frozen. The next phase is *operational*: ecosystem growth, replay
trust, audit longevity, semver credibility — measured over years, not
sprints.

The risk profile is now different from the pre-v1 risk profile.
Pre-v1, the largest risk was being wrong about a load-bearing abstract-
ion. Post-v1, the largest risk is **becoming too large to remain
trustworthy**: framework bloat, speculative extensibility, enterprise-
ergonomic features that lock the substrate to one operating model,
and silent maintenance burden that erodes the closed-vocabulary
guarantees the entire ecosystem depends on.

We need an explicit rule for evaluating new work that:

1. distinguishes additions justified by *evidence* from additions
   justified by *aesthetics*;
2. preserves the closed enums, the deterministic kernel, and the
   adopter-side composition surface;
3. keeps the framework's maintenance burden bounded as adoption grows.

## Decision

We adopt the **extension discipline** codified in
`docs/release/EXTENSION_POLICY.md`. Four operating rules:

### 1. Evidence before code

A non-trivial addition lands only when at least one of the following
is true:

- **Operational evidence.** A real adopter (internal or external) ran
  into the gap and the workaround is documented.
- **Adopter pull.** A specific adopter has committed to consuming the
  surface and named the use case.
- **Ecosystem demand.** The gap exists across multiple adopters and
  the absence prevents an ecosystem property from being achievable
  (e.g., Pack signing without it would have been impossible).
- **Invariant-level value.** The addition strengthens one of the load-
  bearing invariants (replay determinism, audit integrity, semver
  credibility) directly.

Speculative extensibility ("we *might* need this") is declined. The
maintenance burden of every shipped surface compounds.

### 2. Closed vocabularies stay closed

The closed enums in `docs/specs/MULTIRUNTIME_CONFORMANCE.md` §4 are
load-bearing across the ecosystem. Widening them is a MAJOR
coordinated with multi-runtime co-release per
`SEMVER_GOVERNANCE.md`. There is no per-package shortcut.

This rule binds especially (counts are code-true as of this ADR;
`@adjudicate/core` and `@adjudicate/audit` are the source of truth):
- `Decision.kind` (six values, no metadata bag) — `core/decision.ts`;
- `Taint` (three lattice points) — `core/taint.ts`;
- `RefusalKind` (four categories: SECURITY, BUSINESS_RULE, AUTH, STATE)
  — `core/refusal.ts`;
- `BasisCategory` (eleven categories) — `core/basis-codes.ts`;
- `ReplayMismatchKind` (three axes) — `core/replay-classify.ts`;
- `IntegrityFailure.kind` (two failure modes: AUDIT_HASH_TAMPERED,
  INTENT_HASH_MISMATCH) — `audit/replay-integrity.ts`;
- `IntentActor.principal` (three principals: llm, user, system) —
  `core/envelope.ts`.

### 3. Wire formats are append-only

`IntentEnvelope` and `AuditRecord` carry the wire-format contract. The
cut versions in the freeze matrix were `IntentEnvelope v2` and
`AuditRecord v4`; `AuditRecord` has since advanced to its current head
`v5` (`AUDIT_RECORD_VERSION = 5`, `AuditRecordVersion = 1|2|3|4|5` in
`core/audit.ts`) — proof that this rule works, not an exception to it:
each AuditRecord version since v1 added only optional fields under the
same append-only discipline. Field additions are MINOR only when the
new field is optional, all existing readers ignore it without errors,
and the canonical-JSON hash recipe is unchanged. Anything else is MAJOR
with a new version published alongside golden vectors and a replay shim.

### 4. ADR gate on architectural change

Any change satisfying `EXTENSION_POLICY.md` §3.1 ships with a numbered
ADR. The ADR template (§3.1) requires explicit motivation, rejected
alternatives, lifecycle, and migration guidance. ADRs are the durable
record of *why* the framework looks the way it does.

## Permanent guardrails

The framework will not, within the v1 line:

- Introduce a hosted control plane that adopters depend on.
- Operate a Pack marketplace.
- Issue or distribute signing keys for Pack authors.
- Add a YAML/JSON Pack DSL.
- Add a runtime mutation surface (e.g., dynamic guard injection).
- Generalise into a workflow engine, agent runtime, or routing layer.
- Add `Decision.metadata` or `Decision.confidence` as fields.
- Add `record.explain()` as a method on `AuditRecord`.
- Phone home telemetry.
- Reintroduce `Plan.forbiddenConcepts` (removed in v0.5).

These are not aesthetic preferences — each violates a property
documented in §1 of `ECOSYSTEM_HEALTH_MODEL.md` or breaks the closed-
algebra discipline in §2 of this ADR.

## Rejected alternatives

### A. "Annual feature drop" model

Reject. Reduces predictability and concentrates risk into a single
release. The framework's value is *continuous adopter trust*; a
quarterly drop model (small ADR-gated MINORs, yearly MAJOR with
codemods) preserves that.

### B. "Plugin-host" framework reshape

Reject. A plugin host that mutates the kernel surface at runtime would
break the determinism guarantee. The composition surface adopters need
is already available via Packs + sinks + bridges; nothing about post-
v1 evolution justifies the upgrade.

### C. "Marketplace / hosted registry"

Reject. Centralises the ecosystem, violates `ECOSYSTEM_HEALTH_MODEL.md`
§§1.3, 2, and 10. The `validatePackManifest` + `verifyPackTrust` +
npm-tag convention is the decentralised mechanism the framework keeps
stable.

### D. "Allow Pack-author-defined closed enums"

Reject. Per-Pack closed enums fragment the ecosystem — adopters who
ingest multiple Packs lose the cross-Pack vocabulary guarantee. Pack
authors get `Pack.basisCodes` (additive Pack-local vocabulary) and
`GuardMetadata` (declarative annotation); both fit additive evolution.

## Lifecycle

- **Status**: Accepted at v1.0 cut.
- **Re-evaluation**: Each MAJOR. The "permanent guardrails" section is
  the durable contract; the four operating rules can be tightened in
  a MAJOR but cannot be relaxed without explicit ecosystem evidence.

## Migration

No migration required — the discipline applies prospectively to all
post-v1 work. Existing surfaces remain at their freeze-matrix tier.
