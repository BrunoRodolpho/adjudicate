# V1 Security & Supply-Chain Audit

> Governance-runtime security review supporting the v1.0 release-candidate
> certification. Generated 2026-05-20. Supplements
> [`threat-model.md`](./threat-model.md) and
> [`security-review-checklist.md`](./security-review-checklist.md);
> records concrete findings, classifications, and remediation status
> against the v0.7 codebase at commit `bddf704`.

This audit walks every attack surface called out in the RC mandate
(Pack trust primitives, signature verification, manifest parsing,
replay ingestion, audit persistence, websocket lifecycle, pub/sub
propagation, adapter-core boundaries, provider SDK boundaries, CLI
trust flow) and assigns each finding a tier:

| Tier | Meaning |
|---|---|
| **A — accepted as-designed** | Posture is intentional and documented; no action. |
| **H — hardened** | Mitigated in code; record the mitigation here. |
| **G — guidance** | Behavior is correct but adopters need explicit operational hand-off (e.g., key rotation). |
| **W — watch** | Not exploitable today, but the framework should monitor (CI assertion or runtime metric). |
| **F — fix** | Justified change before v1.0 cut. |

No fix-tier findings are currently open.

---

## §1 — Pack trust primitives

`@adjudicate/conformance/pack-trust.ts` (ADR-115) ships
`computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`,
`verifyPackTrust`.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-1.1 | `computePackFingerprint` | canonicalization mismatch between signer & verifier | **A** | Single in-repo canonical-JSON serializer; sorted-key emission tested in `pack-trust.test.ts`. Adopters using non-Node signers must match the canonical algorithm spec verbatim. |
| T-1.2 | `signPackFingerprint` | key-algorithm misuse (e.g., RSA key with `ed25519` algorithm tag) | **H** | `verifyPackSignature` detects `key_algorithm_mismatch` as a distinct reason from `signature_mismatch`; tests cover both. |
| T-1.3 | `verifyPackSignature` | malformed PEM input crashes the verifier | **H** | `createPublicKey` throws are caught and re-raised as a programmer error; tests cover both bad-PEM and bad-signature paths. |
| T-1.4 | `verifyPackTrust` policy gates | `require_signature` slip when caller forgets to wire publicKey | **H** | Explicit error string: "trust policy require_signature requires both signature and publicKeyPem". |
| T-1.5 | Fingerprint scope (declarative subset, excludes `policy`/`planner`) | adopter mis-believes fingerprint covers behavior | **G** | Documented in module JSDoc and ADR-115. Adopters must run `runConformance` for behavioral assurance — fingerprint is integrity-of-declared-surface only. |
| T-1.6 | `policy === "best_effort"` default | adopter forgets to set `require_signature` in prod | **G** | Documented; ADR-115 recommends `require_signature` for production. Defaults are intentionally permissive for local dev. |

### Supply-chain implication

The fingerprint is **stable across builds** (re-bundling produces the
same fingerprint) — signers can re-issue the same signature across
toolchain changes. This is the right property: it allows reproducible
verification without pinning a specific bundler.

---

## §2 — Manifest parsing

`@adjudicate/conformance/manifest.ts` validates the `package.json`
`adjudicate` field at install/CI time.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-2.1 | `validatePackManifest` input handling | malformed JSON crashes validator | **H** | Validator takes already-parsed `unknown`; type-narrowed before access. No FS or network I/O. |
| T-2.2 | `intents` duplicate detection | confusing collision when a Pack lists the same intent twice | **H** | `seen.has(intent)` check emits explicit duplicate error. |
| T-2.3 | `compatibility.adapters` structural check | adopter ships a non-string list | **H** | Type-narrows with explicit messaging. |
| T-2.4 | Required `@adjudicate/core` peer dep | adopter publishes a Pack without pinning kernel range | **H** | Validator requires `peerDependencies["@adjudicate/core"]` and asserts it equals `kernelMinVersion`. |
| T-2.5 | Field `signed.sigstore` | malicious URL injection | **A** | Field is structural-only; consumers (future hosted indexer) are responsible for trust evaluation of the URL. |

---

## §3 — Replay ingestion

