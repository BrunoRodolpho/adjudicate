# @adjudicate/runtime

## 0.2.0

### Minor Changes

- e9fc3ad: # v0.5 — Foundation hardening, L2 expansion, analyzer, observability, console UX, 7 new CLI commands

  5 milestones (M1 → UX cut), 876 tests passing (was 748; +128), zero regressions. Status and remaining work tracked in `PROJECT_STATUS_AND_NEXT_STEPS.md`.

  ## Kernel hardening (M1)

  **Guard exception isolation (ADR-106).** `_adjudicateImpl` now wraps every guard invocation in `try/catch`. A throwing guard becomes a `SECURITY` REFUSE with `kernel.GUARD_PANIC` basis — never propagates to the adopter. New `BASIS_CODES.kernel` category. 9 property tests.

  **Resume-hash verification.** `verifyParkedEnvelopeHash` re-derives `intentHash` via `sha256Canonical` and asserts byte-equality on resume. `verifyHash: "strict" | "warn" | "off"` option on `resumeDeferredIntent` and the Anthropic adapter (default `"warn"`). The adapter now parks full envelope fields at DEFER time. Tampered park blobs are detected and fail-closed.

  **Portuguese externalization (ADR-107).** Kernel inline pt-BR strings replaced with English defaults. New `RefusalMessages` interface + `localizeDecision(decision, messages)` helper exported from `@adjudicate/core`. New `@adjudicate/locales-pt-BR` package supplies opt-in pt-BR strings.

  ## L2 primitives expansion (M2 / ADR-108)

  Four new factories in `@adjudicate/primitives`:
  - `createRewriteGuard` — REWRITE factory with `mutatesPayloadFields` metadata
  - `createConfirmGuard` — REQUEST_CONFIRMATION via threshold + prompt
  - `createEscalateGuard` — ESCALATE via threshold + route + reason
  - `createIdempotencyGuard` — domain-level idempotency check

  All carry `GuardMetadata` per ADR-105. Existing Pack guards are unchanged.

  ## Static analyzer (M2 / ADR-109)

  New `@adjudicate/analyze` package shipping Tier 1 metadata-driven analyzers:
  - AJD-101 MissingMetadataAnalyzer
  - AJD-102 SignalConsistencyAnalyzer (caught a real bug — PIX missing `Pack.signals`)
  - AJD-103 BasisCodeConsistencyAnalyzer
  - AJD-104 RewriteScopeAnalyzer
  - AJD-105 TaintPolicyAnalyzer
  - AJD-106 DefaultPolarityAnalyzer

  text / JSON / SARIF 2.1.0 output. CLI: `adjudicate analyze --pack <m> [--format] [--strict]`.

  PIX + deployments Packs now declare `Pack.signals` per AJD-102.

  ## AuditRecord v4 (M3 / ADR-111)

  Additive fields:
  - `policyVersion` — Pack.version at adjudication time
  - `kernelVersion` — `@adjudicate/core` package version
  - `auditHash` — `sha256` over `canonical(record \ {auditHash, signature})`
  - `signature` — pluggable KMS signature seam (v0.6+)

  `verifyAuditRecord(record)` exported for tamper detection. `AUDIT_RECORD_VERSION = 4`. v3 readers tolerate v4 (additive only). New `audit-postgres` migration `008-add-v4-fields.sql` adds 4 nullable columns + 2 indexes. admin-sdk Zod schema accepts v4.

  ## Shipped packages
  - `@adjudicate/conformance` (ADR-110) — `runConformance(pack)` ships 6 invariant checks (AC-001..AC-006) adopters call from CI. Deterministic via seeded LCG.
  - `@adjudicate/observability` (ADR-112) — OTLP-shaped `MetricsSink`, `LearningSink`, `AuditSpanExporter` + stable `SEMCONV` constants. Pluggable `Exporter` interface.
  - `@adjudicate/migrate` (ADR-112) — ts-morph codemod runner + first codemod (`nameGuard` → `withMetadata`).
  - `@adjudicate/locales-pt-BR` (ADR-107) — Brazilian Portuguese refusal-message mapping.

  ## Console UX (T-080..T-086)
  - **Live tail** (2s polling fallback; WebSocket bridge post-v0.6) via `<LiveTailToggle>` in TopBar
  - **WhyNotPanel** on decision detail page — explains which other Decisions were NOT reached and why
  - **Lineage explorer** at `/decisions/[hash]/lineage` — supersession chain as depth-limited tree
  - **DriftPanel** on Dashboard — counts `guard_panic` / `rewrite_taint_regression` / `defer_signal_drift` / `basis_code_drift`
  - **SLOPanel** on Dashboard — p50/p95/p99 per intent kind with utilization vs SLO budget
  - **ReplayDialog** extended for single-field payload edit + side-by-side decision diff
  - **FailureBanners** (Postgres lag, DLQ, drift) at the top of every page

  ## CLI commands (T-091, T-108..T-113)

  Seven new commands (5 + 7 = 12 total):
  - `adjudicate reap` — Idle-DeferStore Redis scanner
  - `adjudicate visualize` — Standalone HTML force-graph of a Pack's PolicyBundle (SVG-only)
  - `adjudicate repl` — Interactive intent → decision shell
  - `adjudicate replay` — Re-adjudicate stored AuditRecords + mismatch classification
  - `adjudicate export` — Audit records to JSON / CSV (Parquet deferred to v0.6)
  - `adjudicate scenarios generate` — Seeded LCG-based scenario fixture generation
  - `adjudicate dev` — Docker Compose harness (Redis + Postgres) for local dev

  ## Pack templates (T-034..T-036)

  `adjudicate pack init <name> --template <basic|payment|approval|kyc|deployment>` — 4 new domain-specific scaffolds covering payment / approval / kyc / deployment shapes. Each ships realistic guards using L2 primitives, taint policy, scenarios, and a conformance test.

  ## ADRs (7 new — ADR-106 through ADR-112)
  - ADR-106 — Guard exception isolation
  - ADR-107 — RefusalMessages externalization
  - ADR-108 — Primitives expansion
  - ADR-109 — Analyzer architecture + diagnostic catalog
  - ADR-110 — Conformance package
  - ADR-111 — AuditRecord v4 additive fields + verifyAuditRecord
  - ADR-112 — Observability + migrate packages

  ## Documentation (~7,000 lines, 19 new files)
  - `docs/perf/v0.2-baseline.md` — p50/p99 microbenchmarks (>200× SLO headroom on all paths)
  - `docs/release/{semver,api-surface,deprecations}.md`
  - `docs/pack-ecosystem/{quality-scoring,registry-foundations,signing-design}.md`
  - `docs/architecture/hosted/{control-data-plane,rbac-and-tenant-isolation,deployment-topology}.md`
  - `docs/security/{threat-model,security-review-checklist}.md`
  - `docs/compliance/{soc2-mapping,shared-responsibility}.md`
  - `PROJECT_STATUS_AND_NEXT_STEPS.md` — status snapshot + remaining work

  ## CI workflows (deliverable; not yet exercised)
  - `.github/workflows/ci.yml` — lint + typecheck + test
  - `.github/workflows/release.yml` — CycloneDX SBOM + Sigstore signing + npm provenance (workflow_dispatch)
  - `.github/workflows/security-codescan.yml` — pnpm audit on dep changes

  ## Non-negotiable invariants preserved
  - Kernel determinism: no `Date.now()`, no `Math.random()` in adjudication paths
  - LLM has zero mutation authority: every envelope still crosses `adjudicateAndAudit`
  - Decision algebra closed at 6 variants
  - Wire format frozen: IntentEnvelope v2, canonical-JSON hash, Decision shape unchanged
  - AuditRecord v4 is additive-only over v3
  - Fail-closed default preserved (REWRITE scope check telemetry-first; enforcement opt-in)
  - ADR-105 closed-vocabulary discipline applied to `BASIS_CODES.kernel`, `AJD-*`, `AC-*`, `SEMCONV.*`

