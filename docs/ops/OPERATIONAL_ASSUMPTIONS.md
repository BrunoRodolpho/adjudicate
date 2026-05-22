# Operational assumptions

> **Status.** Normative for production deployments. Catalogues the
> environmental assumptions the framework makes — what it requires, what
> it tolerates, and what degrades it. Adopters deploying outside these
> assumptions are flying off-spec.
>
> Companion to [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) (per-incident
> triage), [`FAILURE_MODE_CATALOG.md`](./FAILURE_MODE_CATALOG.md) (what
> breaks and how it manifests), and
> [`docs/architecture/INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md)
> §3 (infrastructure-assumption risks).

---

## 1. Frame

Every production system runs on an *assumption stack*. When the stack
holds, the system is healthy. When an assumption breaks, the system
degrades along a known path. This document is the explicit ledger of
those assumptions so an operator three years from now can quickly
identify which assumption a current incident violates.

Each assumption is annotated:

| Annotation | Meaning |
|---|---|
| **Required** | If false, the kernel does not run or does not provide its v1 guarantees. |
| **Expected** | If false, a documented degraded mode applies. |
| **Tolerated** | If false, a documented soft-failure pattern applies. |

A *degraded mode* is documented in
[`FAILURE_MODE_CATALOG.md`](./FAILURE_MODE_CATALOG.md). A *soft
failure* is a non-incident that adopters are expected to plan around.

---

## 2. Runtime environment

### 2.1 Node.js ≥ 20

- **Required.**
- Provides `globalThis.crypto.randomUUID`, `globalThis.crypto.subtle`,
  WebStreams, structured-clone semantics, and ESM resolution that
  `@adjudicate/*` programs against.
- A Node 18 or 16 environment will fail at startup with module-resolution
  or crypto errors.
- Upgrade horizon: Node 20 is current LTS; Node 22 is supported in CI;
  Node ≥ 24 is forward-compatible by construction (no Node 22-specific
  API use in source).

### 2.2 ESM module resolution

- **Required.**
- All packages are `"type": "module"`. CommonJS adopters must transpile
  at their boundary (`require("@adjudicate/core")` returns the
  ESM-loaded module via Node's interop; some bundlers need
  configuration).
- Tolerated: a CJS adopter wiring a dynamic `import()` at boot.

### 2.3 `globalThis.crypto` availability

- **Required.**
- `randomUUID()` is consumed in `adapter-core/src/loop.ts` (ulid
  generation for trace/run ids), `audit/src/redis-emergency-store.ts`
  (governance event ids), and `admin-sdk/src/store/emergency-store.ts`.
- A non-cryptographic fallback (`Math.random()`) exists in the adapter
  loop *for browser bundles only* and is non-load-bearing. Server
  deployments must keep `globalThis.crypto` available.

### 2.4 RFC 8785 / JCS canonicalisation behaviour

- **Required.**
- The runtime's `JSON.stringify` must follow ES2015 semantics for
  number stringification, UTF-8 passthrough for non-ASCII, and
  deterministic property iteration on plain objects.
- ES2015+ runtimes satisfy this. Pre-ES2015 environments do not.
- *Risk surface*: if a future Node release silently changes JSON
  number serialisation (e.g., to ES2020 BigInt-friendly), the golden
  vectors will fail and the upgrade is blocked. The golden-vector
  test is the canary.

---

## 3. Persistent storage

### 3.1 An `AuditSink` exists and is durable

- **Required.**
- Audit emission is hot-path; failure semantics are documented in
  ADR-102 (audit-fail-closed-default). The reference durable sink is
  `@adjudicate/audit-postgres`; the reference buffered sink is
  `persistent-buffered-sink.ts` (spool to disk on transient failure).
- Without a durable sink, the `replayWithIntegrity` and `replay-drift`
  signals are unavailable; the governance contract is incomplete.

### 3.2 A `Ledger` exists (dedup / replay-suppression)

- **Required.**
- Reference implementations: in-memory (`ledger-memory.ts`) and Redis
  (`ledger-redis.ts`). Adopters at scale must use the Redis ledger or
  an equivalent that honours the `Ledger` interface.
- The in-memory ledger is suitable for single-process development.
  Multi-replica production deployments require a shared ledger.

### 3.3 An `EmergencyStore` exists (kill-switch backing)

- **Required for distributed kill-switch.**
- Default reference: Redis (`redis-emergency-store.ts`).
- A deployment without a shared `EmergencyStore` cannot use the
  distributed kill switch; it must rely on per-replica feature flags
  (a degraded mode that does not satisfy ADR-114's sub-100ms
  propagation property).

### 3.4 A `KillSwitchTransport` exists (pub/sub)

- **Expected.**
- v2 kill switch uses Redis pub/sub for the sub-100ms propagation
  guarantee; polling fallback at `pollMs` is the degraded mode.
- An adopter without pub/sub falls back to polling; convergence is
  bounded by `pollMs * 2` (default 2 s with `pollMs = 1000`).

### 3.5 An `AuditEventBus` exists (real-time fan-out)

- **Tolerated** to be absent.
- v0.7 ships `createInMemoryAuditEventBus` and
  `createRedisAuditEventBus`; the latter is the fan-out for
  WebSocket-backed operator consoles. Without it, consoles fall back
  to polling (the v0.7 reference console at `apps/console` does this).

---

## 4. Time

### 4.1 Wallclock available via `deps.clock`

- **Required.**
- The kernel does not call `Date.now()`; `adjudicateAndAudit` consumes
  the clock from `deps`. Adopters who pin a deterministic clock for
  testing must release it in production.
- Time-source assumption: monotonic non-decreasing within a request;
  may jump forward (NTP sync). Idempotency under jump is the nonce's
  responsibility, not the clock's.

### 4.2 ISO-8601 UTC string format

- **Required for audit records.**
- `recordedAt` is `new Date().toISOString()` by default. Adopters
  injecting a custom clock must emit ISO-8601 UTC.
- Test fixtures hardcode UTC literals (e.g., `"2026-04-21T10:32:08Z"`)
  to avoid timezone-dependence. See
  [`docs/architecture/INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md)
  §5.1.

### 4.3 Partition routing is `"YYYY-MM"`

- **Required for audit-postgres.**
- `partition_month` is computed in the sink layer and used by the
  partition pruner. Format is `getUTCFullYear() + "-" + (getUTCMonth() +
  1).toString().padStart(2, "0")`.
- A future maintainer "modernising" to ISO-8601 weeks or quarters
  breaks every previously-written row's queryability.

---

## 5. Observability

### 5.1 OTLP-shaped metrics/traces sink

- **Expected.**
- `@adjudicate/observability` produces OTLP-shaped attribute keys
  consumable by any conformant collector. Adopters without an OTLP
  pipeline lose dashboard fidelity but the kernel continues to run.

### 5.2 SEMCONV vocabulary is queryable

- **Required for operator triage.**
- The five health signals in
  [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) §2 presuppose specific
  SEMCONV keys are emitted. An adopter who has not wired
  observability cannot use the guide.

### 5.3 Replay drift signal requires daily replay

- **Expected.**
- The signal exists only if the deployment runs a daily replay job over
  the last 24 h of audit records. Without it, `replay-drift.ts`
  reports `insufficient_data` forever.

---

## 6. Network

### 6.1 LLM provider reachable from the adapter layer

- **Tolerated** to be intermittent.
- The adapter loop times out per-call; the kernel never blocks on
  provider response (it sees an envelope, not an LLM call).
- An offline LLM provider is an *upstream incident*; the kernel
  remains available for `DEFER`-resume and replay paths.

### 6.2 Postgres reachable from the audit-postgres sink

- **Expected.**
- The `persistent-buffered-sink.ts` covers transient outages by
  spooling to local disk. An adopter without the buffered sink risks
  audit-record loss on transient Postgres outage.

### 6.3 Redis reachable from the kill-switch v2 path

- **Expected.**
- Pub/sub fanout is best-effort; polling is the fallback.
  `boot resync` re-fetches state on reconnect.

---

## 7. Process model

### 7.1 Multi-replica deployment

- **Expected at scale.**
- The kernel is stateless. State lives in `Ledger`, `EmergencyStore`,
  and `AuditSink`. Adding replicas is a matter of attaching them to
  the shared state.

### 7.2 Single-process deployment

- **Tolerated.**
- The in-memory ledger + console sink suffice for development and small
  deployments. The trade-off: no horizontal scale, no shared kill
  switch, no replay-drift signal unless explicitly run.

### 7.3 Restart-durable park/resume

- **Required if `DEFER` is used.**
- `parkDeferredIntent` requires a `ParkStore` that survives restarts
  for paused intents to resume. Reference: `ParkStoreRedis`.
- `REQUEST_CONFIRMATION` similarly requires `ConfirmationStore`;
  reference: `createRedisConfirmationStore` (v0.7).

---

## 8. Build-time

### 8.1 `pnpm` ≥ 10.32.1

- **Required for the monorepo.**
- Adopters consuming published packages do not need pnpm; only
  framework contributors do.
- Pinned via `packageManager` field in root `package.json`.

### 8.2 TypeScript ≥ 5.x with strict mode

- **Required for source builds.**
- The framework ships dual ESM/CJS via dual-emit. `moduleResolution:
  NodeNext`. `strict: true`.

### 8.3 Vitest as the test runner

- **Required for the framework's CI.**
- Property tests via `fast-check`. No Jest.

---

## 9. Cryptography

### 9.1 SHA-256 via `@noble/hashes`

- **Required for hash determinism.**
- See [`docs/architecture/INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md)
  §3.1. Golden vectors are the arbiter; library swap is mechanical
  *if* output is byte-identical.

### 9.2 Pack signing

- **Tolerated** to be absent.
- `verifyPackTrust` modes: `none | best_effort | require_fingerprint
  | require_signature`. The first three permit unsigned Packs.
- Adopters running `require_signature` must manage their own keys
  (ADR-115).

### 9.3 No network calls in the trust path

- **Required.**
- `verifyPackTrust` is pure and local. A future maintainer adding a
  network lookup (e.g., to Sigstore Rekor) violates this assumption
  and must explicitly re-classify the API as MAJOR.

---

## 10. Topology

The reference deployment topology is documented at
[`docs/architecture/hosted/deployment-topology.md`](../architecture/hosted/deployment-topology.md).
For non-hosted adopters, the minimum viable topology is:

```
[adopter HTTP/webhook]
   │
   ▼
[adjudicateAndAudit(envelope, state, policy, deps)]
   ├── deps.ledger   → Redis (or KV)         [Required at scale]
   ├── deps.sink     → audit-postgres        [Required for durability]
   ├── deps.clock    → process clock         [Required]
   └── deps.runtime  → adopter-provided      [Optional, ADR-103]

[Decision]
   ├── EXECUTE              → adopter executor
   ├── DEFER                → ParkStore + signal listener
   ├── REQUEST_CONFIRMATION → ConfirmationStore + UI
   ├── REWRITE              → re-adjudicate sanitised envelope
   └── REFUSE / ESCALATE    → adopter handler
```

A deployment that diverges from this shape — e.g., by inserting an
LLM between the kernel and the executor — is *off-spec* and the v1
guarantees do not apply.

---

## 11. What this document is not

This is not an SLA. The framework does not promise latency, throughput,
or uptime; the adopter's deployment does. This document is the *floor*
of assumptions on which the framework's guarantees rest. Above the
floor, the adopter sizes, scales, and meters as they see fit.

This is also not a sales document. The framework is opinionated about
its floor. Adopters who cannot meet the floor are better served by a
different framework (the post-v1 strategy is explicit:
[`POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md) §"What we do
not do").

---

## 12. Annual review

The assumption stack should be re-audited annually. Reviewer's
checklist:

- [ ] Every "Required" assumption still has a stable upstream
      (Node 20+, ESM resolution, RFC 8785).
- [ ] Every "Expected" assumption still has a documented degraded
      mode (FAILURE_MODE_CATALOG).
- [ ] Every "Tolerated" assumption still has a soft-failure pattern
      adopters can plan around.
- [ ] New assumptions discovered through incidents are added.
- [ ] Outgoing maintainer's name and date are logged in
      [`docs/execution/decisions-log.md`](../execution/decisions-log.md).
