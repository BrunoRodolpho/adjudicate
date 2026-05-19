# @adjudicate/anthropic

## 0.1.0

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

- M1 — Foundation + Safety (v0.2.0)

  ## Kernel hardening

  ### Guard exception isolation (ADR-106)

  The kernel now wraps every guard invocation in `try/catch`. Throwing guards no longer propagate to the adopter — instead, the kernel converts the throw into a `SECURITY` REFUSE with the new `kernel.GUARD_PANIC` basis code, preserving the audit trail through the same path as any other refusal.

  The `BASIS_CODES.kernel` category is new (adds `GUARD_PANIC`). Adopters who depended on guards throwing should set `kernelEnforcement.allowGuardExceptions: true` for a one-cycle migration window.

  ### Resume-hash verification

  `ParkedEnvelope` gains optional `version`, `nonce`, `taint`, `actorPrincipal` fields. When present, `resumeDeferredIntent` re-derives the `intentHash` via `sha256Canonical` and asserts byte-equality with the stored value — detecting blob tampering between park and resume.

  New: `verifyParkedEnvelopeHash(parked) → ParkVerificationResult`. New: `verifyHash: "strict" | "warn" | "off"` option on `resumeDeferredIntent` (default `"warn"`).

  The Anthropic adapter now parks full envelope fields at DEFER time and verifies on resume/confirm.

  ## Externalized refusal strings (ADR-107)

  Kernel inline strings switched from Brazilian Portuguese to English defaults. New `@adjudicate/core/refusal-messages.ts` exports the `RefusalMessages` interface and the `localizeDecision(decision, messages)` helper.

  New package: `@adjudicate/locales-pt-BR` provides `portugueseRefusalMessages` for adopters who want pt-BR strings. Use at presentation time:

  ```ts
  import { localizeDecision } from "@adjudicate/core";
  import { portugueseRefusalMessages } from "@adjudicate/locales-pt-BR";
  const userVisible = localizeDecision(decision, portugueseRefusalMessages);
  ```

  ## Admin SDK

  `BasisCategorySchema` adds `"kernel"` to the closed Zod enum to match the new kernel category.

  ## Performance characterization

  New `bench/` workspace publishes p50/p99 microbenchmarks. See `docs/perf/v0.2-baseline.md`. All measured numbers have >200× headroom against published SLOs.

### Patch Changes

- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [92858a0]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/audit@1.0.0
  - @adjudicate/core@1.0.0
  - @adjudicate/runtime@0.1.0
