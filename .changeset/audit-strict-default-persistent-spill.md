---
"@adjudicate/audit": major
---

Audit-sink defaults flip to fail-closed, with durable spill and half-open NATS breaker. Resolves audit-completeness gaps (#23, #24, #25, #28, #43) — moves "audit reconstructability" from configuration property to enforced default.

**Breaking** — adopters who relied on `multiSink`'s pre-T3 fail-open semantics rename to `multiSinkLossy`. Within the `0.1.0-experimental` semver window this is permitted; the upside is governance-grade audit out of the box.

- **CHANGED: `multiSink` is now strict** (alias for `multiSinkStrict`). Awaits all sinks via `Promise.allSettled`, throws `AuditSinkError` if any sink rejected. Was: fail-open, swallowed all rejections. The strict semantics is the right default for the framework's "every decision is reconstructable" claim. `multiSinkStrict` remains as a named alias for adopters who already chose strict explicitly.
- **NEW: `multiSinkLossy(...)`** — explicit fail-open fan-out. The pre-T3 `multiSink` behaviour. Use only when you have explicitly accepted that audit completeness is not load-bearing for the call site (definitely not financial, regulated, or kernel-enforced intent paths).
- **NEW: sink-of-sinks observability** — `multiSink`/`multiSinkStrict`/`multiSinkLossy` call `recordSinkFailure({ subject: "multiSink[i]", errorClass, ... })` for each rejection synchronously, so a metrics breadcrumb is always recorded even when the throw is swallowed upstream by a lossy fan-out.
- **NEW: `persistentBufferedSink({ inner, storage, capacity, onOverflow })`** — durable replay queue. In-memory queue up to `capacity`; capacity-driven evictions spill to `PersistentSpillStorage`; on inner recovery, the spill drains FIFO before in-memory. Records survive process restart. Pair with `multiSink` (strict) for governance-grade audit.
- **NEW: `PersistentSpillStorage` interface** with `append`/`readAll`/`ack`. Adopter-supplied (filesystem JSONL, SQLite, S3 — deployment-specific). Reference `createInMemorySpillStorage()` ships for tests and lightweight adopters.
- **CHANGED: `persistentBufferedSink.onOverflow` is REQUIRED** — silent loss is the failure mode this sink prevents. The original `bufferedSink` keeps `onOverflow` optional for back-compat.
- **CHANGED: `NatsSink` half-open close** — after the `failureThreshold` trip, the breaker transitions to `open`. The next emit attempt becomes `half-open`: success → `closed` (counter resets); failure → `open` again with `NatsSinkError` thrown immediately. Pre-T3 reset the counter to 0 after trip, leaving a 9-failure blind spot under sustained outage. Now every emit during a sustained outage is loud.
- **NEW: 7 unit tests** (`persistent-buffered-sink.test.ts`) covering FIFO drain, capacity eviction, restart recovery, and the 100-record acceptance scenario.
- **NEW: 2 unit tests** (`sink-burst-failure.test.ts`) for the half-open state transitions.
- **NEW: 3 unit tests** (`sink.test.ts`) for the new strict default + `multiSinkLossy` parity + sink-of-sinks observability.
- ADR-102 documents the fail-closed-default rationale.

**Migration:**
- `multiSink(natsSink, postgresSink)` previously fail-open → still works but **now throws** on inner failure. Action: either (a) accept the new strict semantic (recommended) or (b) rename to `multiSinkLossy` to preserve the old behaviour.
- Adopters using `multiSinkStrict` explicitly: no migration needed.
- Adopters using `bufferedSink`: no migration needed; for governance-grade audit, switch to `persistentBufferedSink` with a real `PersistentSpillStorage` implementation.
- `NatsSink` adopters: behaviour change is invisible during normal operation. During sustained outages, every emit now throws `NatsSinkError` (pre-T3, only every 10th).