### Patch Changes

- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/core@1.2.0

## 0.1.0

### Minor Changes

- 663b572: Coordination integrity — atomic park, rate-limit rollback, defer-resume cycle cap, ledger race fix. Resolves #35, #36, #37, #38 (partial), #41, top-priority E + I.

  The framework's coordination primitives had three gaps. The kernel's load-bearing claim ("the same intent cannot side-effect twice") sat behind first-writer-wins on the ledger key, which two parallel `adjudicate()` callers could both pass before either recorded the SET-NX. The defer-resume cycle had no global cap on resume-park-resume oscillation. Rate-limit counters incremented on every request — including REFUSEd ones — letting hostile traffic exhaust legitimate users' budgets.
  - **NEW: `RateLimitResult.rollback()`** — return a rollback handle from `checkRateLimit`. When the kernel returns a non-EXECUTE Decision, the executor invokes `rollback` to decrement the counter. Idempotent (safe to call once or skip). No-op when the store does not implement `decrement`.
  - **NEW: `RateLimitStore.decrement?(key)`** — optional method on the store contract. `createInMemoryRateLimitStore` implements it (clamps to zero). Adopter Redis stores wire `DECR`.
  - **NEW: `AdjudicateAndAuditDeps.rateLimitRollback?: () => Promise<void>`** — when supplied, fires after sink emission iff the Decision was non-EXECUTE. Adopters compose with `checkRateLimit().rollback`.
  - **NEW: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** (T1 carryover, surfaced here too) — `adjudicateAndAudit` uses the tag to flip a racing EXECUTE to `ledger_replay_suppressed` when SET-NX collides, closing #37 (parallel callers cannot both side-effect).
  - **NEW: `DEFAULT_MAX_RESUME_CYCLES = 3`** + `ResumeDeferredIntentArgs.maxResumeCycles` — per-`intentHash` resume cycle counter prevents DEFER → resume → DEFER oscillation under a misbehaving signal source. Returns `{ resumed: false, reason: "cycle_cap_exceeded" }` past the cap. Set to `0` to disable; back-compat skip when `redis.incr` is not wired.
  - **NEW: `DeferRedis.incr?` and `DeferRedis.expire?`** — optional Redis methods used by the cycle cap. Old adopters whose client lacks `incr` see no behavioural change (cap silently disabled).
  - **NEW: `ParkRedis.evalIncrCheck?(counterKey, ttlSeconds, max)`** — optional atomic Lua-eval increment-and-check. When wired, `parkDeferredIntent` uses it instead of the INCR-then-check sequence, eliminating the small race window at quota − 1. Adopters whose Redis client exposes `eval` can supply this; the framework falls back to the non-atomic sequence (the existing behaviour) when omitted.
  - **CHANGED: `parkDeferredIntent` EXPIRE refresh.** The pre-T5 implementation set the counter TTL via `EXPIRE NX` — once, on first park. Now the TTL refreshes on every park (no NX flag), so the counter outlives the latest envelope, not the first one's. Resolves #36.
  - **NEW: `taintRank(taint)`** exported from `@adjudicate/core` — used internally by `withBasisAudit` REWRITE-taint regression check (T4 carryover).
  - **NEW: 3 unit tests** (`rate-limit.test.ts`) for `RateLimitResult.rollback` (decrement, idempotency, store-without-decrement no-op).
  - **NEW: 4 unit tests** (`defer-resume-cycle-cap.test.ts`) for default cap, custom cap, disabled cap, back-compat skip.

  **Migration:**
  - Adopters using `checkRateLimit`: `result.rollback` is additive — call it on non-EXECUTE outcomes to fix #41. Old call sites that ignore it continue to work (counter stays advanced).
  - Adopters using `parkDeferredIntent`: counter TTL behaviour changes — refreshes on every park. Implementations whose Redis `expire` rejects calls without the NX flag must accept the new signature (`expire(key, seconds, mode?)` — second arg now optional).
  - Adopters using `resumeDeferredIntent`: no migration needed; the cycle cap is opt-in via wiring `redis.incr`.

### Patch Changes

- Updated dependencies [d8c11b7]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [92858a0]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/core@1.0.0