The replay path lives across `@adjudicate/audit/replay.ts`,
`@adjudicate/audit/replay-integrity.ts`, `@adjudicate/audit-postgres/replay.ts`,
and `@adjudicate/core/replay-classify.ts`.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-3.1 | `rowToRecord` (Postgres) | JSON.parse over `envelope_jsonb` / `decision_jsonb` / `plan_jsonb` / `supersedes_jsonb` without schema validation | **W** | Parsed values are cast to typed shapes; chaos-replay test (`100 corrupted envelopes`) confirms downstream code surfaces failures rather than crashing. Adopters with hostile DB access could inject malformed JSON; this is a database-trust problem, not a framework problem. Mitigation: optional `AuditRecordSchema` (Zod, from `@adjudicate/admin-sdk`) applied at the boundary in the replay reader. Tracked as a v1.1 hardening. |
| T-3.2 | `replayWithIntegrity` envelope-hash verification | tampered envelope blob inside a valid row | **H** | Re-derives `intentHash` and reports mismatch as `envelope_hash_mismatch` integrity failure. |
| T-3.3 | `replayWithIntegrity` audit-hash verification | tampered AuditRecord (post-write) | **H** | Re-derives `auditHash` via `verifyAuditRecord` and reports `audit_hash_mismatch`. Pre-v4 records surface as `verified: null, reason: "missing_hash"` — counted as `preV4Records`, not a failure. |
| T-3.4 | `classify` (decision diffing) | replay desync silently misclassified | **H** | Decision-kind + basis-flat-set comparison is exhaustive; `IDENTICAL` / `BASIS_ONLY` / `DECISION_CHANGED` are the only outcomes. |
| T-3.5 | `legacyV1ToV2` shim | v1 row replays with reproduced `intentHash` (foot-gun) | **A** | Doc-string explicitly states the hash WILL differ across recipes; only `(kind, basis)` comparison is meaningful for v1 rows. |

### Recommended hardening (v1.1)

Add an opt-in `validateRow?: (row: IntentAuditRow) => AuditRow` hook to
`createPostgresAuditStore` that adopters can wire to `AuditRecordSchema`
from `@adjudicate/admin-sdk` for strict shape enforcement at the read
boundary. This converts T-3.1 from W → H. The change is additive and
ships under MINOR.

---

## §4 — Audit persistence

`@adjudicate/audit/sink.ts`, `persistent-buffered-sink.ts`, `sink-nats.ts`,
`sink-console.ts`, and `@adjudicate/audit-postgres/postgres-sink.ts`.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-4.1 | `bufferedSink` / `persistentBufferedSink` spill | unbounded memory growth under sink failure | **H** | Both sinks expose `maxBuffered` cap; spill storage interface allows offload. `PersistentBufferedSpillReason` enumerates the trigger surface. |
| T-4.2 | `multiSinkStrict` fan-out | one sink failure rolls back the whole emit | **H** | Intentional contract — "strict" wraps `Promise.all`; any rejection propagates. |
| T-4.3 | `multiSinkLossy` fan-out | sink failures hidden | **A** | Lossy contract is the opposite of strict; named explicitly. |
| T-4.4 | Postgres `recordToRow` write-path | row exceeds column capacity | **W** | Decision payloads are stored as `jsonb`; row size bounded by Postgres `MAX_FIELD_SIZE` (1GB). Pack-author discipline keeps payloads small; AC-002 enforces a basis-vocabulary boundary. |
| T-4.5 | `createNatsSink` publisher contract | adopter passes a non-JS-safe payload | **A** | NATS publisher interface is structural; framework does not own the serializer. |

---

## §5 — WebSocket / event-bus lifecycle

