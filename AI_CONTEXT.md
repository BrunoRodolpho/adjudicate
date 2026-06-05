# AI_CONTEXT

> Optimized for AI agents reading this repo cold. Senior-engineer-grade brief
> on architecture, invariants, where to make changes safely, and where not to.

## System purpose

`adjudicate` is a **decision kernel for LLM-proposed actions**. An LLM generates a structured `IntentEnvelope`. The kernel runs it through an ordered `PolicyBundle` and returns one of six `Decision` outcomes: `EXECUTE`, `REFUSE`, `DEFER`, `ESCALATE`, `REQUEST_CONFIRMATION`, `REWRITE`. Adopters wire only `EXECUTE` to their executor. The LLM has zero authority to mutate state.

`DEFER` and `REWRITE` are the load-bearing differentiators — they are decisions policy engines (OPA, Cedar) and function-calling frameworks cannot express.

## Repo map

TypeScript monorepo, pnpm workspaces, Node ≥ 20, Vitest, ESLint 9, strict TS.

```
packages/
  core/                    @adjudicate/core — kernel + types. /kernel + /llm subpath exports.
  primitives/              @adjudicate/primitives — L2 guard factories.
  runtime/                 @adjudicate/runtime — park/resume for DEFER.
  audit/                   @adjudicate/audit — Ledger + AuditSink + replay harness.
  audit-postgres/          @adjudicate/audit-postgres — reference Postgres sink.
  admin-sdk/               @adjudicate/admin-sdk — Zod-validated read AQI + tRPC router.
  observability/           @adjudicate/observability — OTLP MetricsSink / LearningSink / SEMCONV.
  conformance/             @adjudicate/conformance — runConformance(pack) AC-001..AC-006 + manifest validation.
  analyze/                 @adjudicate/analyze — Tier 1 + Tier 2 AST analyzers AJD-101..AJD-201, SARIF.
  migrate/                 @adjudicate/migrate — ts-morph codemod runner.
  adapter-core/            @adjudicate/adapter-core — provider-neutral loop, bridge, decision translator, persistence.
  anthropic/               @adjudicate/anthropic — thin Anthropic SDK shim over adapter-core.
  openai/                  @adjudicate/openai — thin OpenAI SDK shim over adapter-core.
  cli/                     @adjudicate/cli — `adjudicate` CLI (12 commands).
  pack-payments-pix/       Lighthouse Pack (Brazil PIX). Exercises every outcome.
  pack-identity-kyc/       Async-multistage + AML escalation + taint defense.
  pack-deployments-approval/  Deploy gates: ESCALATE on prod-no-approval, REQUEST_CONFIRMATION on rollback.
  locales-pt-BR/           Brazilian Portuguese refusal-message map.
  eslint-config/           Shared ESLint rules (internal).

apps/
  console/                 Operator Console (Next.js, port 5180). Audit Explorer, dashboard, governance, control.
  web/                     Marketing + live playground (Next.js, port 5181). Adjudicate intents through real kernel.

examples/
  quickstart-anthropic/    End-to-end Anthropic API demo against PIX Pack.
  vacation-approval/       Neutral hello-world. 1 PolicyBundle, 6 decisions, 6 tests.
  commerce-reference/      Cart → checkout → payment lifecycle.

bench/                     Vitest microbenchmarks (kernel.bench.ts, audit.bench.ts).
docs/
  architecture/            ADRs (ADR-101..ADR-116), 8-layer defense, hosted topology.
  concepts.md              Mental model. Start here.
  guides/                  Testing your policy. (Scenario fixtures + simulate.)
  release/                 Semver, API surface, deprecations.
  perf/                    v0.2 microbench baselines (>200× SLO headroom).
  ops/runbooks/            4-stage shadow → enforce rollout playbook (IbateXas example; generalize for your domain).
  security/                Threat model + review checklist.
  compliance/              SOC 2 mapping + shared responsibility matrix.
  pack-ecosystem/          Registry foundations + signing design (design only, not built).
  specs/                   IntentEnvelope v2 JSON Schema + canonical-JSON hash spec (RFC 8785 JCS).
PROJECT_STATUS_AND_NEXT_STEPS.md  Authoritative remaining-work snapshot.
```

## Runtime flow

