---
"@adjudicate/core": minor
"@adjudicate/audit": minor
---

Kernel-side audit emission, ledger consult, metrics + learning unification via `adjudicateAndAudit`.

The pure deterministic `adjudicate(envelope, state, policy) → Decision` was the only kernel entry point — production callers had to bolt on metrics, learning, and audit emission themselves, leaving the framework's "every decision is reconstructable" claim resting on adopter discipline. The new sibling closes that gap by composing the four side-effecting concerns at one call site.

- **NEW: `adjudicateAndAudit(envelope, state, policy, deps)`** — async wrapper around the sync kernel. Consults the optional Execution Ledger (short-circuiting to a `ledger_replay_suppressed` REFUSE on a cache hit), runs the pure kernel, calls `recordDecision`/`recordRefusal`/`recordOutcome`, builds the `AuditRecord`, and emits it through the supplied `AuditSink`. Returns `{ decision, record, ledgerHit }`. Sink failures propagate; learning-sink failures are absorbed (telemetry never blocks).
- **NEW: EXECUTE-race fix.** After `adjudicate()` returns EXECUTE, `adjudicateAndAudit` calls `ledger.recordExecution()` and flips the Decision to REPLAY_SUPPRESSED if the SET-NX returned `"exists"`. Two parallel callers can no longer both side-effect for the same `intentHash`.
- **CHANGED: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** instead of `Promise<void>`. Existing callers that ignored the void return type continue to work; the kernel uses the tag for the race fix above.
- **MOVED: `Ledger`, `LedgerHit`, `LedgerRecordInput`, `LedgerRecordOutcome`, `AuditSink`** interfaces relocated to `@adjudicate/core` so the kernel can depend on them without inverting the package dependency. `@adjudicate/audit` re-exports them — adopter import paths are unchanged.
- **NEW: `noopAuditSink()`** — no-op sink for entry points that need a sink-shaped value when audit is intentionally unwired (`adjudicateAndLearn` continues to work this way).
- **NEW: kernel refusal code `ledger_replay_suppressed`** added to `KERNEL_REFUSAL_CODES` so `withBasisAudit` does not flag it as Pack drift.
- **NEW: 14 unit tests** (`tests/kernel/adjudicate-and-audit.test.ts`) covering EXECUTE/REFUSE Decision passthrough, ledger hit short-circuit, ledger race, sink-strict propagation, learning-sink absorption, plan snapshot.
- **NEW: 1 property test** (`tests/kernel/invariants/audit-emission.property.test.ts`, 1 000 runs) — every `adjudicateAndAudit` call emits exactly one AuditRecord whose decision matches the returned Decision.
- ADR-101 documents the sync/async split rationale.

**Migration:** `adjudicate()` is unchanged — replay/property tests/legacy callers continue to use it. Production paths should migrate to `adjudicateAndAudit({ sink, ledger? })`. `adjudicateAndLearn` is preserved (no behavior change).