`@adjudicate/audit/event-bus.ts` ships in-memory + Redis pub/sub buses;
the operator console still polls (migration to bus is console-side).

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-5.1 | `createInMemoryAuditEventBus` handler iteration | handler throws disrupt fan-out | **H** | Snapshot array taken before iteration; handler errors swallowed. |
| T-5.2 | `createRedisAuditEventBus` JSON.parse of incoming message | malformed pub/sub message crashes subscriber thread | **H** | `parse` failures emit `logger.warn({ reason: ... })`; subscriber continues. |
| T-5.3 | `createRedisAuditEventBus` parsed-as-AuditRecord without schema validation | downstream handler receives malformed record | **W** | Same posture as T-3.1: handlers are advisory observers, not adjudication inputs. A malformed record cannot change a kernel Decision. Recommended hardening: optional `validateRecord` callback that runs Zod validation when wired. Additive; ships under MINOR. |
| T-5.4 | `bridgeAuditSinkToBus` failure semantics | bus failure rolls back durable write | **H** | Bus publish runs AFTER durable emit; bus failure surfaces via `onBusFailure` but does NOT propagate. ADR-114 / V0.7-AUDIT-REPORT §"Event-system robustness". |
| T-5.5 | Subscribe lifecycle (lazy SUBSCRIBE/UNSUBSCRIBE) | listener leak when many ephemeral handlers register | **H** | Per-channel ref count + atomic unsubscribe on last-handler. Asserted by `bus-listener-cleanup` invariant in `bench/src/scale/scale.test.ts`. |
| T-5.6 | Reconnect storm | dropped records during the reconnect window | **A** | Bus contract is best-effort by design (see V0.7-AUDIT-REPORT). Adopters needing replay-vs-bus parity layer the replay stream on top. |

---

## §6 — Pub/sub propagation (kill-switch v2)

`@adjudicate/audit/kill-switch-pubsub.ts`.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-6.1 | Inbound message validation | malformed payload toggles the switch | **H** | `parsePayload` rejects on missing `active` / `reason` fields; emits a typed error to the logger. Tested by `chaos-kill-switch.test.ts`. |
| T-6.2 | Boot-time race (SUBSCRIBE vs first transition) | replica boots after a trip but never sees it | **H** | Boot resync from Redis happens BEFORE subscribe; transition applied before message stream activates. |
| T-6.3 | Reconnect race (subscriber drops & rejoins) | dropped state | **H** | Polling fallback re-applies state within `pollMs * 2`. Verified by scale harness (`kill-heavy` scenario) and chaos test. |
| T-6.4 | Multi-replica concurrent trip | split-brain ambiguity | **H** | All replicas read the same Redis key; last-write-wins on `set()`. Scale harness asserts zero split-brain across 100 transitions × 64 replicas. |
| T-6.5 | Replica partition (mid-flow) | partition window leaves replica desynced | **H** | Polling fallback converges every replica after `clearPartition()`. Scale harness `kill-fallback-after-partition` invariant. |
| T-6.6 | Pub/sub publish failure (Redis down for PUBLISH) | trip is silent | **H** | Trip path writes to Redis FIRST, then publishes; publish failure is swallowed because polling still propagates. Documented in module JSDoc. |
| T-6.7 | `recordSinkFailure` telemetry routing | infinite-recursion if telemetry sink also publishes pub/sub | **A** | The telemetry sink is the console subject `kill-switch-pubsub`; metrics carry counters, not envelopes. No recursive write path. |

### Convergence guarantee

The scale harness (`docs/perf/scale-baselines.json`, scenario
`kill-heavy`) records:

- 100 transitions across 64 replicas (60 eager + 4 late-boot)
- 5 mid-run crashes, 3 reconnect cycles, 200 ms partition
- 100% convergence
- 0 split-brain
- propagation p50 = 94.67 ms, p95 = 97.36 ms, p99 = 98.20 ms,
  max = 98.53 ms (dominated by polling fallback when pub/sub miss)

This is the in-process simulation; real-Redis latency layers on top.
The convergence STRUCTURE is proven; adopter-side latency profiles
remain the evidence-gated item.

---

## §7 — Adapter-core boundaries

`@adjudicate/adapter-core` — provider-neutral loop. Mandate: provider
adapters MUST NOT bypass the loop.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-7.1 | Loop bypass | provider adapter calls `adjudicate()` instead of `adjudicateAndAudit()` via the loop | **H** | Loop is the only call site for `adjudicateAndAudit`. Provider packages re-export `createAdjudicatedAgent` from adapter-core; no provider has its own kernel invocation. Asserted by `grep` invariant proposed in §5 of the v1 release engineering plan. |
| T-7.2 | History `H` opacity | loop inspects provider history | **H** | Loop uses bridge methods only; history is typed `unknown`. Test `loop.test.ts` runs a smoke loop with `H = unknown`. |
| T-7.3 | `verifyConfirmationBlob` hash check (REQUEST_CONFIRMATION resume) | tampered confirmation token re-enters the loop | **H** | Confirmation token derived via `sha256Canonical`; on resume, re-derives and compares. |
| T-7.4 | `createRedisConfirmationStore` JSON.parse | malformed stored blob crashes resume | **H** | Try-catch + typed parse; the wire format is validated against a structural shape; failure returns `null` (no token). |
| T-7.5 | `maxIterations` cap | runaway tool-use loop | **H** | Hard default 8; option override surfaced. Outcome `max_iterations_exceeded` is a closed enum, distinguishable in audit. |
| T-7.6 | `TraceSink` failure | trace handler throws | **H** | Loop guards `traceSink.onTrace` with try-catch; default is no-op. |

