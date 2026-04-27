# ADR-102 — Audit fail-closed by default

**Status:** Accepted, 2026-04-27.
**Phase:** Phase 1 — assurance hardening.

## Context

The architectural assurance audit identified audit integrity as the
weakest of the framework's nine invariant categories. Three findings
combined to make "every decision is reconstructable" a configuration
property rather than an enforced invariant:

- **#23** — `multiSink` (the documented fan-out helper) defaults to
  fail-open. `Promise.allSettled` swallows every sink rejection. An
  adopter who wires `multiSink(natsSink, postgresSink)` expecting
  durability silently loses audit when both sinks fail.
- **#24** — `bufferedSink` is bounded in-memory with a documented
  capacity. Sustained outages exceed capacity, the oldest record is
  evicted via `onOverflow`, and process restart loses the queue
  entirely. There is no durable spill.
- **#25** — `NatsSink`'s circuit breaker resets the consecutive-failure
  counter to 0 after each `NatsSinkError` throw. Under a sustained
  outage, emits 11 through 19 swallowed the inner error (returned as
  thrown but not as `NatsSinkError`), making the breaker invisible
  except every 10th emit — a 9-failure blind spot.

## Decision

Three coordinated changes, shipped as one major (within the
`0.1.0-experimental` window):

1. **Flip `multiSink` to strict.** The default fan-out throws
   `AuditSinkError` if any inner sink rejected. `multiSinkStrict` stays
   as a named alias. Adopters who explicitly want fail-open call the
   new `multiSinkLossy`. Both fan-outs call `recordSinkFailure` for
   per-sink observability so the lossy path is not silent.

2. **Introduce `persistentBufferedSink`.** Durable replay queue with an
   in-memory hot-path (bounded by `capacity`) and a `PersistentSpillStorage`
   adopter-supplied backend. Capacity-driven evictions spill to storage;
   recovery drains storage FIFO before the in-memory queue. Records
   survive process restart. `onOverflow` is required (no longer optional).

3. **Add half-open close to `NatsSink`.** After the threshold trip, the
   breaker transitions to `open`. The next emit becomes a `half-open`
   test. Success → `closed` (counter resets). Failure → throws
   `NatsSinkError` immediately and stays `open`. Every emit during a
   sustained outage is loud.

### Why flip the default rather than deprecate

The plan offered two paths: deprecate `multiSink` (keep fail-open with a
warning, push adopters to `multiSinkStrict`) or flip the default
outright. Within `0.1.0-experimental` we flipped — the strongest
default is the one most useful for a framework whose load-bearing claim
is that every decision can be reconstructed. The alternative leaves an
indefinite window where every adopter's default audit posture is
fail-open until they read the migration note.

### Why `persistentBufferedSink` is a new wrapper, not a replacement

`bufferedSink` is fine for tests, smoke demos, and lightweight adopters.
Production deployments that need governance-grade audit get a
strictly stronger primitive — but the in-memory variant remains useful.
Two wrappers preserve back-compat for the test fixtures that exist
today.

### Why `PersistentSpillStorage` is adopter-supplied

File-handle ownership and crash semantics are deployment-specific. A
container running on a writable EBS volume does not need the same
flush-and-fsync-per-record contract as a Lambda with ephemeral storage.
We ship `createInMemorySpillStorage()` as the reference and document
that production adopters supply their own (filesystem JSONL, SQLite,
S3-multipart, etc.).

### Why half-open close for NATS

The pre-T3 reset-on-trip semantic was "fail loud once per N failures."
Under a 1-hour sustained outage, an adopter would see one
`NatsSinkError` every 10 emits and N-9 swallowed inner-Error throws —
a noise-to-signal ratio that obscured the underlying outage. Half-open
is the standard circuit-breaker close: the breaker is loud whenever
it's open, except for one in-flight test attempt.

## Consequences

### Positive

- The default audit composition (`multiSink(natsSink, postgresSink)`)
  is fail-closed. Adopters who do not opt in to `multiSinkLossy` get
  the strongest semantic out of the box.
- Sustained outages that exceed `bufferedSink` capacity are recoverable
  via `persistentBufferedSink`. Records spilled to durable storage
  survive process restart.
- NATS outages are loud on every emit, not every Nth. Operator pages
  fire faster.
- `recordSinkFailure` is now invoked from every fan-out path —
  second-order observability is uniform.

### Negative

- The `multiSink` flip is breaking. Adopters who had `multiSink` and
  expected fail-open get audit failures propagating into their executor.
  This is the right answer for governance-grade audit but it is a
  migration step. README documents the rename to `multiSinkLossy` for
  adopters who deliberately want fail-open.
- `persistentBufferedSink.onOverflow` is required — adopters who don't
  wire it get a TypeScript error. Intentional: silent loss is the
  failure mode the sink exists to prevent.
- The half-open NATS variant changes the behaviour an adopter sees
  during outages. The pre-T3 9-failure window was an undocumented
  bug; closing it changes the visible behaviour but not any
  documented semantic.

### Neutral

- The in-memory `bufferedSink` is unchanged.
- `recordSinkFailure` second-order calls add three telemetry events
  per failed inner emit (one per fan-out). Negligible cost; useful
  signal.

## Implementation notes

- `packages/audit/src/sink.ts` — `multiSink` rewritten to strict;
  `multiSinkLossy` added; both call `recordSinkFailure` per failure.
- `packages/audit/src/sink-nats.ts` — breaker state machine `closed →
  open → half-open → {closed | open}`.
- `packages/audit/src/persistent-buffered-sink.ts` — new module.
- `packages/audit/src/index.ts` — exports.
- 19 new tests across three files; 2 existing tests updated for the
  new strict semantic.

## Follow-ups

- T7 (distributed kill switch) reuses `recordSinkFailure` with the new
  `errorClass: "distributed-kill-switch"` for poller failures.
- A future PR ships a reference filesystem-backed `PersistentSpillStorage`
  in a `@adjudicate/audit-spill-fs` package.
