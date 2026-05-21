# Project Status & Next Steps

> Single source of truth for adjudicate's current state and remaining work.
> Updated on every minor release.

## Current state

`v0.7` — operational hardening + ecosystem trust cut. **1022 tests passing, 0 failing, 1 skipped.** Kernel API frozen; v0.6 adapter-core extraction held; v0.7 additions are all opt-in primitives. The framework is pre-v1.0 ready pending two adopter-evidence items (see V0.7-AUDIT-REPORT.md "Operational evidence required before v1.0").

Authoritative v0.7 review: [`docs/architecture/V0.7-AUDIT-REPORT.md`](docs/architecture/V0.7-AUDIT-REPORT.md).

| Layer | Status | Footprint |
|---|---|---|
| L1 Kernel — `@adjudicate/core` | shipped | `adjudicate()`, `adjudicateWithTrace()`, `adjudicateAndAudit()`, `PolicyBundle`, 8-layer guard ordering, taint lattice, replay safety, `verifyAuditRecord` |
| L2 Risk primitives — `@adjudicate/primitives` | shipped | 7 factories (threshold / state-defer / system-taint / rewrite / confirm / escalate / idempotency) |
| L3 Domain Packs | partial | PIX (lighthouse), KYC (async + AML), Deployments (gates). `vacation-approval` + `commerce-reference` examples remain handwritten. |
| L4 Adapter core — `@adjudicate/adapter-core` | shipped (v0.6, extended v0.7) | Provider-neutral loop, bridge, decision translator, persistence shims (memory + Redis), `TraceSink` lifecycle hooks, error taxonomy (ADR-113) |
| L5 Anthropic adapter — `@adjudicate/anthropic` | shipped | Thin Anthropic SDK shim over adapter-core; public API preserved across v0.5 → v0.6 |
| L5 OpenAI adapter — `@adjudicate/openai` | shipped (v0.6) | Reference OpenAI Chat Completions integration; structural `OpenAIChatLikeClient` (no hard SDK dep) |
| Observability — `@adjudicate/observability` | shipped (extended v0.7) | OTLP-shaped sinks + stable `SEMCONV` constants; 8 new lifecycle attributes |
| Conformance — `@adjudicate/conformance` | shipped (extended v0.7) | `runConformance(pack)`, `validatePackManifest`, **Pack trust primitives** (`computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`, `verifyPackTrust`) (ADR-115) |
| Analyzer (Tier 1) — `@adjudicate/analyze` | shipped | 6 metadata analyzers (AJD-101..AJD-106), SARIF 2.1.0 |
| Analyzer (Tier 2 AST) — `@adjudicate/analyze` | shipped (v0.6) | `AJD-201` REWRITE scope check via `ts-morph`; source-located diagnostics |
| AuditRecord v4 | shipped | `auditHash`, `signature` seam, `policyVersion`, `kernelVersion` (ADR-111) |
| Distributed kill switch | shipped (v1 + v2) | v1 polling helper (`startDistributedKillSwitch`); v2 pub/sub + polling fallback (`startDistributedKillSwitchPubSub`, ADR-114) |
| Audit event substrate | shipped (v0.7) | `AuditEventBus` interface, `createInMemoryAuditEventBus`, `createRedisAuditEventBus`, `bridgeAuditSinkToBus` |
| Replay + integrity verifier | shipped (v0.7) | `replayWithIntegrity` adds envelope-hash + audit-hash tamper checks; `explainReplayReport` formats |
| Cross-runtime golden vectors | shipped (v0.7) | `docs/specs/canonical-hash-vectors.json` + consumer test |
| `adjudicate pack verify` CLI | shipped (v0.7) | install-time + CI-gate; modes: `none | best_effort | require_fingerprint | require_signature` |
| Hosted control-plane architecture | docs only | `docs/architecture/hosted/`, not yet implemented |
| Pack registry indexer | deferred | npm-tag convention locked; hosted indexer pending |
| Vercel AI / additional adapters | deferred | adapter-core makes adding new adapters a < 200-line PR |

See `.changeset/v0.5-foundation-safety-analyzer.md` for the line-by-line v0.5 inventory.

## Open work, ordered by leverage

### Priority 1 — adopter-evidence (blocks v1.0)

- **Real-world kill-switch v2 propagation latency.** Sub-100 ms holds in lab; needs a multi-replica production deployment to confirm. Once an adopter reports the latency profile, freeze the API and cut v1.0.
- **Real-world `AuditEventBus` throughput under WebSocket fan-out.** Primitives in place (`createRedisAuditEventBus` + `bridgeAuditSinkToBus`); needs an adopter wiring it into a console with hundreds of concurrent operator sessions.

### Priority 2 — operational scalability (remaining)

- **Console real-time tail migration.** v0.7 ships the `AuditEventBus` primitive. The reference console at `apps/console` still polls every 2 s — migration to the bus + a WebSocket bridge is a console-side task that doesn't block back-end work.
- **End-to-end "restart mid-flow" integration test.** `parkDeferredIntent` (Redis) + `createRedisConfirmationStore` (Redis, v0.7) cover both pause kinds. A combined test that restarts the process and verifies all paused state resumes correctly is pending.

### Priority 3 — ecosystem (next)

- **Pack registry indexer.** Manifest validation + trust primitives + CLI verify all ship in v0.6/v0.7. The hosted indexer that crawls npm and lists conformant Packs is still design-only.
- **Sigstore / OIDC / Rekor integration.** v0.7 trust primitives are local + algorithm-agnostic. Adopters wanting Sigstore-style transparency layer it on top by mapping the attestation format to `PackSignature`.
- **CI workflow validation.** `.github/workflows/{ci,release,security-codescan}.yml` ship as templates but were not exercised against a real org. Validate when `@adjudicate` org claim closes.
- **Vercel AI SDK adapter.** With `@adjudicate/adapter-core` extracted, adding a third provider is a < 200-line PR (one bridge + one renderer). Pending adopter demand.

