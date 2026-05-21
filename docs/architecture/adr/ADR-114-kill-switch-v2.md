# ADR-114 — Distributed kill switch v2: Redis pub/sub + polling fallback

- **Status:** Accepted
- **Date:** 2026-05-20
- **Scope:** `@adjudicate/audit/kill-switch-pubsub`, kernel `RuntimeContext.killSwitch`
- **Related:** ADR-103 (RuntimeContext), ADR-111 (AuditRecord v4)

## Context

v0.6 ships `startDistributedKillSwitch`, a polled Redis read-through: every replica polls a Redis key on a `pollMs` cadence (default 1 s) and applies any state transition via `RuntimeContext.killSwitch.set()`. Propagation latency is bounded by `pollMs * 2`, typically 1–2 seconds.

For incident response, 1–2 seconds is the right ceiling for "did every replica see this?" but it underperforms for "did every replica see this fast?". Operators triaging an active exploit want sub-100 ms confidence. The v0.6 design notes this explicitly: *"for true real-time, layer Redis pub/sub on top — the adopter wiring is straightforward."*

## Decision

Ship a v2 helper, `startDistributedKillSwitchPubSub`, that adds a Redis pub/sub broadcast on top of the existing polling layer. Both paths run; either suffices for correctness; together they give:

- **Sub-100 ms propagation** when the subscriber is connected to the channel.
- **`pollMs * 2` worst-case convergence** when pub/sub is silent (disconnect, restart, cold-boot race, broker outage).

The lifecycle is explicit:

1. **Boot resync** — immediate `GET` against the Redis key before subscribing. Closes the SUBSCRIBE-vs-transition race where a kill happens between the process starting and the SUBSCRIBE landing.
2. **Subscribe** — listen on the channel for sub-100 ms transitions.
3. **Poll loop** — continues as fallback.

`trip()` and `clear()` write to Redis AND publish on the channel. A publish failure does NOT throw (the Redis SET already committed, so polling will converge); the failure is surfaced via `recordSinkFailure` for telemetry.

## Why both layers

Pub/sub is lossy by design: messages during disconnect are dropped, messages before the subscriber finishes registering are missed. Polling guarantees eventual consistency unconditionally. Removing polling would optimize the fast path at the cost of correctness during partition; removing pub/sub would force a hard floor of `pollMs * 2`. Both is the only correct choice for a fail-closed control plane.

## Invariants preserved

- **Replay determinism.** Pub/sub does not change kernel inputs — `adjudicate()` still reads from the in-process snapshot only.
- **Fail-closed.** A throwing handler, a malformed message, a pub/sub disconnect — none of these affect the kernel's `isKilled()`. State only transitions on a successful Redis read or a valid pub/sub message.
- **No split-brain.** Both layers read the same Redis key. Two replicas applying the same transition produce identical in-process state.
- **Wire format unchanged.** The Redis payload is byte-compatible with v1 (`{active, reason}` + optional extension fields). v1 pollers still work.

## Alternatives considered

- **Pure pub/sub, no polling.** Rejected: a 200 ms subscriber disconnect during an active incident would leave the replica indefinitely stale.
- **Redis streams instead of pub/sub.** Considered but rejected: streams add consumer-group bookkeeping that's overkill for a single boolean. Pub/sub plus polling resync is simpler with the same end-to-end guarantees.
- **Replace the v1 helper.** Rejected: existing deployments depend on the polled-only path. v2 is additive — adopters opt in by switching the import; v1 stays in place.

## Test coverage

`packages/audit/tests/kill-switch-pubsub.test.ts` covers:
- Sub-100 ms propagation
- Boot resync from a pre-existing Redis value
- Polling fallback when pub/sub is silent
- Publish failure does NOT throw (Redis fallback covers)
- Malformed pub/sub messages surface as sink failures
- Subscribe/unsubscribe lifecycle is leak-free

`packages/audit/tests/chaos-kill-switch.test.ts` covers:
- Burst of malformed messages
- Trip→clear→trip storm convergence
- Multi-replica concurrent trip (last-write-wins, no split-brain)
- Disconnect/reconnect recovery
- Subscribe-storm leak detection

## Adopter migration

```ts
// v1 (still supported)
import { startDistributedKillSwitch } from "@adjudicate/audit";
const handle = startDistributedKillSwitch({ redis, key, pollMs: 1000 });

// v2 (sub-100 ms with polling fallback)
import { startDistributedKillSwitchPubSub } from "@adjudicate/audit";
const handle = startDistributedKillSwitchPubSub({
  redis,
  pubsub,             // separate node-redis subscriber connection
  key,
  channel: `${key}:channel`,
  pollMs: 1000,       // fallback cadence
});
```

No kernel changes. No wire-format changes. No new dependencies (the `RedisPubSubClient` interface is structural — any `publish` + `subscribe` shape works).
