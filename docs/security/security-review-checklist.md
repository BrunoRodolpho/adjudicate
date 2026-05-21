# Security Review Checklist

**Audience:** Pack authors + framework contributors proposing
security-labeled changes.
**Use:** Run through this checklist before opening any PR that touches
the kernel, audit, taint, runtime, or admin-sdk surfaces.

> A change is "security-labeled" if it touches
> `packages/core/src/kernel/**`, `packages/core/src/llm/**`, the
> `Taint` / `BASIS_CODES` / `Decision` / `IntentEnvelope` /
> `AuditRecord` types, any audit sink, the runtime defer/resume
> machinery, the admin-sdk, or any guard factory in
> `@adjudicate/primitives`. If unsure, label it.

---

## 1. Before opening the PR — invariant check

Confirm none of the load-bearing invariants below are broken. Each is
referenced in `docs/concepts.md`, `docs/architecture/decisions.md`,
or `docs/security/threat-model.md`.

- [ ] **Kernel determinism preserved.** `adjudicate(envelope, state,
      policy)` is sync, total, pure. No `Date.now()`, no
      `Math.random()`, no I/O. (ADR-101, ADR-106.)
- [ ] **LLM authority unchanged.** Tools typed `READ_ONLY` vs
      `MUTATING`; `CapabilityPlanner` still filters MUTATING from the
      LLM's visible tool list. LLM emits envelopes only.
- [ ] **Decision algebra closed.** Six kinds: `EXECUTE`, `REFUSE`,
      `REQUEST_CONFIRMATION`, `ESCALATE`, `REWRITE`, `DEFER`. No
      seventh; no escape-hatch metadata bag.
- [ ] **Guard order preserved.** `state → taint → auth → business`.
      No reorder for any reason. (ADR-104, `docs/concepts.md §9.5`.)
- [ ] **Fail-closed defaults preserved.** `multiSink` strict by
      default; `policy.default = "EXECUTE"` warned by AJD-106;
      kill-switch absence means closed in distributed paths.
      (ADR-102, ADR-109.)
- [ ] **Basis vocabulary closed.** Codes drawn from
      `BASIS_CODES[category]` ∪ `Pack.basisCodes`. No free strings.
      (ADR-105, AC-004 via ADR-110.)
- [ ] **One audit emit per `adjudicateAndAudit` call.** Do not
      introduce branches that skip or duplicate emit. (ADR-101.)

If any invariant is intentionally being relaxed, *stop* — the change
needs an ADR (§6).

---

## 2. Wire format change check

Adding, removing, or modifying fields on any of these is a wire-format
change: `IntentEnvelope<K, P>`, `Decision`, `AuditRecord`, `Refusal`,
`Basis`, `IntentActor`, `Taint`, `BASIS_CODES`, `GuardMetadata` /
`GuardDescription`.

- [ ] If wire format changed → **ADR required**.
- [ ] If `AuditRecord` gained a field → field is OPTIONAL; Postgres
      migration is NULLABLE-additive; `auditHash` recipe excludes
      post-hoc fields (e.g., `signature`); `AuditRecordSchema` in
      admin-sdk updated; version discriminator bumped if appropriate.
- [ ] If `Decision` algebra changed → ADR required; every adapter,
      Pack, and analyzer rule updated.
- [ ] If `BASIS_CODES` gained a category or code → additive only,
      immutable once released (ADR-105 governance).
- [ ] If `GuardDescription` gained a variant → ADR-105 rules 1–10
      followed (closed-for-guarantees, semi-open-for-tolerance,
      additive, discriminated by `kind`).

Reviewers reject wire-format changes that ship without an ADR.

---

## 3. Taint change check

If your change touches `Taint`, `canPropose()`, `Pack.taint`, the
auth-after-taint reorder, or `IntentEnvelope.taint` mutability:

- [ ] An **additional reviewer** (not the author, not the standard
      reviewer) signed off.
- [ ] The reviewer confirmed: "this does not let an UNTRUSTED
      envelope reach EXECUTE on a TRUSTED-only kind."
- [ ] Taint-floor property test (`taint-floor.property.test.ts` or
      equivalent) still passes without modification, OR the
      modification is itself justified in the PR description.
- [ ] Reorder invariant preserved: taint check happens before any
      auth-guard side effect.

Why an extra reviewer: the framework's strongest single correctness
claim is "UNTRUSTED inputs never reach EXECUTE on taint-protected
kinds." Breaking it silently is the most expensive bug class.

---

## 4. Audit emission check

If your change touches `packages/core/src/audit.ts`,
`packages/core/src/kernel/adjudicate-and-audit.ts`, or any sink in
`@adjudicate/audit*`:

- [ ] "Exactly one emit per call" invariant preserved. No new branches
      that skip or double-emit.
- [ ] New failure modes call `recordSinkFailure` with structured
      `errorClass`; failure surfaces in metrics (ADR-102 pattern).
- [ ] New sink shapes document their fail-closed-vs-lossy semantics.
- [ ] **Replay harness passes** against a golden corpus of historical
      records — same `(envelope, state, policy)` produces same
      Decision kind and same basis category:code.
- [ ] `auditHash` preserved: `verifyAuditRecord` still reports
      `verified: true` on records the modified path produced.
- [ ] If `AuditRecord` schema bumped → migrations are
      NULLABLE-additive; no backfill required.

Why the replay harness must pass: ADR-101's audit emission is the
framework's strongest durability primitive. Replay drift means the
framework changed semantics in a way the existing audit corpus does
not reflect.