---

## §8 — Provider SDK boundaries

`@adjudicate/anthropic` and `@adjudicate/openai` are thin SDK shims.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-8.1 | Anthropic adapter does not bypass loop | adapter constructs its own AuditRecords | **H** | v0.5 P0-2 fixed; integration test asserts `REPLAY_SUPPRESSED` on duplicate `intentHash` flows through the adapter loop. |
| T-8.2 | OpenAI structural `OpenAIChatLikeClient` | adopter substitutes a hostile client | **A** | Structural interface accepts any conforming object; the trust model is "adopter chose the client". The kernel cannot validate the client's HTTP layer. |
| T-8.3 | Tool-arguments parse | OpenAI passes `function.arguments` as a string | **H** | `bridge-openai.ts` parses via `JSON.parse`; failures surface as `ToolUseClassification.parse_error` and route to a REFUSE rather than executing. |
| T-8.4 | Anthropic `MessageParam[]` history shape | history type leaks into kernel | **H** | History stays opaque to the loop; bridge owns its serialization. |

---

## §9 — CLI trust flow

`@adjudicate/cli/commands/pack-verify.ts` is the install-time trust
entrypoint.

### Findings

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-9.1 | `loadPackFromModule` (dynamic `import()`) | hostile Pack executes during verification | **A** | Documented inherent risk: trust primitives verify the SOURCE the adopter chose to install. Adopters who don't trust a Pack should not import it; the verify flow operates on a Pack the adopter has already chosen to evaluate. The same `import()` happens during `pack lint`, `analyze`, and `simulate`. |
| T-9.2 | Public-key PEM file read | injected path traversal in `--public-key` | **H** | `path.resolve(cwd, options.publicKey)` constrains the read to the cwd subtree under normal usage; adopters pass paths intentionally. Symlink-attack via cwd is the same shape every CLI has — out of scope for the framework. |
| T-9.3 | Signature file parsing | malformed signature crashes CLI | **H** | `JSON.parse` + structural-shape check; explicit error to stderr; exit code 1. |
| T-9.4 | `--policy require_signature` exit code | adopter expects 0 but signature missing | **H** | Trust report's `errors` array surfaces all unsatisfied policy axes; CLI exits 1 with each error printed. |
| T-9.5 | Quiet mode (`--quiet`) | secrets leak via stdout | **A** | Quiet emits only the fingerprint hex; no key material, no manifest contents. |

---

## §10 — Supply-chain posture

### Findings

| ID | Subject | Threat | Tier | Notes |
|---|---|---|---|---|
| T-10.1 | npm dependency footprint | transitive package compromise | **G** | Framework dependencies are minimal: `commander`, `chalk`, `ts-morph` (analyzer only), `pino` (selectively). Adopter-supplied `node-redis` / `pg` not in framework dep tree. SBOM should be generated during release; tracked under Phase 5. |
| T-10.2 | Reproducible build (Pack fingerprint stability) | re-bundling drifts fingerprint | **H** | Fingerprint covers declarative subset only; tested via `pack-trust.test.ts § "Identical Packs produce identical fingerprints regardless of property order"`. |
| T-10.3 | `pnpm-lock.yaml` integrity | dependency resolution drift | **G** | Lock file committed; `pnpm install --frozen-lockfile` enforced in CI. Verify via Phase 5 release-engineering checks. |
| T-10.4 | Cross-runtime hash vector parity | Rust/Go/Python runtime drifts | **H** | `docs/specs/canonical-hash-vectors.json` consumed by `cross-runtime-hash-vectors.test.ts`. New runtimes self-verify against the same vectors. |
| T-10.5 | Pre-publish version consistency | accidental version drift between `package.json` and changeset | **W** | Tracked as a release-engineering check in Phase 5. Currently relies on changesets tool + manual review. |
| T-10.6 | Provenance metadata (npm/Sigstore) | published artifact lacks attestation | **G** | Phase 5 ships a recommended workflow; not enforced today. Adopters who require it can layer Sigstore on top via `PackSignature`. |

