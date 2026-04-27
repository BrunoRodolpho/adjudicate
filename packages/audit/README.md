# @adjudicate/audit

Execution Ledger + durable audit sinks + replay harness.

## Ledger vs Sink — two concerns, two primitives

| | Purpose | Backend (v1.0) | TTL | Authority |
|---|---|---|---|---|
| **Execution Ledger** | Hot-path replay/dedup: "has `intentHash` already executed?" | Redis (`SET NX` + JSON blob) | 14 days | **Execution dedup only** — not the governance record of truth |
| **Audit Sink** | Durable governance trail: "what happened, why, on what basis?" | `ConsoleSink`, `NatsSink`, `PostgresSink` (opt-in `@adjudicate/audit-postgres`) | Permanent / stream-lifetime | **Governance record of truth** |

**Do not conflate them.** Redis is not a durable audit substrate. If the
ledger is ever lost, execution dedup regresses (retries may duplicate). Audit
records stay intact because Sinks persist independently.

## Execution Ledger

```ts
import { createRedisLedger, createMemoryLedger } from "@adjudicate/audit";

const ledger = createRedisLedger({
  client: myRedisClient,               // exposes `set(key, value, options)` + `get(key)`
  keyFor: (suffix) => rk(suffix),      // adopter-supplied namespacer
  ttlSeconds: 14 * 24 * 60 * 60,       // default 14 days
});

const hit = await ledger.checkLedger(envelope.intentHash);
if (hit) return { alreadyExecuted: true, at: hit.at };

await ledger.recordExecution({
  intentHash: envelope.intentHash,
  resourceVersion: orderVersion,
  sessionId: envelope.actor.sessionId,
  kind: envelope.kind,
});
```

SET NX + TTL. First writer wins. Memory implementation available for tests.

## Audit Sinks

```ts
import { createConsoleSink, createNatsSink, multiSink } from "@adjudicate/audit";

const sink = multiSink(
  createConsoleSink({ prefix: "[audit]" }),
  createNatsSink({ publisher: myNatsPublisher }),
);

await sink.emit(auditRecord);
```

### Fan-out + decoration helpers

| Helper | Semantics | Use when |
|---|---|---|
| `multiSink(...)` (T3 default = **strict**) | At-least-once. Throws `AuditSinkError` if any inner sink rejects. Each rejection also records a `recordSinkFailure({ subject: "multiSink[i]" })` telemetry event. | Default for governance-grade audit. The framework's "every decision is reconstructable" claim. |
| `multiSinkStrict(...)` | Alias for `multiSink`. Kept for adopters that already opted in to strict explicitly. | (Same as `multiSink`.) |
| `multiSinkLossy(...)` | **Explicit fail-open** (the pre-T3 `multiSink` behaviour). Per-sink rejections still emit `recordSinkFailure` for observability but the fan-out itself does not throw. | Non-critical paths where the replay harness is the safety net. NOT recommended for financial, regulated, or kernel-enforced intent paths. |
| `bufferedSink({ inner, capacity, onOverflow? })` | Bounded **in-memory** replay queue. On `inner` failure: enqueues + rethrows. On next success: drains FIFO. Evicts oldest at capacity. **Lossy on process restart.** | Tests, smoke demos, lightweight adopters. |
| `persistentBufferedSink({ inner, storage, capacity, onOverflow })` | Bounded in-memory queue with **durable spill** to `PersistentSpillStorage`. Capacity-driven evictions spill instead of being lost; recovery drains spill FIFO before the in-memory queue. Records survive process restart. `onOverflow` is required. | Governance-grade audit with sustained-outage tolerance. Pair with `multiSink` (strict). |

Recommended composition for governance-grade audit (T3 default):

```ts
import {
  createConsoleSink,
  createNatsSink,
  createInMemorySpillStorage, // production: filesystem JSONL / SQLite / S3
  multiSink,
  persistentBufferedSink,
  AuditSinkError,
} from "@adjudicate/audit";
import { recordSinkFailure } from "@adjudicate/core/kernel";

const sink = multiSink(
  createConsoleSink(),
  persistentBufferedSink({
    inner: createNatsSink({ publisher: myNatsPublisher }),
    storage: createInMemorySpillStorage(), // swap for a durable backend in prod
    capacity: 1024,
    onOverflow: (record) =>
      recordSinkFailure({
        sink: "nats",
        subject: "audit.intent.decision.v1",
        errorClass: "persistent_buffered_sink_overflow",
        consecutiveFailures: 1,
      }),
  }),
);

try {
  await sink.emit(auditRecord);
} catch (err) {
  if (err instanceof AuditSinkError) {
    for (const failure of err.failures) {
      // route per-sink failure to telemetry
    }
  }
  throw err;
}
```

## Replay harness

```ts
import { replay } from "@adjudicate/audit";

const report = replay(records, (r) => adjudicate(r.envelope, state, policy));
// report.matched === report.total means your policy still produces identical
// decisions AND identical basis flat-sets for every historical intent.
```

`report.mismatches[i].kind` classifies divergence by severity:

| Kind | Meaning | Runbook signal |
|---|---|---|
| `DECISION_KIND` | The replayed `decision.kind` differs (e.g., EXECUTE → REFUSE). | Page on-call. The policy now produces a different outcome. |
| `BASIS_DRIFT` | Same kind, different flat-set of `category:code` basis. `basisDelta.missing/extra` carries the symmetric difference. | Investigate within window. Rename or category change without semantic shift is BASIS_DRIFT. |
| `REFUSAL_CODE_DRIFT` | Both REFUSE, same kind+basis, but `refusal.code` changed. | Track for Phase 6 governance dashboard. Code rename without semantic shift is REFUSAL_CODE_DRIFT. |

Comparison rules (applied top-down):

1. Different `decision.kind` → `DECISION_KIND`.
2. Same kind, different flat-set basis → `BASIS_DRIFT` (subsumes refusal-code drift when basis also drifted).
3. Both REFUSE, same kind+basis, different refusal code → `REFUSAL_CODE_DRIFT`.
4. Otherwise matched.

Flat-set semantics: basis order is irrelevant; `basis.detail` is ignored. Mirrors how `Postgres.intent_audit.decision_basis` is stored (`text[]` of `category:code`). Use `classify(intentHash, expected, actual)` for cross-record audits without re-implementing the rule.

## Feature flags

- `IBX_LEDGER_ENABLED=true` → shadow writes (record but do not enforce)
- `IBX_LEDGER_ENFORCE=true` → `checkLedger` is authoritative on the write path

Both flags are parsed case-insensitively (`1`, `true`, `yes`, `on`).
