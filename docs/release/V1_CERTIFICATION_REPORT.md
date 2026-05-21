# V1.0 Release-Candidate Certification Report

> Final RC certification, generated 2026-05-21 against
> `claude/unruffled-bassi-305034` at HEAD `bddf704`. Companion to
> [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md),
> [`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md),
> [`docs/security/V1-SECURITY-AUDIT.md`](../security/V1-SECURITY-AUDIT.md),
> [`docs/perf/v1-rc-baselines.md`](../perf/v1-rc-baselines.md), and
> [`docs/perf/scale-baselines.json`](../perf/scale-baselines.json).

This is the final document the RC certification reads against. It
states explicitly which invariants are verified, which operational
evidence is captured, where the public API freezes, where the security
posture lands, and what residual risks remain.

---

## §1 — Invariant Verification

Every load-bearing invariant the framework documents in
[`docs/architecture/decisions.md`](../architecture/decisions.md) and
[`AI_CONTEXT.md`](../../AI_CONTEXT.md) §"Critical invariants" is
preserved and tested at the RC cut.

| # | Invariant | Status | Tests anchoring it |
|---|---|---|---|
| 1 | LLM has zero mutation authority | **preserved** | `core/tests/llm/planner.test.ts`, integration tests across packs |
| 2 | Closed Decision algebra (6 outcomes) | **preserved** | `core/tests/kernel/invariants/`, `core/tests/api-surface.test.ts` (new) |
| 3 | Guard order `state → taint → auth → business` | **preserved** | `core/tests/kernel/invariants/guard-order.test.ts` |
| 4 | `intentHash` excludes `createdAt`, includes `nonce` | **preserved** | `core/tests/kernel/invariants/v2-hash-stability.property.test.ts`, `core/tests/cross-runtime-hash-vectors.test.ts` |
| 5 | Determinism (no clock, no RNG inside `adjudicate()`) | **preserved** | `core/tests/kernel/invariants/replay-determinism.property.test.ts` |
| 6 | Fail-closed semantics (throwing guard → SECURITY REFUSE) | **preserved** | `core/tests/kernel/invariants/guard-panic.property.test.ts` |
| 7 | Wire-format stability (IntentEnvelope v2, AuditRecord v4) | **preserved** | `core/tests/kernel/invariants/schema-version-fuzz.property.test.ts`, JSON Schema in `docs/specs/intent-envelope-v2.schema.json` |
| 8 | AuditRecord schema additive across minors | **preserved** | `audit-postgres/tests/replay.test.ts` (v1/v2/v3/v4 round-trip) |
| 9 | UNTRUSTED never reaches EXECUTE on protected kinds | **preserved** | `core/tests/kernel/invariants/untrusted-never-executes.property.test.ts`, `conformance/tests/untrusted-never-executes.test.ts` |
| 10 | Canonical hashing (RFC 8785 JCS) byte-stable | **preserved** | `core/tests/cross-runtime-hash-vectors.test.ts` (consumes `docs/specs/canonical-hash-vectors.json`) |
| 11 | Audit immutability + tamper detection | **preserved + extended** | `verifyAuditRecord`, `replayWithIntegrity`, chaos-replay tests |
| 12 | Provider neutrality (loop never inspects history `H`) | **preserved** | `adapter-core/tests/loop.test.ts`, cross-provider PIX parity tests |
| 13 | Pack isolation (no Pack mutation primitives) | **preserved** | `pack-trust.test.ts`, `conformance/tests/runner.test.ts` |
| 14 | Deterministic event ordering on the audit bus | **verified at scale** | `bench/src/scale/scale.test.ts` (0 ordering violations across 500 subs × 5000 records) |
| 15 | Semantic convention stability (`SEMCONV` under `adjudicate.*`) | **preserved + extended additively** | `observability/tests/semconv.test.ts`, v0.7 added 8 new keys without renames |

**Replay-classification rule.** Every audit row produced at any released
version classifies as `IDENTICAL` or `BASIS_ONLY` when replayed at the
RC. Cross-version replay coverage:

- v1 rows → `legacyV1ToV2` shim synthesizes v2 envelopes; Decision-axis
  comparison is meaningful.
- v2/v3/v4 rows → direct readback; `replay()` and `replayWithIntegrity()`
  both report cleanly.
- 100 corrupted envelopes through `replayWithIntegrity` → all surface as
  per-axis integrity failures, no crashes
  (`audit/tests/chaos-replay.test.ts`).

---

## §2 — Operational Evidence

The two adopter-evidence items called out at v0.7 cut were
"production-scale" rather than "in-process simulation". The RC effort
adds a deterministic, machine-readable scale harness that pins the
framework's behavior under realistic load shapes. **Real-world adopter
latency profiles remain the closing gate** for the v1.0 changeset
itself.

### §2.1 — AuditEventBus scale evidence

| Scenario | Configuration | Result |
|---|---|---|
| `audit-bus-light` | 32 subs × 200 records, 1 reconnect cycle, 5 malformed injections | 4/4 invariants PASS, 0 ordering violations, 0 listener leaks |
| `audit-bus-heavy` | 500 subs × 5000 records, 2 reconnect cycles, 50 malformed injections, slow-consumer fraction | 4/4 invariants PASS, p99 fan-out latency 5.5 ms, 0 ordering violations |
| `bench/src/scale/scale.test.ts` (CI smoke) | 16 subs × 64 records, with + without chaos | All 2 CI-light cases PASS in every commit |

Invariants asserted:

- **bus-no-crash-under-malformed** — malformed payloads never crash any subscriber.
- **bus-ordering-preserved** — every subscriber sees records in monotonic publish order.
- **bus-reconnect-survives** — reconnect storm completes without throwing.
- **bus-listener-cleanup** — after unsubscribe, the underlying pubsub holds zero listeners on the channel (asserts no leak).

### §2.2 — Kill-switch v2 propagation evidence

| Scenario | Configuration | Result |
|---|---|---|
| `kill-light` | 8 replicas × 16 transitions, 50 ms partition, 1 reconnect cycle, 1 crash, 1 late boot | 4/4 invariants PASS, propagation p99 95.88 ms, 0 split-brain |
| `kill-heavy` | 64 replicas × 100 transitions, 200 ms partition, 3 reconnect cycles, 5 crashes, 4 late boots | 4/4 invariants PASS, propagation p99 98.20 ms, 0 split-brain |

Invariants asserted:

- **kill-no-split-brain** — every live replica's terminal state matches the canonical writer.
- **kill-pubsub-convergence** — every transition converges within `pollMs * 5` budget.
- **kill-late-boot-resync** — late-booting replicas catch up via boot poll.
- **kill-fallback-after-partition** — polling fallback re-establishes convergence after partition.

### §2.3 — WebSocket resilience evidence

`apps/console` continues to poll at 2 s in v0.7; the bus migration is
console-side work that doesn't gate the back-end. The RC artifacts
above prove the bus primitive holds under the shapes a real WebSocket
fan-out exhibits.

### §2.4 — Replay resilience evidence

- `chaos-replay.test.ts`: 100 corrupted envelopes through replay; all
  surface as integrity failures, none crash, decision-axis still
  emitted.
- `chaos-replay.test.ts`: concurrent replay of 1000 records, 5 parallel
  passes → byte-identical reports.
- `replay-integrity.test.ts`: per-axis (decision / envelope-hash /
  audit-hash) quadrant rendering tested.

---

## §3 — Public API Freeze Assessment

The freeze matrix at [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md)
classifies every public surface. Summary by tier:

| Tier | Count (approx.) | Notable surfaces |
|---|---|---|
| **frozen** | ~280 symbols across 16 packages | Every load-bearing kernel type, every wire-format helper, every provider-neutral contract, every CLI command, every Pack contract field. |
| **experimental** | 4 primitives | `createConfirmGuard`, `createEscalateGuard`, `createIdempotencyGuard`, `createRewriteGuard` (ADR-108; awaits Pack #4–#6 feedback). |
| **evidence-gated** | 4 surfaces | `startDistributedKillSwitchPubSub` defaults, `AuditEventBus` reconnect-backoff, `verifyParkedHash` default mode, kill-switch `pollMs` default. Surfaces themselves are frozen; only option defaults gate on evidence. |
| **deprecation-target** | 3 symbols | `nameGuard`, `AnthropicAdapterError`/`AnthropicAdapterErrorCode`, `BASIS_CODES.kernel.DEADLINE_EXCEEDED` alias. All scheduled for v2.0 removal with codemod support. |
| **internal-only** | every non-barrel file | No adopter-visible contract. |

Frozen-surface verification: `packages/core/tests/api-surface.test.ts`
(new) asserts that every documented `frozen` symbol is present on the
exported barrel. Drift fails CI.

Advisory surface coverage: `pnpm check:freeze-matrix` walks every
package's `src/index.ts` against the matrix's backticked-symbol set.
Today the matrix references ~464 identifier-shaped tokens against 433
actual exports; the gap is matrix-prose vs symbol-list and is tracked
as a v1.1 hardening (the check ships advisory; strict mode opt-in via
`--strict`).

---

## §4 — Security Assessment

The audit lives at [`docs/security/V1-SECURITY-AUDIT.md`](../security/V1-SECURITY-AUDIT.md).
Summary:

| Axis | Score | Rationale |
|---|---|---|
| Trust-layer review | **green** | ed25519 + RSA-PSS code paths tested, including misuse paths. Documentation aligns with implementation. |
| Replay-ingestion review | **green** | Decision + envelope-hash + audit-hash axes all covered. T-3.1 (optional row-shape validation in Postgres reader) tracked for v1.1. |
| Pack verification review | **green** | Manifest + fingerprint + signature + policy compose cleanly; CLI end-to-end tested. |
| Supply-chain posture | **yellow** | npm provenance + Syft SBOM + Sigstore attestation already in release workflow. CI gates added at RC: version consistency, freeze-matrix consistency, advisory audit. |
| DoS resilience | **green** | Memory caps, quotas, TTLs, and convergence guarantees documented and tested. |
| Provider-neutral isolation | **green** | Loop / bridge boundary preserved. Provider packages stay <200 LOC SDK shims. |

No fix-tier findings outstanding.

---

## §5 — Production Readiness Score

| Axis | Score | Notes |
|---|---|---|
| **Stability** | ✅ ready | Kernel API frozen through v0.5 → v0.7; freeze matrix codifies every public surface for v1.0. |
| **Replay trust** | ✅ ready | Cross-runtime golden vectors in spec; envelope-hash + audit-hash tamper axes verified; operator-readable report formats. |
| **Observability** | ✅ ready | SEMCONV 16 stable attributes; adapter-loop `TraceSink` ships; `GuardFireStats` + `LearningSink` slots in place. |
| **Scalability** | ✅ ready (in-process) | Scale harness pins fan-out and propagation invariants; real-Redis latency profile remains the adopter-side gate for option defaults. |
| **Ecosystem safety** | ✅ ready | Pack trust primitives + manifest validation + CLI verify. Hosted registry indexer remains future work (design-only). |
| **Migration readiness** | ✅ ready | `legacyV1ToV2` shim, additive schema, codemod runner, upgrade playbook. |
| **Release engineering** | ✅ ready | npm provenance, SBOM, Sigstore attestation, version-consistency check, scale baselines artifact in CI. |
| **Operational resilience** | ✅ ready | Kill-switch v2 + chaos suites + scale harness; restart-durable confirmations; fail-closed semantics under partition. |

---

## §6 — Remaining Risks (evidence-backed only)

The RC mandate forbids speculative-fear lists. The following are
recorded as residual risk because they correspond to specific evidence
the framework does not yet have.

### §6.1 — Real-Redis kill-switch latency profile

**Risk:** in-process simulation places propagation p99 at 98.20 ms
(dominated by the 100 ms polling fallback). A real Redis cluster adds
network hop latency on top. Adopters running across regions may see
p99 in the 200 ms ballpark; the kernel still gates fail-closed on the
in-process snapshot, so the risk is **mitigation-latency**, not
correctness.

**Resolution path:** one adopter latency profile published to the
project. ADR-114 already documents the convergence model; the v1.0
changeset cuts once at least one adopter confirms the profile is
acceptable for their use case.

### §6.2 — Real-WebSocket AuditEventBus throughput

**Risk:** the bus is best-effort; sustained 1000+ subscriber loads
have not been adopter-verified. The in-process harness handles 500
subscribers × 5000 records at p99 5.5 ms; real WebSocket marshalling
adds 1–5 ms per delivery typically.

**Resolution path:** one adopter wires the bus into their operator
console under WebSocket fan-out and reports the operator-experience
numbers (per-event delivery p99, sustained-subscriber count cap).

### §6.3 — `verifyParkedHash` default flip

**Risk:** today's default is `"warn"`. Production should tighten to
`"strict"` before v1.0 cuts. Today's permissive default fails closed on
tampered blobs but accepts legacy blobs without verification fields.

**Resolution path:** one rolling-deploy across an adopter's parked-DEFER
queue confirming no legacy blobs remain. Flip is a one-line MINOR.

### §6.4 — L2 stability tier for the four newer primitives

**Risk:** `createConfirmGuard`, `createEscalateGuard`,
`createIdempotencyGuard`, `createRewriteGuard` ship as `@experimental`.
Adopters who build against them today may see signature shifts at v1.1.

**Resolution path:** Pack #4–#6 feedback. At least two new Packs
consuming each primitive before promotion to `frozen` at v1.1.

### §6.5 — Hosted Pack registry indexer

**Risk:** manifest validation + trust primitives + CLI verify all
ship. The hosted indexer that crawls npm and lists conformant Packs is
still design-only. Adopters install Packs directly from npm without an
intermediary; this is the right shape for v1.0 but limits
discoverability.

**Resolution path:** post-v1.0 ecosystem work. Tracked under Priority 3
in [`PROJECT_STATUS_AND_NEXT_STEPS.md`](../../PROJECT_STATUS_AND_NEXT_STEPS.md).

---

## §7 — Verdict

The framework is **certified for v1.0-RC**. The foundation is
v1.0-ready for adopters who treat the framework as a per-decision
substrate (the intended use). The v1.0 changeset itself cuts once one
adopter publishes latency evidence for either the kill-switch v2
propagation or the AuditEventBus WebSocket fan-out (§6.1 / §6.2).

All other surfaces — kernel API, wire formats, Pack contracts,
provider adapters, observability conventions, replay machinery, audit
records, trust primitives, semver policy — are frozen per
[`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md).