```
adopter HTTP/webhook
  └─> CapabilityPlanner.plan(state, context)        # which tools/intents are visible this turn
      └─> LLM (sees only allowed surface)
          └─> IntentEnvelope (kind, payload, actor, taint, intentHash)
              └─> adjudicateAndAudit(envelope, state, policy, deps)
                  ├─> ordered guards:
                  │   1. stateGuards       (state-machine validity)
                  │   2. taint policy      (system-only kinds, UNTRUSTED rejection)
                  │   3. authGuards        (capability check)
                  │   4. business guards   (domain rules; first non-null wins)
                  │   5. policy.default    (fall-through; convention: REFUSE)
                  ├─> Ledger.checkAndRecord (hot-path dedup, replay suppression)
                  └─> AuditSink.emit       (cold-path durable governance record)
              └─> Decision: EXECUTE | REFUSE | DEFER | ESCALATE | REQUEST_CONFIRMATION | REWRITE
                  └─> Adapter dispatches:
                      EXECUTE → adopter executor (real side-effect)
                      DEFER → parkDeferredIntent → wait for signal → resume
                      REQUEST_CONFIRMATION → confirmationStore → user → resume with receipt
                      REWRITE → re-adjudicate the sanitized envelope
                      REFUSE/ESCALATE → adopter handler (no state change)
```

Park/resume cycle uses `deferResumeHash` + `verifyParkedEnvelopeHash` for tamper detection on persistence (`verifyParkedHash: "warn" | "strict" | "off"`).

## Key concepts

- **IntentEnvelope v2.** Wire-format frozen. JSON Schema at `docs/specs/intent-envelope-v2.schema.json`. `intentHash` = RFC 8785 JCS over `{version, kind, payload, nonce, actor, taint}` — `createdAt` is **excluded** from the hash; `nonce` is the load-bearing idempotency key.
- **Taint lattice.** `SYSTEM > TRUSTED > UNTRUSTED` (closed enum `Taint = "SYSTEM" | "TRUSTED" | "UNTRUSTED"`; ranks 3 > 2 > 1). The taint policy declares which intent kinds are *system-only* (e.g., webhook callbacks). LLM-proposed envelopes are always `UNTRUSTED`.
- **Pack (`PackV0`).** A self-contained domain bundle: `id`, `version`, `contract: "v0"`, `intents`, `policy: PolicyBundle`, `planner: CapabilityPlanner`, `basisCodes`, optional `signals` (DEFER resume triggers), optional `handlers` (post-EXECUTE side-effects).
- **GuardMetadata.** Guards attach metadata via `withMetadata(guard, { name, scenario, description })`. The analyzer (`@adjudicate/analyze`) and visualizer consume `readGuardMetadata(guard)`. Hand-written guards may leave `{ kind: "opaque" }`.
- **`AuditRecord` v4.** Additive over v3: `policyVersion`, `kernelVersion`, `auditHash`, `signature` seam. `verifyAuditRecord` re-derives the hash; pre-v4 records return `{ verified: null, reason: "missing_hash" }`.
- **Supersession (v3+).** REQUEST_CONFIRMATION → resolve, DEFER → resume, REWRITE → execute, replay all carry `supersedes: { predecessorIntentHash, predecessorAt, reason, token? }`. Lives only on `AuditRecord`, never on `Decision` (that would break short-circuit invariants).
- **`adjudicate()` is synchronous and pure.** No `Date.now()`, no `Math.random()`, no I/O. Wallclock and ledger come from `deps` in `adjudicateAndAudit`. Tests pin determinism on this.

## Critical invariants (load-bearing — break these and security is gone)

1. **LLM has zero mutation authority.** Every state mutation crosses `adjudicateAndAudit`. The `executor` only runs on `EXECUTE`.
2. **Closed Decision algebra.** Six outcomes. Do not widen to add `metadata: Record<string, unknown>` or `confidence` field-level. Extend the enum deliberately if needed.
3. **Guard evaluation order = `state → taint → auth → business → default`.** Documented in `docs/architecture/decisions.md` and pinned by `packages/core/tests/kernel/invariants/`. Reordering breaks security assumptions of every Pack written against the documented order.
4. **`intentHash` excludes `createdAt`; includes `nonce`.** Same logical envelope at two timestamps hashes identically — required for ledger dedup. `nonce` is the idempotency key.
5. **Determinism.** Kernel takes no clock or RNG. Adopters provide clocks via `deps`; tests assert byte-identical replay.
6. **Fail-closed.** A throwing guard becomes `SECURITY` REFUSE with `kernel.GUARD_PANIC` basis. Never propagates. (ADR-106.)
7. **Replay-safe wire format.** `IntentEnvelope v2` and `canonical-json-hash.md` are normative specs. Any envelope-shape change ships **with** schema + golden vectors, or external runtimes lose round-trip.
8. **`AuditRecord` schema is additive across minor versions.** v1/v2/v3/v4 readable side-by-side. Bump version + add optional fields only.

