# ADR-144 — Documentation-as-truth reconciliation discipline

- **Status:** Accepted
- **Date:** 2026-06-19
- **Scope:** Architecture & security documentation surface (`AI_CONTEXT.md`,
  `docs/security/threat-model.md`, `docs/security/security-review-checklist.md`,
  `docs/concepts.md`, `SECURITY.md`, `docs/architecture/adr/`,
  `docs/architecture/decisions.md`). **No kernel/executor/audit code path.**
- **Supersedes:** none
- **Related:** ADR-104 (intentHash recipe), ADR-111 (`policyVersion`/`kernelVersion`),
  ADR-143 (header convention this directory follows), `docs/concepts.md §9`
  (closed-enum guard-order invariant)

## Context

By the end of the v1.x cycle the documentation surface had drifted out of
agreement with the as-built kernel in several concrete, citable ways. The
drift was not cosmetic — each item described a *security-relevant behavior*
incorrectly, which is the most dangerous class of documentation bug for a
framework whose entire value proposition is a small set of provable
invariants:

1. **REWRITE was described as "re-adjudicate the sanitized envelope"** in a
   terse line, then (pre-011) as a *direct execute with no re-adjudication*.
   Neither matched the post-011 as-built path. In code today a kernel
   `REWRITE` is re-entered through the **pure** kernel once: the rewritten
   envelope's `intentHash` is re-derived fail-closed and the full
   `state → taint → auth → business → default` order re-runs against the
   *executed* bytes; only a **second-pass `EXECUTE`** lets the rewritten
   envelope reach the executor
   (`packages/core/src/kernel/adjudicate-and-audit.ts`, the
   "REWRITE re-adjudication (011/T2)" block;
   `packages/adapter-core/src/decisions.ts` `runExecute`). The behavior is
   pinned by `packages/adapter-core/tests/decisions.test.ts`
   (`REWRITE → invokes executor with rewritten envelope`).

2. **The R2 threat ("kernel decided X but the system did Y") claimed
   `policyVersion` was bound into every `AuditRecord`.** It is not
   unconditional: `buildAuditRecord` includes `policyVersion` /
   `kernelVersion` **only when the host supplies them**
   (`packages/core/src/audit.ts`, the
   `...(input.policyVersion !== undefined ? { policyVersion } : {})` spread);
   both `adjudicateAndAudit` call sites thread them host-conditionally
   (ADR-111 / plan 091). `AUDIT_RECORD_VERSION` is **5**.

3. **The E3 threat ("resume cannot upgrade effective taint") was a blanket
   claim** that did not hold for the DEFER `resume()` path, which
   deliberately rebuilds a *fresh* envelope with `actor.principal: "system"`
   and `taint: "TRUSTED"` (`packages/adapter-core/src/loop.ts`), blessed by
   `packages/adapter-core/tests/resume.test.ts` (`principal === "system"`,
   `taint === "TRUSTED"`, `intentHash` differs from the parked one). The
   taint-preservation guarantee holds for the `confirm()` path and the
   approval-engine `resolve()` path (which routes into `confirm()`,
   `packages/approval-engine/src/engine.ts`), not for DEFER resume.

4. **Two dangling `docs/concepts.md §9.5` cross-references** in the security
   docs pointed at a section that does not exist; the closed-enum
   `GuardPhase` invariant lives under `docs/concepts.md §9` (heading
   "Invariant to preserve through any refactor"), which is the citation
   `packages/core/tests/kernel/invariants/guard-order.test.ts` already uses.

5. **A stale ADR index range** ("ADR-101..ADR-136") in
   `docs/architecture/decisions.md` while the directory ran to ADR-143.

6. **No ADR scaffold** (template / README / index) existed, and 9 early ADRs
   (ADR-105..ADR-112, ADR-116) carried their `Status` in a non-canonical
   shape inconsistent with the de-facto `ADR-143` convention.

Items 1–5 were corrected by plan 121; item 6 and this ADR by plan 122.

## Decision

**Documentation follows code, anchored to `file:line` citations, and is gated
by the suites that pin the documented behavior.**

- **Code wins.** When a doc passage and the code disagree, the code is the
  source of truth and the prose is corrected — the prose is never "fixed" by
  changing the kernel. (This is the inverse of a design doc that leads the
  code; the kernel's invariants are constitutional and the docs trail them.)
- **Cite the anchor.** Security-relevant prose names the exact symbol and
  `file:line` (or test) that establishes the behavior, so a reviewer can
  re-verify it and so drift surfaces when that anchor moves.
- **Gate on the pinning suites.** A documentation plan touching package
  behavior re-runs the suites that pin that behavior
  (`decisions.test.ts`, `resume.test.ts`, `guard-order.test.ts`, the package
  `test`/`build` gates) so that a doc claim cannot silently outlive the code
  it describes.
- **One canonical ADR shape.** New ADRs copy the `ADR-143` header
  (`# ADR-NNN — <title>` + `Status` / `Date` / `Scope` / `Supersedes` /
  `Related` bullets + `## Context` / `## Decision` / `## Why this shape`); the
  directory's `README.md` carries the template + authoritative index.

## Why this shape

- **Replayability over explainability is the compliance thesis** (index §D):
  the docs' job is to make the *real* invariants addressable, not to sell an
  idealized model. A doc that overstates a mitigation (R2 binding, E3 taint
  floor) is worse than silence — it invites an adopter to skip a control the
  framework does not actually provide.
- **`file:line` anchoring + suite-gating is the cheapest drift alarm.** It
  converts "is this doc still true?" from a manual re-read into a test run.
- **A pure-documentation plan touches no kernel code**, so the constitutional
  invariants (closed 6-outcome algebra, guard order, monotonicity,
  fail-closed, kernel purity, the `intentHash` recipe of ADR-104) are
  preserved by construction; the verify gate exists only to prove the
  documented packages still build and pass their existing suites unchanged.

## Invariants preserved

This ADR and the reconciliation it governs are prose-only. The closed
6-outcome `Decision` algebra, the `state → taint → auth → business → default`
guard order, the monotonicity ceiling, fail-closed default, kernel purity, and
the ADR-104 `intentHash` recipe are documented exactly as the kernel enforces
them and are not altered.

## Alternatives considered

- **Leave the drift and rely on reviewers to notice.** Rejected — the drift
  had already survived multiple cycles; the items were security-relevant.
- **Delete the threat entries the code under-delivers on (R2/E3).** Rejected —
  scoping the claim to the truth (host-conditional binding; path-specific
  taint floor) is more useful to an assessor than removing the entry.

## Lifecycle

The reconciled passages are pinned by the existing suites listed above. When
plan 091's `policyVersion` becomes host-default-populated, the R2 prose is
re-tightened (its anchor in `audit.ts` makes the trigger explicit).