The RC pipeline runs via `pnpm rc:check` and `.github/workflows/release-candidate.yml`.
The full RC evidence package ships as four documents:

- [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md)
- [`V1_CERTIFICATION_REPORT.md`](./V1_CERTIFICATION_REPORT.md) (this file)
- [`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md)
- [`docs/security/V1-SECURITY-AUDIT.md`](../security/V1-SECURITY-AUDIT.md)
- [`docs/perf/v1-rc-baselines.md`](../perf/v1-rc-baselines.md)
- [`docs/perf/scale-baselines.json`](../perf/scale-baselines.json) (machine-readable)

---

## §8 — Sign-off checklist (for the v1.0 changeset)

The following items are recommended before the v1.0 changeset is cut:

1. **Adopter latency evidence (§6.1 OR §6.2)** — at least one adopter publishes a real-deployment latency profile for the kill-switch v2 or the AuditEventBus.
2. **`verifyParkedHash` default flip (§6.3)** — flip to `"strict"` once §6.1 or §6.2 is satisfied; ship as a MINOR with changelog note.
3. **Package version alignment** — flip every `0.1.0` workspace package to `1.0.0` via one changeset (per [`V1_FREEZE_MATRIX.md` §24](./V1_FREEZE_MATRIX.md#24--version--package-state-advisory)).
4. **Freeze matrix symbol completeness** — sweep the matrix tables so `pnpm check:freeze-matrix --strict` passes.
5. **Deprecation calendar update** — `deprecations.md` cites the v2.0 removal targets for `nameGuard`, `AnthropicAdapterError`, and the `kernel.DEADLINE_EXCEEDED` alias.

None of these is a fix-tier finding; they are the discipline items
that come with cutting v1.0 itself. The RC certification stands
regardless.
