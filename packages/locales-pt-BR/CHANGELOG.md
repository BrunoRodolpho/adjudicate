# @adjudicate/locales-pt-BR

## 0.1.0

### Minor Changes

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
  - @adjudicate/core@1.0.0