### Priority 3 — invariant-strengthening (remaining)

- **`@adjudicate/migrate` codemod expansion.** Only one codemod ships (`nameGuard → withMetadata`). Future deprecations need codemods at the same release as the `@deprecated` marker.
- **Tier 2 analyzer expansion.** `AJD-201` (REWRITE scope) ships in v0.6. Future Tier 2 analyzers: `AJD-202` basis-vocabulary AST check, `AJD-203` guard-ordering AST check (catch guards declared in the wrong phase).

### Priority 4 — DX / surface refinement (remaining)

- **`PolicyConfig` externalised tunables.** Tunable thresholds (KYC scores, PIX caps) are hard-coded today. Defer until the first adopter hits the gap; do not speculate.
- **Outcome reconciliation API (`recordOutcome`).** `LearningSink` substrate is in place. Adding the canonical sink is one ticket but with no consumer no value lands. Pair with the first adopter who needs calibration.

### Shipped in v0.6 (do not re-litigate)

- Adapter-core extraction + OpenAI adapter (largest single adoption unlock).
- Tier 2 AST analyzer (REWRITE scope check, source-located diagnostics).
- `KERNEL_REFUSAL_CODES` includes `guard_panic`; conformance overlay removed.
- `assertPackConformance` vs `runConformance` split documented prominently in `packages/core/src/pack-conformance.ts`.
- `explainRecord` supersession narration + `mergeExplanationRegistries`.
- `validatePackManifest` + `crossCheckPackVsManifest` primitives.

### Shipped in v0.7 (do not re-litigate)

- Distributed kill switch v2 — Redis pub/sub + polling fallback. ADR-114. Sub-100 ms propagation, polling retained, boot resync, multi-replica convergence verified.
- Real-time audit event substrate — `AuditEventBus` + `bridgeAuditSinkToBus`. Best-effort fan-out; durable sinks unchanged.
- Restart-durable `createRedisConfirmationStore` in adapter-core.
- Pack trust primitives — `computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`, `verifyPackTrust`. ADR-115.
- `adjudicate pack verify` CLI command.
- `replayWithIntegrity` + `explainReplayReport` — tamper detection in one pass, operator-readable narration.
- Cross-runtime golden vectors — `docs/specs/canonical-hash-vectors.json`.
- Adapter loop `TraceSink` — low-cardinality lifecycle events.
- 8 new low-cardinality `SEMCONV` attributes for adapter/provider/pause/kill-switch lifecycle.
- Chaos test suites: `chaos-kill-switch.test.ts`, `chaos-replay.test.ts` — burst-of-malformed, disconnect/reconnect, trip-storm, multi-replica race, corrupted envelopes.
- Operational risk map + v1.0 readiness review — `docs/architecture/V0.7-AUDIT-REPORT.md`.

## Architectural concerns

- **Wire format change risk before JSON Schema saturation.** Any envelope-shape change (confidence, supersession-on-envelope, taint opacity) must land *after* its JSON Schema and golden vectors, or external-runtime replay breaks. The current `intent-envelope-v2.schema.json` + `canonical-json-hash.md` (with Python cross-runtime check) is the discipline that protects this.
- **Closed enum doctrine on `Decision`.** Six outcomes is the load-bearing closed vocabulary. Resist `Decision.metadata?: Record<string, unknown>` escape hatches and `Decision.confidence` field-level proposals. Extend the closed enum deliberately if needed.
- **L2 stability tier.** The four newer primitives (`createRewriteGuard`, `createConfirmGuard`, `createEscalateGuard`, `createIdempotencyGuard`) ship as `0.x` minor-unstable per ADR-108. Confirm whether v1.0 freezes them as-is OR redesigns based on Pack #4–#6 feedback.
- **Default `verifyParkedHash: "warn"` mode.** Pre-v1.0 should tighten to `"strict"`. Today's default is permissive: tampered blobs fail-closed, but legacy blobs without verification fields still resume.

## Explicitly rejected (do not re-litigate without an ADR)

- **YAML/JSON Pack DSL.** Pack authors stay in TypeScript; `GuardMetadata` carries the declarative content. The 1980s shell ecosystem died of DSL proliferation.
- **Post-hoc LLM output filter (resurrecting `forbiddenConcepts` as a kernel feature).** The framework is not in content-moderation business. Adopters who need it run their own filter.
- **`record.explain()` method on `AuditRecord`.** Records are values; methods kill JSON round-trip. Ship as free function `explainRecord(record, registry)`.
- **`Decision.confidence` as a field.** Widens the closed enum. If needed, surface as envelope metadata excluded from `intentHash`.
- **Edge-deployed adjudication / sovereign AI compute / agent service mesh.** 2026-evidence-failed shifts. Adjudicate is a per-decision substrate, not a federation layer.
- **MCP-server-style separate Pack registry.** Packs ship via npm; that's correct.

## Maturity ladder (per `docs/concepts.md §9`)

| Layer | Status |
|---|---|
| L1 Kernel | shipped, frozen API |
| L2 Risk primitives | shipped, 7 factories |
| L3 Domain Packs | 3 shipped (PIX, KYC, deployments), more pending |
| L4 Observability / governance | partial — sinks shipped, console + dashboards iterating |

## Verification

```bash
pnpm install
pnpm test       # 1022 passing, 1 skipped, 0 failing
pnpm -F @adjudicate/cli run analyze --pack ../pack-payments-pix
pnpm -F @adjudicate/cli run adjudicate pack verify ./packages/pack-payments-pix
git tag -l "v0.*"
```
