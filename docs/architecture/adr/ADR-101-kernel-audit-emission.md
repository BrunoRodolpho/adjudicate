# ADR-101 — Kernel-side audit emission via `adjudicateAndAudit`

**Status:** Accepted, 2026-04-26.
**Phase:** Phase 1 — assurance hardening.

## Context

Architectural assurance audit (April 2026) flagged audit integrity as the
weakest invariant of the framework: the kernel's `adjudicate()` returns a
`Decision` and trusts the executor to call `buildAuditRecord` + `sink.emit`.
A misconfigured executor can silently lose audit records; the framework's
strongest claim — "anything that happened can be reproduced
deterministically" — is a configuration property, not an enforced invariant.

Three concrete gaps follow from "audit is the executor's problem":

1. **Audit emission is opt-in.** Adopters can forget the call. The lighthouse
   Pack's tests pass without ever emitting an `AuditRecord`.
2. **Metrics emission is opt-in.** `recordDecision` / `recordRefusal` are
   exported helpers, not kernel invocations.
3. **Ledger consult is opt-in.** The kernel never reads the Execution Ledger.
   `BASIS_CODES.ledger.REPLAY_SUPPRESSED` was defined but never emitted.

A fourth, subtler gap surfaced under adversarial analysis: two adjudicate()
callers holding the same envelope can both compute EXECUTE before either
records to the ledger, so first-writer-wins on the ledger key does not
prevent both side effects from firing. Side-effect dedup was effectively
the adopter's problem.

## Decision

Introduce **`adjudicateAndAudit(envelope, state, policy, deps)`** as the
kernel's complete entry point. Keep `adjudicate()` exactly as-is — it is the
load-bearing replay primitive that property tests and the replay harness
depend on. The new sibling wraps it and composes the four side-effecting
concerns:

```
ledger.checkLedger
  → if hit: REPLAY_SUPPRESSED REFUSE
  → else:   adjudicate() → if EXECUTE, ledger.recordExecution
                            → if "exists": flip to REPLAY_SUPPRESSED
                            → if "acquired": continue
recordDecision / recordRefusal     ← MetricsSink
recordOutcome                       ← LearningSink (failures absorbed)
buildAuditRecord → sink.emit        ← AuditSink (failures propagate)
```

Sink emission throws on failure. Adopters who need fail-open audit compose
`multiSinkLossy` (introduced in T3) themselves; the kernel's default posture
is fail-closed.

### Why two entry points instead of changing `adjudicate()`

Three reasons:

1. **Determinism.** `adjudicate()` is sync, total, and pure. Property tests
   in `tests/kernel/invariants/` and the replay harness depend on those
   properties. Adding ledger I/O would require an async signature; adding
   sink emission would add side effects. Both break the contract.

2. **Replay must be re-execution, not re-emission.** Replay walks stored
   `AuditRecord[]` and re-runs the kernel. If the kernel itself emitted
   `AuditRecord`, replay would either dual-emit (creating duplicates) or
   need a separate "replay mode" branch — an undocumented bypass path.

3. **Test ergonomics.** `adjudicate()` is the function 80 % of unit tests
   call. Forcing every test to wire a sink + ledger would increase
   boilerplate without adding signal.

### Why ledger interfaces moved to `@adjudicate/core`

`adjudicateAndAudit` references `Ledger` and `AuditSink`. These types lived
in `@adjudicate/audit`, but `@adjudicate/audit` already depends on
`@adjudicate/core`. Defining the kernel-side dep on the audit package would
invert the dependency direction.

The lift is type-only — `Ledger` and `AuditSink` are pure interfaces, no
implementations. `@adjudicate/audit` re-exports them so existing import
paths keep working. The Redis/Memory ledger implementations and the
multiSink/bufferedSink fan-out helpers stay in `@adjudicate/audit` where
they belong.

### Why `recordExecution` returns `Promise<"acquired" | "exists">`

The Redis `SET NX` already gives this information back — the `set` call
returns `"OK"` on first writer or `null` on collision. The previous
`Promise<void>` signature swallowed it. Surfacing the tag costs nothing,
and unlocks the EXECUTE-race fix.

The change is structurally back-compatible: callers that previously ignored
the void return continue to ignore the tagged return without compile error
(TypeScript permits unused awaited values).

## Consequences

### Positive

- Audit emission is no longer opt-in for production paths: calling
  `adjudicateAndAudit` guarantees exactly one `AuditRecord.emit` per call.
  The "exactly one" property is now invariant-tested.
- Metrics are observed for every adjudication that flows through the
  recommended entry point.
- Ledger replay suppression is a kernel-issued REFUSE with the documented
  basis code. Replay harness can detect divergence on this path.
- Two parallel callers cannot double-fire side effects for the same
  `intentHash`.

### Negative

- Production paths should migrate from `adjudicate()` to
  `adjudicateAndAudit()`. The migration is local — most call sites are
  inside one executor module per adopter — but it is non-zero.
- The kernel-side helper is async. Tests that need to assert on a single
  Decision step must `await` it. Existing sync-only tests continue to use
  `adjudicate()`.
- A new file (`packages/core/src/kernel/adjudicate-and-audit.ts`) joins
  the core surface. Its contract evolves with the rest of `0.1.0-experimental`
  but the function signature is intended to stabilise alongside the five
  headline interfaces.

### Neutral

- `adjudicateAndLearn` is preserved. It now has a noop-sink-equivalent
  cousin in `adjudicateAndAudit`, but adopters who want learning telemetry
  without audit emission keep their existing entry point.

## Alternatives considered

1. **Make `adjudicate()` itself async and emit audit.** Rejected: breaks
   replay determinism and requires every property test to await.
2. **Define `Ledger` / `AuditSink` locally in the kernel module.** Rejected:
   produces duplicate type names that downstream packages would have to
   re-import or alias. Lift was the correct factoring.
3. **Make `Ledger.recordExecution` mandatory and remove the optional
   ledger.** Rejected: not every adopter has Redis. Single-process
   deployments, replay tooling, and tests benefit from the optional shape.

## Implementation notes

- `packages/core/src/kernel/adjudicate-and-audit.ts` is the new module.
- `packages/core/src/ledger.ts` and `packages/core/src/sink.ts` are the
  lifted type modules.
- `packages/audit/src/ledger.ts` is now a re-export. The implementations
  (`createRedisLedger`, `createMemoryLedger`) are untouched in shape but
  now return `LedgerRecordOutcome`.
- `KERNEL_REFUSAL_CODES` gained `"ledger_replay_suppressed"` so
  `withBasisAudit` does not flag it as Pack drift.
- 14 unit tests + 1 property test land alongside the implementation.

## Follow-ups

- T2 extends the replay harness to detect basis drift, not just kind drift.
  This is what makes the new audit chain genuinely useful.
- T3 flips the default sink fan-out to fail-closed and adds a persistent
  spill so the new at-least-once posture survives transient outages.
- T5 adds rate-limit rollback on non-EXECUTE outcomes (the rollback hook
  attaches to `adjudicateAndAudit`).