## Entry points

- **Kernel call sites:** `packages/core/src/kernel/adjudicate.ts` (pure) and `packages/core/src/kernel/adjudicate-and-audit.ts` (wraps with ledger + sinks).
- **Pack registration:** `installPack(pack)` in `packages/core/src/install.ts` — validates contract, extracts signal map, freezes policy.
- **CLI:** `pnpm adjudicate <command>` → `packages/cli/src/bin.ts`. Commands: `pack init`, `pack lint`, `pack verify`, `analyze`, `simulate`, `repl`, `replay`, `export`, `visualize`, `doctor`, `dev`, `reap`, `scenarios generate`.
- **Admin tRPC:** `apps/console/src/app/api/admin/trpc/[trpc]/route.ts` proxies to `@adjudicate/admin-sdk`. Audit query, kill switch, replay verification.
- **Playground HTTP:** `apps/web/src/app/api/playground/{adjudicate,policy,outcome-distribution}/route.ts`.
- **Adapter loop:** `createAdjudicatedAgent` in `packages/adapter-core/src/loop.ts`. Provider-neutral tool-use loop + DEFER/CONFIRMATION stores. Anthropic and OpenAI adapters are thin SDK shims that supply a `ProviderBridge<H>`.
- **Anthropic adapter:** `createAdjudicatedAgent` in `packages/anthropic/src/adapter.ts` re-exports the adapter-core loop wired to a `ProviderBridge<MessageParam[]>`.
- **OpenAI adapter:** `createAdjudicatedAgent` in `packages/openai/src/adapter.ts` re-exports the adapter-core loop wired to a `ProviderBridge<OpenAIMessage[]>`. The structural `OpenAIChatLikeClient` interface accepts the official `openai` SDK or any conforming object.

## How to safely modify

| Change | Where | Caution |
|---|---|---|
| Add an L2 guard factory | `packages/primitives/src/` + `index.ts` re-export | Attach `GuardMetadata` so analyzer covers it. Add invariant tests. |
| Add a new Pack | `packages/pack-<domain>/` | Mirror PIX layout: `index.ts` (Pack metadata), `policy.ts` (guards + planner + taint), `types.ts`. Use `safePlan(planner, classification)` for read-only enforcement. |
| Add an analyzer | `packages/analyze/src/analyzers/` | Allocate `AJD-1NN`. Tier 1 = metadata-driven (no execution). Update `docs/architecture/adr/ADR-109` catalog. |
| Add a CLI command | `packages/cli/src/commands/<name>.ts` + register in `bin.ts` | Add Vitest scenario. |
| Add a basis code | `packages/core/src/basis-codes.ts` | Closed vocabulary. Bump conformance + AJD-103 if a Pack uses it. |
| Bump `AUDIT_RECORD_VERSION` | `packages/core/src/audit.ts` | Additive only. Add migration in `audit-postgres/migrations/`. Update `admin-sdk` Zod schema. |

| Do NOT | Why |
|---|---|
| Add `Decision.metadata` or `Decision.confidence` | Breaks closed enum doctrine |
| Reorder `state → taint → auth → business` | Breaks security assumptions of every Pack |
| Include `createdAt` in `intentHash` | Breaks ledger dedup |
| Use `Date.now()` / `Math.random()` inside `adjudicate()` | Breaks determinism + replay |
| Reintroduce `Plan.forbiddenConcepts` | Removed in v0.5 — typed slot ≠ enforcement boundary |
| Add `record.explain()` method on `AuditRecord` | Records are values; ship as free function with Pack-supplied registry |
| Build a YAML/JSON Pack DSL | Stay in TypeScript; `GuardMetadata` carries declarative content |

## Conventions