---

## 5. Adapter change check

For changes to `@adjudicate/anthropic` (and future adapters):

- [ ] **Taint set by the adapter**, not derived from LLM JSON.
- [ ] **`actor` set from a validated session**, not from LLM JSON.
- [ ] **`nonce` adapter-generated** (`crypto.randomUUID()` first
      attempt; retries pass the same nonce — ADR-104).
- [ ] **Adapter-conformance suite passes** (per
      `packages/anthropic/tests/`; the harness verifies envelope +
      taint + actor are framework-stamped, not LLM-controlled).
- [ ] New tool-call shapes still respect the `CapabilityPlanner`
      `READ_ONLY` / `MUTATING` partition.
- [ ] Schema validation runs **before** `adjudicateAndAudit` —
      malformed envelopes rejected at the adapter boundary, not in
      the kernel.

---

## 6. Threat re-analysis

After implementing, re-read `docs/security/threat-model.md`:

- [ ] Identify which package's STRIDE section your change touches.
- [ ] For each threat in that section: does the change make it more
      likely or harder to mitigate?
- [ ] For each mitigation: is it still in force after the change?
- [ ] New threat introduced → add it to the threat model; PR
      description includes the threat-model diff inline.
- [ ] Existing mitigation weakened → compensating mitigation or ADR
      justifying the relaxation.

**ADR required when:** wire-format change (§2); change to closed
enums (`Decision.kind`, `Taint`, `BASIS_CODES`,
`GuardDescription.kind`); change to guard ordering invariant; change
to fail-closed default; change to one-emit invariant; change to
kernel purity (introducing I/O, time, or entropy); change to per-tenant
isolation semantics in `RuntimeContext`; new package in `@adjudicate/*`.

When in doubt: write the ADR.

---

## 7. Verification

Before requesting review:

- [ ] `pnpm lint` clean.
- [ ] `pnpm typecheck` clean (no `any`, no `@ts-ignore` without a
      justification comment).
- [ ] `pnpm test` clean — property + unit + integration.
- [ ] **Replay harness** passes against the golden corpus (if touching
      audit, taint, or guard ordering).
- [ ] **Conformance suite** passes against all first-party Packs
      (e.g., `pnpm -F @adjudicate/pack-payments-pix conformance`).
- [ ] If adapter changed, **adapter-conformance suite** passes.
- [ ] If analyze rules changed, `pnpm -F @adjudicate/analyze test`
      clean and SARIF golden output updated.
- [ ] CHANGELOG entry added with a 1-sentence summary + ADR reference
      if applicable.
- [ ] New public surface → `package.json` `exports` updated and a
      README update lands in the same PR.

---

## 8. Pack-author quick reference

- [ ] `Pack.taint.minimumFor(kind)` declared for every intent kind.
- [ ] `Pack.signals` declared if the Pack uses DEFER (AJD-102).
- [ ] `Pack.basisCodes` declared for any non-built-in codes (AJD-103
      + AC-004).
- [ ] Every guard wrapped with `withMetadata` or `nameGuard` so the
      analyzer (ADR-109) and trace (ADR-105) can identify it.
- [ ] REWRITE guards declare `mutatesPayloadFields` (AJD-104; ADR-105
      + ADR-108).
- [ ] `policy.default = "REFUSE"` unless the Pack's nature genuinely
      requires fail-open (AJD-106).
- [ ] No secrets in guard error messages or basis details (I1, I2 in
      threat model).
- [ ] No regexes vulnerable to catastrophic backtracking (D2).
- [ ] `pnpm -F your-pack test` clean.
- [ ] `pnpm -F your-pack conformance` clean (when v0.5 wires it into
      `pack lint --strict`).
- [ ] `pnpm dlx @adjudicate/cli analyze --pack . --format text
      --strict` clean.

---

## 9. After merge

- [ ] If the change shipped an ADR, link the ADR from the PR
      description and from `docs/architecture/decisions.md` if it is
      load-bearing.
- [ ] If new threat or mitigation introduced,
      `docs/security/threat-model.md` updated in the same PR.
- [ ] If touched a control mapped in
      `docs/compliance/soc2-mapping.md`, review for stale claims.
- [ ] If touched public API, CHANGELOG entry exists with a migration
      snippet (when migration is needed).

---

## 10. Triage cheat sheet

| Symptom | Likely cause | First-look location |
|---|---|---|
| Replay drift | Guard ordering or basis change | `kernel/adjudicate.ts`, `BASIS_CODES` |
| auditHash verify failing | `buildAuditRecord` recipe changed | `core/src/audit.ts` |
| AuditRecord missing fields | v4 migration not applied | `audit-postgres/migrations/008-*` |
| Cross-tenant kill leak | Module singleton used instead of RuntimeContext | `runtime-context.ts` |
| UNTRUSTED reaching EXECUTE | Taint reorder undone | `kernel/adjudicate.ts` guard sequence |
| Analyzer false negative | Tier 1 rule missing | `packages/analyze/src/rules/` |
| OTLP attribute renamed | SEMCONV violation | `observability/src/semconv.ts` — MAJOR bump |
| Pack conformance failing | AC-001..AC-006 breakage | `packages/conformance/src/checks/` |

---

This checklist is itself security-labeled. Proposing changes to *this
document* requires the same checklist applied to the change. The
recursion terminates when nothing in §1–6 fires.

Reviewed: 2026-05-18 (M4 — initial publication).
