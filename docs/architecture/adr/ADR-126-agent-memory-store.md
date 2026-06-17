# ADR-126 — Agent MemoryStore (cross-session planner context)

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/adapter-core` (`MemoryStore` + `enrichContext`/`deriveMemoryWriteback`), `@adjudicate/admin-sdk` (`memory.bySession`), apps/console (SessionMemoryPanel)
- **Related:** ADR-113 (adapter-core), ADR-103 (runtime context)

## Context

Adopters want cross-session learning (past decisions, domain knowledge) available to the CapabilityPlanner — but the kernel is deterministic by design and memory must never perturb a decision.

## Decision

Add `MemoryStore<M>` (`get`/`put`/`merge?`; in-memory + Redis impls) to adapter-core, plus `memoryStore` + `enrichContext(baseContext, memory)` + optional `deriveMemoryWriteback` options. A single `resolveContext(sessionId, baseContext)` seam folds memory into the context ONCE per iteration and feeds **both** `planner.plan` and `renderer.render` (no prompt/plan desync). A best-effort post-turn writeback runs outside the decision path. Surfaced read-only via `memory.bySession` + a console `SessionMemoryPanel` on the decision-detail page.

## Why this shape

- **Upstream-only.** Memory flows into the *context* → planner tool/intent visibility + prompt text, which is **upstream of `buildEnvelopeFromToolUse`**. Given identical `(envelope, state, policy)` the kernel decision is byte-identical regardless of memory — proven by an integration determinism test (decision + `intentHash` equal with vs without memory).
- **Never in the hash / state S / guards.** Memory is `M`, distinct from state `S`; it is never an argument to `buildEnvelope`/`adjudicate`/guards. A poisoned cross-session memory can at worst widen what the model is *shown*; the kernel still refuses out-of-policy intents (adversarial test: taint stays UNTRUSTED).
- **Read-many, not single-use.** Unlike `ConfirmationStore.take`, `get` is non-destructive.
- **AuditRecord has no memory slot** → the console reads memory via a dedicated `memory.bySession` lookup, not from audit records.

## Invariants preserved

- Kernel determinism + replay-safety (memory ∉ intentHash, ∉ S, ∉ guards). The single `resolveContext` seam prevents planner/renderer desync. Writeback is best-effort (a throwing writeback never fails the turn).

## Alternatives considered

- **Put memory in state S / RuntimeContext.** Rejected — S is hashed/guarded; RuntimeContext is singletons-only and not passed to the planner.
- **Store memory in the AuditRecord.** Impossible pre-v5 and wrong altitude.

## Test coverage

`packages/adapter-core/tests/memory-store.test.ts` (in-mem + redis, non-destructive get, TTL, merge), `loop-memory.test.ts` (planner+renderer both enriched, cold session, no-store passthrough, writeback, DETERMINISM decision+envelope identical with/without memory, adversarial taint). apps/console SessionMemoryPanel test.

## Lifecycle

In-memory + Redis impls ship; redis `merge` is non-atomic (documented). `resolveContext` runs per-iteration (matches the existing "plan every iteration" invariant).

## Addendum (2026-06-17) — lifecycle controls

Adds bounded-growth + concurrency controls without changing the firewall:

- **`maxEntries` LRU** on the in-memory store (Map insertion order; `get`/`put` bump recency) — bounds growth for long-lived processes.
- **`keyFor` namespacing** on the in-memory and Postgres stores (mirrors the Redis store) for cross-tenant isolation. On Postgres it transforms the `session_id` used in the WHERE clause — adopters must namespace stored session ids consistently (documented footgun).
- **Optimistic CAS** — optional `getVersioned`/`putIfVersion` (+ `VersionedMemory`) on `MemoryStore`, implemented on the in-memory store (per-entry monotonic version). The loop's `writeMemoryback` uses CAS with a bounded retry-on-conflict when supported, else best-effort `put`.

**Firewall reaffirmed (the crux):** memory is **NOT audit evidence** — it never enters `intentHash`, state `S`, any guard, the taint gate, or the `auditHash` pre-image (verified: no memory→decision/audit seam exists). Memory flows only into `enrichContext` → planner/renderer (upstream of the envelope) and the post-turn writeback. The report's "memory-as-audit-evidence" idea is consciously **rejected** — making mutable, fail-open memory part of the audit pre-image would break replay/auditHash determinism. New TSDoc states this explicitly. **Deferred:** embeddings-at-scale and federated marketplace memory. Tests: `memory-store.test.ts` (LRU eviction + recency, keyFor isolation, CAS conflict rejection) + `loop-memory.test.ts` (loop CAS retry-then-commit).