- **ESM + dual-emit.** `moduleResolution: NodeNext`, strict TS, `type: module` in every package.
- **Subpath exports.** `@adjudicate/core` exposes `/kernel` and `/llm` separately so `audit.ts` doesn't have to depend on LLM surface.
- **Tests live next to packages** — `<package>/tests/*.test.ts`. Vitest only. No Jest.
- **Property tests** via `fast-check` for invariants (e.g., replay determinism, plan conformance).
- **Naming:** Pack ids are kebab-case (`pack-payments-pix`); intent kinds are dotted (`pix.charge.refund`); ESLint rules + diagnostic codes are `AJD-1NN`; conformance invariants are `AC-001..AC-NNN`.
- **No emoji in source or docs** unless the user explicitly asks.

## How adapter-core layering works

- **L4** `@adjudicate/adapter-core` owns the **provider-neutral** orchestration: tool-use loop, defer/confirm orchestration, audit + ledger wiring, REWRITE handling, confirmation-blob hash verification, in-memory persistence shims, error taxonomy.
- **L5** Provider packages (`@adjudicate/anthropic`, `@adjudicate/openai`, …) own *only* the SDK mapping: a `ProviderBridge<H>` implementation plus a provider-tuned `PromptRenderer`. Adding a third provider is a < 200-line PR.
- History `H` is **opaque** to the loop. The bridge is the single point of provider knowledge; the loop never inspects history shape.
- Provider adapters MUST NOT bypass the loop. The kernel-side audit + ledger guarantees only hold when every adjudication flows through `adjudicateAndAudit` via the loop.

## Refactors landed (do not redo)

- **v0.5 — `Plan.forbiddenConcepts` removed.** Advisory-only typed slot deleted across core, anthropic, admin-sdk, all Packs, examples, and console mocks. The field "promised something the kernel never delivered" — security-perception cost outweighed the field's value. Adopters who want content moderation run their own filter outside the framework.
- **v0.5 — Anthropic adapter uses `adjudicateAndAudit`, not pure `adjudicate`.** Previously the adapter built `AuditRecord`s by hand with `durationMs: 0`; double-spend protection lived in the kernel but was bypassed at the reference adapter. P0-2 fixed it; new integration tests assert `REPLAY_SUPPRESSED` on duplicate `intentHash`.
- **v0.5 — Guard ordering documented as `state → taint → auth → business`.** Pre-v0.5 docs and code drifted. Sweep landed across `README.md`, `docs/concepts.md`, ADRs, templates, and a new invariant test.
- **v0.5 — `GuardMetadata` interface + `withMetadata` helper.** Unblocks the analyzer + visualizer. `nameGuard` is now a thin facade; deprecated for removal in v2.0 (codemod ships in `@adjudicate/migrate`).
- **v0.5 — `AuditRecord` v3 + v4.** v3 added `supersedes`; v4 added `auditHash` + `signature` seam + `policyVersion` + `kernelVersion`. Both additive.
- **v0.5 — pt-BR refusal strings externalized.** Kernel ships English defaults; `@adjudicate/locales-pt-BR` is opt-in via `RuntimeContext.refusalMessages`.
- **v0.6 — `@adjudicate/adapter-core` extracted.** Provider-neutral loop, bridge, decision translator, persistence shims, error taxonomy. Anthropic and OpenAI adapters become thin SDK shims. ADR-113 covers the extraction; existing Anthropic adopter import paths preserved via re-exports.
- **v0.6 — `@adjudicate/openai` shipped.** Reference OpenAI Chat Completions integration. Cross-provider parity verified by `tests/integration-pix.test.ts` (same Pack, same decisions through OpenAI).
- **v0.6 — Tier 2 AST analyzer (`AJD-201`).** `ts-morph`-based check of REWRITE guard mutated-field scope vs declared `mutatesPayloadFields`. Source locations + fix hints + SARIF output. Opt-in via `analyzePolicy({ sourceFiles })`.
- **v0.6 — `KERNEL_REFUSAL_CODES` includes `guard_panic`.** Conformance harness no longer needs the `KERNEL_INTERNAL_REFUSAL_CODES` overlay.
- **v0.6 — `validatePackManifest` primitive.** Standalone validator for the `package.json` `adjudicate` field per `docs/pack-ecosystem/registry-foundations.md`. Lives in `@adjudicate/conformance`; consumed by CLI, future registry indexer, install hooks.
- **v0.6 — `explainRecord` supersession narration + `mergeExplanationRegistries`.** Pack authors compose locale registries with `mergeExplanationRegistries(DEFAULT, packExtensions)`. AuditRecord v3+ supersession links render as one-line narrations.
- **v0.7 — Distributed kill switch v2.** `startDistributedKillSwitchPubSub` adds Redis pub/sub on top of polling. Sub-100 ms propagation, polling retained as fallback, boot resync closes the SUBSCRIBE-vs-transition race. ADR-114. Lives in `@adjudicate/audit/kill-switch-pubsub`. v1 polling helper stays valid.
- **v0.7 — Real-time audit event substrate.** `createInMemoryAuditEventBus` + `createRedisAuditEventBus` + `bridgeAuditSinkToBus`. Durable-first, bus-second; bus failure surfaces via `onBusFailure` but does NOT roll back the audit record.
- **v0.7 — `createRedisConfirmationStore`.** Restart-durable REQUEST_CONFIRMATION persistence in `@adjudicate/adapter-core/persistence-redis`. Same `RedisLedgerClient` surface other audit components reuse.
- **v0.7 — Pack trust primitives.** `computePackFingerprint` / `signPackFingerprint` / `verifyPackSignature` / `verifyPackTrust` in `@adjudicate/conformance`. ed25519 + RSA-PSS via `node:crypto`. ADR-115. CLI: `adjudicate pack verify [--expect | --public-key + --signature | --policy require_signature]`.
- **v0.7 — `replayWithIntegrity` + `explainReplayReport`.** Audit-hash + envelope-hash tamper detection alongside the existing decision-axis check. Three output formats: `ci-line | summary | operator`.
- **v0.7 — Cross-runtime golden vectors.** `docs/specs/canonical-hash-vectors.json` is the language-neutral consumer of the canonical-JSON SHA-256 spec. Non-Node runtimes load it and self-verify.
- **v0.7 — Adapter loop `TraceSink`.** Low-cardinality lifecycle events (`iteration_start | decision_emitted | paused | completed | max_iterations_exceeded`). Opt-in via `traceSink:` on `createAdjudicatedAgent`. Defaults to no-op.
- **v0.7 — Extended SEMCONV.** 8 new `adjudicate.*` attributes for adapter/provider/pause/kill-switch lifecycle. All additive, all low-cardinality, all closed enums.

