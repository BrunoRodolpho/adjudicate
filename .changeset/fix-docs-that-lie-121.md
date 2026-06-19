---
"@adjudicate/adapter-core": patch
"@adjudicate/core": patch
"@adjudicate/runtime": patch
"@adjudicate/approval-engine": patch
"@adjudicate/canonical": patch
---

docs(security,architecture): 121 — fix the docs-that-lie so the prose contracts match the as-built kernel (REWRITE, R2/policyVersion, E3/DEFER resume, the dangling §9.5 anchors, the stale ADR index).

Six documentation passages asserted behaviors the code does not (or no longer) implements, plus two dangling cross-references and one stale ADR-index range. This is a documentation-correctness pass over existing files — NO kernel, executor, or audit code is touched, and every constitutional invariant (§C monotonicity, §D kernel-purity, the closed 6-outcome Decision algebra, the `state→taint→auth→business→default` guard order, the `intentHash` recipe) is preserved by construction. The §5 gates run the unchanged test suites to confirm the rewritten references no longer contradict a green tree.

- **REWRITE (T1, `AI_CONTEXT.md`).** The flow-diagram line read "REWRITE → re-adjudicate the sanitized envelope". As-built today (plan 011 landed): the kernel re-runs the FULL guard order on the rewritten envelope (a single bounded second pass, intentHash re-derived fail-closed) and only flows the rewritten bytes to the executor on a second-pass EXECUTE; otherwise the second-pass decision stands and the rewrite never executes. Line rewritten to that two-stage truth (grounded in `packages/core/src/kernel/adjudicate-and-audit.ts` step 2b and `packages/adapter-core/src/decisions.ts`). Pinned by `adapter-core/tests/decisions.test.ts` (REWRITE → executor runs the rewritten bytes) — left UNCHANGED.

- **R2 / pack drift at replay (T2, `docs/security/threat-model.md`).** R2, the cross-cutting replay-determinism note, and the mitigation matrix asserted `policyVersion` as an unconditional replay join key. As-built today (plan 091 landed): `buildAuditRecord` and BOTH `adjudicateAndAudit` call sites (kill-switch + main) thread `policyVersion` / `kernelVersion` onto the record ONLY when the host supplies `deps.policyVersion` / `deps.kernelVersion` (`packages/core/src/audit.ts` emits each field only when defined). Rewritten to state the binding is host-conditional, not unconditional; matrix status changed from "Mitigated" to "Mitigated when host supplies `policyVersion`".

- **E3 / resume taint floor (T3, `docs/security/threat-model.md`).** E3 claimed a blanket "resume cannot upgrade effective taint without going through `canPropose()`". FALSE as a blanket: the DEFER `resume()` path builds a FRESH envelope with `actor.principal:"system"` / `taint:"TRUSTED"` (`packages/adapter-core/src/loop.ts`), an INTENTIONAL elevation, while the CONFIRMATION `confirm()` path and the approval-engine `resolve()` path (which routes into `confirm()`, `packages/approval-engine/src/engine.ts`) DO preserve the original taint. Rewritten to scope the guarantee to the taint-preserving paths and document the DEFER elevation explicitly (with the runtime `defer-resume.ts` constructing no envelope, and SoD controls tracked under ADR-143). Pinned by `adapter-core/tests/resume.test.ts` (resume yields `principal==='system'`, `taint==='TRUSTED'`, differing `intentHash`) — left UNCHANGED.

- **Dangling `§9.5` anchors (T4/T5, `docs/security/threat-model.md` + `docs/security/security-review-checklist.md`).** Both cited a non-existent `docs/concepts.md §9.5`; the guard-ordering closed-enum invariant actually lives under `## 9` at the stable heading "Invariant to preserve through any refactor" (the `GuardPhase` closed enum). Both references re-pointed to bare §9 + the stable heading text (per §7 risk mitigation, not a numbered subsection). `grep -rn "§9.5" docs/` now returns zero.

- **Stale ADR-index range (T6, `docs/architecture/decisions.md`).** The index line claimed the directory runs `ADR-101..ADR-136`; it actually runs `ADR-101..ADR-143` (highest `ADR-143-approval-engine-governance.md`). Range corrected; the §4 representative-ADR table (through ADR-116) is NOT a lie and was left untouched.
