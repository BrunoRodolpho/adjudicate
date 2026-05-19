# Deprecation Policy

> How `@adjudicate/*` retires public API without breaking adopters. The
> short version: deprecations land in a minor with a JSDoc tag and a
> codemod, then survive at least two MAJORs (or 24 months post-`v1.0`,
> whichever is longer) before removal.

This document covers the contract. The current calendar — what is
deprecated and when it is removed — lives at the bottom and is updated
every release.

---

## Why we deprecate (instead of remove)

The asset adopters build on adjudicate is the policy bundle. Bundles
are designed to live for years; a Pack written against `v1.0` should
still build, lint, and pass conformance against `v1.4`. The kernel that
made a particular Decision at `v1.0` should still classify that decision
as `IDENTICAL` or `BASIS_ONLY` when replayed at `v1.4`.

Hard removal breaks both stories. Even when the new API is strictly
better, adopters who haven't migrated yet need a window — and we need
the codemod in their hands before they re-tool. Deprecation is the
mechanism for negotiating that window.

---

## Lifecycle

A public API moves through the following states:

```
   live  →  deprecated  →  removed
            (≥ 2 MAJORs)
```

### `live`

The default. The API appears in `api-surface.md`, has no `@deprecated`
JSDoc tag, and is covered by the semver contract.

### `deprecated`

A minor release marks the API `@deprecated` and:

1. Records the removal target in the calendar below.
2. Ships a codemod in `@adjudicate/migrate` (when the migration is
   mechanical — see "When a codemod is required" below).
3. Adds a CHANGELOG entry pointing at the codemod and the calendar.
4. The TypeScript declaration carries the `@deprecated` tag with the
   replacement guidance:

   ```ts
   /**
    * @deprecated v0.5 — see `withMetadata`. Removal: v2.0.
    * Codemod: `adjudicate-migrate name-guard-to-with-metadata`.
    */
   export function nameGuard<...>(...): ...;
   ```

Deprecated APIs continue to **function unchanged**. Tests against them
keep passing. The kernel's invariants apply to deprecated surfaces
exactly as they apply to live ones.

### `removed`

A MAJOR release deletes the API. The deletion lands no earlier than the
calendar's removal target. CHANGELOG, migration guide, and the
deprecation calendar all reflect the removal.

Removal is irreversible — once an identifier is gone, re-adding it
later would be a NEW addition (back-compatible, but the deprecation
clock starts fresh).

---

## When a codemod is required

A codemod ships alongside the deprecation marker if the migration is:

- **Syntactic** (rename, signature reshuffle, import path change).
- **Deterministic** (no runtime data needed to decide the rewrite).
- **Idempotent** (re-running against migrated source is a no-op).

If a migration needs human judgement (e.g., "review whether this Pack's
business logic still makes sense with the new guard ordering"), we do
NOT ship a codemod — we ship a migration guide. The Pack author reads
the guide and makes the call.

Examples of codemod-eligible deprecations:

- `nameGuard("x", g)` → `withMetadata(g, { name: "x" })` — purely
  mechanical, ships in v0.4 with the `name-guard-to-with-metadata`
  codemod.
- Renaming an exported identifier (e.g., a hypothetical
  `createPolicyBundle` → `definePack`) — codemod rewrites both the
  import and the call site.

Examples of human-only deprecations:

- A change to taint policy semantics that affects which intents reach
  which guards. Replay coverage tells the adopter where the impact is,
  but the resolution is a policy decision.

---

## Stability tiers

Within "live", APIs further break down by how aggressively we'd ever
consider deprecating them.

| Tier | Surfaces | Deprecation horizon |
|---|---|---|
| **Headline** | `IntentEnvelope`, `Decision`, `PolicyBundle`, `CapabilityPlanner`, `AuditSink` | ≥ 36 months post-`v1.0`; deprecation requires an ADR. |
| **Pack-author** | Guard factories, taint helpers, basis codes, audit/learning sinks | Standard: 24 months post-`v1.0`. |
| **Operator** | Console sinks, CLI commands, ESLint rules, runbooks | Standard: 12 months from deprecation. |
| **Experimental** | Anything tagged `@experimental` in JSDoc | None — may move in any minor. |

Tier inclusion is documented per-package in
[`docs/release/api-surface.md`](./api-surface.md). When a deprecation
lands, the calendar records both the tier and the chosen removal target.

---

## Deprecation calendar

> Every deprecated API in the published `@adjudicate/*` packages.
> Updated on every release that adds or resolves an entry.

### Active deprecations

| API | Package | Deprecated | Tier | Removal target | Codemod |
|---|---|---|---|---|---|
| `nameGuard(name, guard)` | `@adjudicate/core/kernel` | v0.4.0 | Pack-author | v2.0.0 | `adjudicate-migrate name-guard-to-with-metadata` |
| `AuditPlanSnapshot.forbiddenConcepts` | `@adjudicate/core` (audit) | v0.1.x | Pack-author | v1.0.0 | none (audit-row back-compat only) |

### Removed

> Empty until the first MAJOR. Records are kept once a removal lands so
> adopters can search "where did this identifier go?" historically.

| API | Package | Deprecated in | Removed in | Migration |
|---|---|---|---|---|
| _(none yet)_ | | | | |

---

## How to add a deprecation

1. Open an ADR if the deprecation affects a headline surface. Otherwise,
   the package's CHANGELOG entry suffices.
2. Add `@deprecated` JSDoc with:
   - The version that landed the deprecation
   - A pointer to the replacement
   - The removal target
   - The codemod id (when applicable)
3. Add a row to the calendar above.
4. Ship a codemod in `@adjudicate/migrate` if the migration is
   mechanical. Codemods are tested against the deprecated API's
   call shape using ts-morph virtual file systems.
5. Add a CHANGELOG.md entry in the package recording the deprecation.
6. Update `docs/release/api-surface.md` to mark the surface as
   `(deprecated)` next to its name.

---

## How to remove a deprecation

Only at a MAJOR bump and only after the calendar's removal target has
arrived. The steps:

1. Confirm every published Pack and every internal adopter has migrated
   off the surface. The CI matrix that runs each Pack's tests against
   the current kernel catches stragglers.
2. Delete the identifier and its tests.
3. Move the calendar row from "Active" to "Removed" with the version
   that performed the removal.
4. Cut the MAJOR. Adopters who haven't migrated yet pin to the previous
   MAJOR; the codemod is still in `@adjudicate/migrate` and they can
   re-run it before bumping.

---

## What a deprecation does NOT mean

- **It does not break replay.** Audit rows produced when the API was
  live continue to replay against the kernel for the full back-compat
  window. Removal is allowed only when the kernel can still load the
  oldest supported audit schema version.
- **It does not change basis codes.** A guard whose factory is
  deprecated still emits the same basis codes it emitted before; the
  codemod adjusts the call shape, not the Decision the guard produces.
- **It does not stack-pull dependent surfaces.** Marking `nameGuard`
  deprecated does not deprecate `withMetadata` — the replacement is
  live and the deprecation simply directs traffic onto it.