## Where to look for outstanding work

`PROJECT_STATUS_AND_NEXT_STEPS.md` — priority-ordered list of what's open and what was deliberately deferred or rejected (do not re-litigate the rejections without an ADR).

## Stewardship documentation set (post-v1)

The framework is post-v1 governance infrastructure. The stewardship document set encodes engineering intent for future maintainers. **Read these before reviewing kernel-touching, replay-touching, or wire-format-touching changes:**

- [`docs/architecture/WHY_THE_INVARIANTS_EXIST.md`](docs/architecture/WHY_THE_INVARIANTS_EXIST.md) — rationale for each of the 11 constitutional invariants. Cite this when declining changes that violate them.
- [`docs/architecture/INSTITUTIONAL_RISK_REGISTER.md`](docs/architecture/INSTITUTIONAL_RISK_REGISTER.md) — risk inventory with mitigation status. Annual walk.
- [`docs/architecture/ECOSYSTEM_ANTI_FRAGILITY.md`](docs/architecture/ECOSYSTEM_ANTI_FRAGILITY.md) — per-dependency failure response.
- [`docs/architecture/MAINTENANCE_COST_AUDIT.md`](docs/architecture/MAINTENANCE_COST_AUDIT.md) — ongoing-burden tracking. Reach for it when tempted to add governance bureaucracy.
- [`docs/architecture/LONG_TERM_STEWARDSHIP_REPORT.md`](docs/architecture/LONG_TERM_STEWARDSHIP_REPORT.md) — annual certification capstone.
- [`docs/ops/MAINTAINER_GUIDE.md`](docs/ops/MAINTAINER_GUIDE.md) — onboarding (90 minutes to first patch release).
- [`docs/ops/OPERATIONAL_ASSUMPTIONS.md`](docs/ops/OPERATIONAL_ASSUMPTIONS.md) — what the runtime presupposes.
- [`docs/ops/FAILURE_MODE_CATALOG.md`](docs/ops/FAILURE_MODE_CATALOG.md) — known failure modes + degraded-mode contracts.
- [`docs/ops/ECOSYSTEM_RECOVERY_PROCEDURES.md`](docs/ops/ECOSYSTEM_RECOVERY_PROCEDURES.md) — per-incident playbooks.
- [`docs/release/GOVERNANCE_PLAYBOOK.md`](docs/release/GOVERNANCE_PLAYBOOK.md) — maintainer process (forbidden actions in §15).
- [`docs/release/CHANGE_REVIEW_CHECKLIST.md`](docs/release/CHANGE_REVIEW_CHECKLIST.md) — mechanical per-PR gate.
- [`docs/release/REPLAY_RISK_REVIEW.md`](docs/release/REPLAY_RISK_REVIEW.md) — extra checklist for replay-impacting changes.
- [`docs/release/SEMVER_DURABILITY_AUDIT.md`](docs/release/SEMVER_DURABILITY_AUDIT.md) — 3/5/10-year horizon analysis of the freeze matrix.
- [`docs/specs/REPLAY_LONGEVITY_MODEL.md`](docs/specs/REPLAY_LONGEVITY_MODEL.md) — what "replay" means over 10 years.