---

## §11 — DoS / memory-growth surfaces

| ID | Surface | Threat | Tier | Notes |
|---|---|---|---|---|
| T-11.1 | `AuditEventBus` subscriber count | unbounded subscribers exhaust memory | **W** | The scale harness records 500 subscribers × 5000 records → 72 MB heap delta. Heap stays under control; no leak surfaces. Adopters should cap subscribers per process (operator-console responsibility). |
| T-11.2 | Replay-record retention in memory | adopter loads a million rows | **G** | `replay()` is iterator-shaped against the adopter's row supplier; adopters control batch size. |
| T-11.3 | Kill-switch poll-loop CPU | tight poll causes CPU pressure | **H** | Default `pollMs` is 1000; documented `pubsubLatencyMs` < polling means pub/sub dominates and polling is cheap. |
| T-11.4 | Parked-envelope quota per session | adopter parks unbounded envelopes | **H** | `DEFAULT_DEFER_QUOTA_PER_SESSION` (16) enforced via INCR/DECR pair; over-quota emits `business.RULE_VIOLATED` refusal. |
| T-11.5 | Confirmation token TTL | unbounded pending confirmations | **G** | Redis-backed store accepts TTL on each store; adopters supply via the `ttlSeconds` option. |

---

## §12 — Supply-chain hardening — recommended additions

The audit endorses the following additions before the v1.0 changeset is
cut. Each is additive and ships under MINOR.

1. **`pnpm publish --provenance` enabled in the release workflow** — emits npm provenance attestations for every published package.
2. **`pnpm audit` gate in CI** — fail the release if a high-severity advisory exists in the dependency tree.
3. **`pnpm sbom-cyclonedx` artifact** — generate a CycloneDX SBOM during the release pipeline and attach to the GitHub release.
4. **`scripts/check-frozen-versions.ts`** — verify `package.json` versions match `.changeset/*.md` declared bumps before publishing.
5. **`scripts/verify-cross-runtime-vectors.ts`** — re-run the cross-runtime golden vectors during pre-publish.
6. **`scripts/api-surface-diff.ts`** — diff exported symbols against the previous release tag; CI gates that new exports are documented in `V1_FREEZE_MATRIX.md`.

These are tracked as the Phase 5 deliverables in
[`V1_FREEZE_MATRIX.md` §27](../release/V1_FREEZE_MATRIX.md#27--matrix-change-management-procedure).

---

## §13 — Out-of-scope (deliberately)

These remain adopter responsibilities; the framework's job is to make
them *addressable*, not to enforce them:

- TLS / mTLS configuration on the adopter's Redis / Postgres / NATS
  connections.
- Secret management (private keys, DB credentials, OIDC tokens).
- Identity validation upstream of the envelope (the framework's
  `IntentActor.principal` reflects the adopter's claim).
- Browser-side console RBAC (admin-sdk procedures expect identity to
  be enforced at the tRPC layer; the SDK exposes the shape, not the
  enforcement).
- Transitive npm dependency compromise (mitigated by lockfile +
  `pnpm audit`; not eliminated).

---

## §14 — Production readiness summary

| Axis | Score | Notes |
|---|---|---|
| Trust-layer review | **green** | All ed25519 + RSA-PSS code paths tested, including misuse paths. Documentation aligns with implementation. |
| Replay-ingestion review | **green** | Decision + tamper axes covered; per-axis quadrant output for operators. T-3.1 hardening tracked for v1.1. |
| Pack verification review | **green** | Manifest + fingerprint + signature + policy compose cleanly; CLI surface tested end-to-end. |
| Supply-chain posture | **yellow** | Posture is good; the formal pipeline (provenance, SBOM, advisory gate) ships in Phase 5. |
| DoS resilience | **green** | Memory caps, quotas, TTLs, and convergence guarantees all documented and tested. |
| Provider-neutral isolation | **green** | Loop and bridge boundary verified; provider packages stay <200 LOC SDK shims. |

No fix-tier findings outstanding. v1.0-RC certification can proceed
on the security axis pending Phase 5's release-engineering pipeline
landing the supply-chain checks.
