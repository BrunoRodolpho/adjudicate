# ADR-106 — Guard exception isolation

- **Status:** Accepted
- **Date:** 2026-05-18 (M1 overnight execution)
- **Supersedes:** none
- **Related:** ADR-101 (kernel audit emission), ADR-102 (audit fail-closed default), ADR-104 (envelope v2 nonce)

## Context

Pre-M1, the kernel's `_adjudicateImpl` invoked guards directly:

```ts
for (let i = 0; i < policy.stateGuards.length; i++) {
  const d = policy.stateGuards[i]!(envelope, state);
  if (d !== null) return enrichBasis(d, accumulated);
}
```

A guard that threw — whether from an adopter bug, a malformed state
object, a thrown literal, or an unexpected exception in deeply-nested
code — propagated to the adopter caller. Three failure shapes resulted:

1. **Adopters wrap `adjudicate()` in try/catch** — usual case; the
   exception becomes "policy framework error" and the request fails with
   an opaque 500. Audit-trail emission likely skipped.
2. **Adopters do NOT wrap** — uncaught exception terminates the request
   or, in worse cases, crashes the process.
3. **Replay harness collapses** — a stored AuditRecord whose policy
   evolution introduced a throwing guard cannot be replayed without
   special-casing throws in the replay invoker.

Crucially, *neither* failure mode produces an `AuditRecord`. The
governance trail is broken at exactly the moment a real failure occurs.

The pattern this ADR proposes — kernel converts thrown guards into
`SECURITY` REFUSE with a structured basis code — is implemented in
several mature policy engines (OPA, Rego) under different names. The
discipline is widely accepted; what's missing is the explicit closed
discriminator code (`kernel.GUARD_PANIC`) that lets analyzers reason
about the failure.

## Decision

1. **`BASIS_CODES.kernel`** — new category added to the closed enum,
   with `GUARD_PANIC` as its first code (this ADR). The category is
   additive; later ADRs have extended it (see the Neutral consequence).

2. **Every guard invocation in `_adjudicateImpl` is wrapped in
   `try/catch`.** This applies to:
   - `policy.stateGuards[i]`
   - `policy.authGuards[i]`
   - `policy.business[i]`
   - `policy.taint.minimumFor(...)` via the `canPropose()` call

3. **Thrown errors produce a `SECURITY` REFUSE with code `guard_panic`.**
   The refusal carries:
   - `userFacing: "System is temporarily unavailable."` (or the
     localized equivalent via `localizeDecision`)
   - `detail`: phase + guard index + guard name + error name + error message
   - `basis`: `[..accumulated, basis("kernel", "guard_panic", { phase, index, guardName, errorName, message })]`

4. **The refusal flows through the same `enrichBasis(d, accumulated)`
   path as any other guard-emitted refusal.** Audit trail integrity is
   preserved.

5. **Determinism is preserved.** The kernel does not call `Date.now()`,
   `Math.random()`, or any nondeterministic API inside the panic path.
   The `errorName` and `message` are content-derived; identical thrown
   inputs produce byte-identical refusals.

6. **The trace variant** (`adjudicateWithTrace`) records the throwing
   guard as a `match` entry — consistent with the "match is what
   produced the final decision" semantics.

7. **A one-cycle escape hatch shipped, then was removed.** The
   `kernelEnforcement.allowGuardExceptions` flag (default `false` —
   kernel converts) shipped in v0.2 to let adopters opt back into pre-M1
   propagation for a single migration window, and was removed in v0.5 as
   scheduled. The kernel now always converts; there is no opt-out.

## Consequences

### Positive

- Throwing guards become observable through the same audit channel as
  any other refusal — operators page on `kernel.GUARD_PANIC` counts in
  the same dashboard they page on `taint.LEVEL_INSUFFICIENT`.
- Replay-safe: the kernel's purity property is preserved (no I/O, no
  entropy, no time) and a throwing guard produces a deterministic
  refusal. The replay harness reproduces panics without special handling.
- Adopters who relied on try/catch around `adjudicate()` see a strict
  improvement (REFUSE instead of exception) with no code change.
- Invariant #6 (fail-closed by default) is now structurally enforced
  for the guard-error class of failures.

### Negative

- One ~50-line addition to the kernel hot path. Property tests confirm
  no measurable perf regression (panic path takes 0 throws on healthy
  policies; the wrapper cost is negligible vs the guard call itself).
- A subtle behavior change for adopters that *expected* the exception
  (e.g., tests that asserted `expect(() => adjudicate(...)).toThrow()`).
  Mitigated at the time by the now-removed `allowGuardExceptions: true`
  opt-in for one minor cycle (see Migration path).

### Neutral

- The `kernel` basis category is now a stable surface. Future
  kernel-internal failure conditions (e.g., a future `DEADLINE_EXCEEDED`
  in kernel-space) extend it additively.

## Alternatives considered

### Let exceptions propagate (status quo ante)

Rejected. Violates Invariant #6 (fail-closed) — an unhandled exception
in a guard either:
- bypasses audit entirely (caller catches, no AuditRecord),
- or crashes the process (no caller catch).
Both outcomes leave operational state in an unsafe shape.

### Catch and silently treat as `null` (pass-through)

Rejected. Catching and pretending the guard didn't fire is the most
dangerous outcome: the framework SILENTLY ignores a security gate. A
buggy auth guard that throws would result in EXECUTE.

### Catch and convert to a non-Decision sentinel

Rejected. The Decision algebra is closed at 6 variants. Adding a
seventh ("PANIC") would require a new closed-enum entry — ADR-required
for that alone, plus every adapter and Pack would need to handle it.
Reusing `SECURITY` REFUSE with a typed code preserves the algebra.

### Convert to ESCALATE instead of REFUSE

Considered. ESCALATE routes to a supervisor and pauses the action,
which seems appropriate for "the kernel itself failed." Rejected
because:
- Adopters' ESCALATE handlers expect business-relevant context
  (refund amounts, fraud flags); a kernel-internal failure has no
  such context.
- A guard panic is a *bug*, not a *business escalation* — the
  operator needs to fix the guard, not approve the user's action.
- REFUSE with a structured code routes the failure to the same
  observability path as security refusals (the right home).

## Migration path (completed — historical)

This migration is done; no action remains. The flag it describes no
longer exists in the codebase. Recorded here for provenance only:

- v0.2 shipped the change default-on with `allowGuardExceptions: false`.
- A CHANGELOG entry alerted adopters: "Throwing guards now produce REFUSE
  instead of propagating. If you relied on the prior behavior, set
  `kernelEnforcement.allowGuardExceptions: true` for one minor cycle
  while you migrate your tests."
- v0.5 removed the flag. The kernel always converts; the conversion is
  unconditional and there is no longer any way to restore propagation.

## References

- Implementation: `packages/core/src/kernel/adjudicate.ts` (function
  `guardPanicRefusal`).
- Property test: `packages/core/tests/kernel/invariants/guard-panic.property.test.ts`.
- Related concept: Erlang's "let it crash" philosophy paired with
  supervised restart trees — analogous in spirit. The framework's
  supervisor is the AuditSink + alerting pipeline.