Operational survivability primitives shipped in `@adjudicate/audit`:

- `buildOperationalSnapshot` — deterministic point-in-time export of deployment state (digest-verified, JSON-portable).
- `buildIncidentBundle` — replayable incident package (snapshot at start + records + integrity report).
- `buildOperatorHandoff` — out-of-band handoff artefact (snapshot + config + open issues + references).

Long-range replay corpus: [`docs/specs/replay-longevity-corpus.json`](docs/specs/replay-longevity-corpus.json), enforced by [`packages/audit/tests/replay-longevity.test.ts`](packages/audit/tests/replay-longevity.test.ts). Extend additively; never mutate existing entries.

## Performance posture

`adjudicate()` p99 on commodity hardware: EXECUTE 0.7µs, REWRITE 6.5µs (hash dominates), REFUSE 0.5µs. `adjudicateAndAudit` REFUSE p99 = 9.5µs. All measurements >200× headroom against SLO (kernel ≤ 2ms, full path ≤ 15ms). Microbenchmarks: `pnpm -F adjudicate-bench bench`.

## v1.0 release candidate

The repo is in v1.0-RC posture. The authoritative RC artifacts are:

- [`docs/release/V1_FREEZE_MATRIX.md`](docs/release/V1_FREEZE_MATRIX.md) — every public surface classified into a stability tier.
- [`docs/release/V1_CERTIFICATION_REPORT.md`](docs/release/V1_CERTIFICATION_REPORT.md) — invariant verification + operational evidence + production-readiness scores.
- [`docs/security/V1-SECURITY-AUDIT.md`](docs/security/V1-SECURITY-AUDIT.md) — STRIDE-aligned per-surface findings.
- [`docs/perf/scale-baselines.json`](docs/perf/scale-baselines.json) — machine-readable scale harness output.

Two adopter-evidence items remain ungated (kill-switch v2 propagation under real Redis, AuditEventBus under real WebSocket fan-out). Surface is frozen; only the option defaults flip on evidence.

CI: `pnpm rc:check` runs the full pipeline locally; `.github/workflows/release-candidate.yml` runs it on tag push.

## Testing posture

**Full suite green (1 skipped — audit-postgres needs a live DB), 0 failing.** Plus 6 freeze-matrix surface tests in `@adjudicate/core` and 4 scale-harness smoke tests in `@adjudicate/bench`. CI runs `lint + typecheck + test + check:versions + check:freeze-matrix + audit` on push. Integration coverage:

- Decision regression gates via `adjudicate simulate` scenarios per Pack.
- Property tests for replay determinism, plan conformance, canonical-JSON hash.
- Conformance harness `runConformance(pack)` for AC-001..AC-006.
- Integration tests for the Anthropic and OpenAI adapters end-to-end against canned API responses (same Pack, same decisions, cross-provider parity).
- v0.7 chaos suites in `@adjudicate/audit`: burst-of-malformed pub/sub messages, trip/clear storm convergence, multi-replica race, reconnect recovery, 100+ corrupted replay envelopes.
- v0.7 cross-runtime golden vector consumer (`packages/core/tests/cross-runtime-hash-vectors.test.ts`) reads `docs/specs/canonical-hash-vectors.json`.
