# @adjudicate/admin-sdk

## 1.0.0

### Minor Changes

- 92858a0: Deprecate `Plan.forbiddenConcepts` and `AuditPlanSnapshot.forbiddenConcepts`. Resolves enhancement-todo P1-3.

  The field made a structural promise the kernel did not deliver. `Plan.visibleReadTools` and `Plan.allowedIntents` are enforced by the bridge — out-of-plan tool/intent names are refused before the kernel sees them. `Plan.forbiddenConcepts` was rendered into the system prompt as a hint to the model and never enforced; a motivated user could get the model to emit a forbidden phrase and nothing in the framework caught it. The asymmetry was misleading on a security boundary — adopters reading the type believed the framework enforced it.

  Per the synthesis at `docs/research/enhancement-todo.md` (P1-3) and SA3's Validation 3, the discipline is "the worst place to be on a security boundary is making promises you cannot keep." The field is now `@deprecated` across the three surfaces it touched:
  - `@adjudicate/core` — `Plan.forbiddenConcepts`, `AuditPlanSnapshot.forbiddenConcepts`
  - `@adjudicate/anthropic` — `renderer-anthropic.ts` injects a deprecation comment near the rendering site
  - `@adjudicate/admin-sdk` — `AuditPlanSnapshotSchema.forbiddenConcepts`

  **Behavior unchanged in v0.1.x.** Existing callers may continue to populate the field; the renderer continues to inject the phrases into the system prompt; audit records continue to record the value. The `@deprecated` JSDoc surfaces in adopter IDEs.

  **Scheduled for removal at v1.0.** Adopters who need post-hoc content moderation should run their own filter on assistant text before surfacing it — that is a content-moderation concern outside this framework's scope (per ADR-105's discipline around what the kernel does and does not own). The anthropic adapter README's "L2 rework callouts" table gains a row documenting the seam.

  Tests, schemas, and audit-postgres serialization are unchanged — the field's wire shape and presence remain identical for back-compat with stored records.

### Patch Changes

- Updated dependencies [d8c11b7]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [92858a0]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/core@1.0.0
