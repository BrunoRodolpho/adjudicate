# @adjudicate/audit-postgres

## 3.0.0

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/audit@3.0.0

## 2.0.1

### Patch Changes

- fdc0344: Adversarial-audit remediation (464db38→804af8f review):
  - **audit-postgres (release-blocker):** migration `010-add-v5-metadata.sql` widens
    the `record_version` CHECK to `IN (1,2,3,4,5)` and adds the nullable
    `metadata_jsonb` column. Core stamps `record_version=5` unconditionally, so
    against a DB migrated through 009 every audit insert previously failed Postgres 23514. The sink now persists and recovers `metadata` losslessly.
  - **primitives:** `createTokenBudgetGuard` now fails **closed** on a non-finite
    over-budget meter — `+Infinity` ≥ any budget crosses (REFUSE) instead of
    passing through. NaN/negative remain non-crossing.
  - **conformance:** `generateAiBom` array comparators are now total-order (equal
    keys → 0), so the `bomDigest` is reproducible for inputs with duplicate keys.
  - **anthropic / openai:** the provider adapters now declare and forward the
    agent-loop seams `onTokenUsage`, `memoryStore`, `enrichContext`,
    `deriveMemoryWriteback`, `configSeal`, and `traceSink` — previously these were
    unreachable through the bridges (token budget, memory, and config-seal were
    effectively dead via the published adapters).
  - **pack-deployments-approval:** total-order tie-break for the model/prompt gate;
    README documents three release-gate limitations (opt-in regression score,
    carbon clamp has no data-residency allow-list, model/prompt gate fires on first
    deploy).
  - **core:** documents and pins the v5 metadata cross-version verification contract
    (a pre-v5 verifier would falsely flag a metadata-bearing record as tampered).

- 570db36: feat(core): AuditRecord v5 adds optional `metadata` (EXCLUDED from auditHash) + `attachAuditMetadata` + an `adjudicateAndAudit({ metadataProvider })` seam (ADR-124).

  feat(observability): hallucination scoring — `createHallucinationMetadataProvider` + `bucketHallucinationScore` + `adjudicate.hallucination.score`/`.bucket` semconv attributes.

  fix(admin-sdk,audit-postgres): accept AuditRecord v5 (schema + row mapping).

- Updated dependencies [58655cb]
- Updated dependencies [1ea3ed4]
- Updated dependencies [60daeef]
- Updated dependencies [5c1460d]
- Updated dependencies [2892100]
- Updated dependencies [fdc0344]
- Updated dependencies [71658f9]
- Updated dependencies [2ea6156]
- Updated dependencies [ce2cdc5]
- Updated dependencies [0726b56]
- Updated dependencies [7545b17]
- Updated dependencies [fa94fcd]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
- Updated dependencies [9f1e379]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/core@1.3.0
  - @adjudicate/audit@3.0.0

## 2.0.0

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

- Updated dependencies [9e65871]
- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/audit@2.0.0
  - @adjudicate/admin-sdk@2.0.0
  - @adjudicate/core@1.2.0

## 1.0.0

### Major Changes

- 663b572: Envelope v2 — nonce-based intentHash + auth-after-taint kernel reorder + v1 replay compat. Resolves #5, #7 (partial), #13, top-priority G.

  **Breaking** — `INTENT_ENVELOPE_VERSION` bumps to `2`. v1 envelopes are REFUSEd at runtime with `schema_version_unsupported`. Live writes are v2; pre-T8 audit rows replay via `legacyV1ToV2`. Within the `0.1.0-experimental` window, this is a deliberate fail-loud cutover that retires the most-cited foot-gun in the framework.

  The pre-T8 hash recipe `(version, kind, payload, createdAt, actor, taint)` made `createdAt` load-bearing for ledger dedup. An adopter rebuilding an envelope on retry without preserving `createdAt` silently produced a different `intentHash` — duplicate webhook deliveries re-executed. The README warned about this; the type system did not. T8 promotes idempotency to a first-class field.
  - **CHANGED: `IntentEnvelope` schema v2.** New `nonce: string` field (idempotency key, hashed). `createdAt` becomes descriptive metadata only (not hashed). Hash recipe is now `(version, kind, payload, nonce, actor, taint)`.
  - **CHANGED: `BuildEnvelopeInput.nonce` is required.** Adopters supply `crypto.randomUUID()` for first attempts and the SAME value for retries. `createdAt` remains optional; it can vary freely without affecting the hash.
  - **CHANGED: kernel evaluation order is `state → taint → auth → business`** (was `state → auth → taint → business`). UNTRUSTED inputs short-circuit before any auth side effect runs. Refusal-code distribution shifts in audit history: taint refusals on UNTRUSTED inputs that would also have failed auth now surface the taint refusal instead. Net safer; replay drift on the auth-vs-taint path may surface as `BASIS_DRIFT` for one corpus.
  - **NEW: `legacyV1ToV2(row)`** in `@adjudicate/audit-postgres` — synthesizes a v2 envelope from a v1 `intent_audit` row. Uses `row.nonce` when present (v2 row), falls back to the stored envelope's `nonce`, then to `createdAt` for true v1 rows. Replay produces the same Decision under unchanged policy; the synthesized `intentHash` does NOT match the v1 row's stored hash (different recipe) but the kind/basis comparison is meaningful.
  - **NEW: migration `003-add-nonce.sql`** adds the `nonce TEXT NULL` column plus a partial index on non-null nonces. Idempotent (`IF NOT EXISTS`).
  - **CHANGED: `IntentAuditRow.nonce: string | null`** carried through `recordToRow` and `rowToRecord`.
  - **NEW: `taintRank(taint)` exported** from `@adjudicate/core` (T4 carryover) — used by `withBasisAudit` for REWRITE taint regression detection.
  - **CHANGED: `replayEnvelopeFromAudit` reads `record.envelope.nonce`** with `record.envelope.createdAt` as a fallback for pre-T8 records.
  - **CHANGED: pix-payments-pix REWRITE site** plumbs `nonce: envelope.nonce` (preserves the original idempotency key through clamping).
  - **NEW: 6 unit tests** (`v1-replay-compat.test.ts`) covering nonce sourcing precedence, createdAt preservation, intentHash divergence under different recipes.
  - **NEW: 2 property tests** (`v2-hash-stability.property.test.ts`, 5 000 + 5 000 runs) — invariance under `createdAt` perturbation; differentiation under `nonce` perturbation.
  - **CHANGED: kernel ordering tests** in `adjudicate.test.ts` updated to assert the new pass-basis sequence and the new auth-after-taint short-circuit.
  - ADR-104 documents the cutover.

  **Migration:**
  - Adopters using `buildEnvelope({...})` without `nonce`: TypeScript error. Add `nonce: crypto.randomUUID()` for first attempts; preserve the value across retries.
  - Adopters with v1 envelopes in flight at deploy time: those envelopes will be REFUSEd by the new kernel. Quiesce v1 producers, drain in-flight messages, then deploy.
  - Adopters with v1 audit rows: `legacyV1ToV2` enables replay reads through the standard `replay()` harness without touching the storage.
  - Adopters whose auth guards had side effects: those side effects no longer fire on UNTRUSTED-refused intents. Most adopters benefit; a few who relied on auth-side logging for UNTRUSTED inputs need to move that logging to the taint pre-gate.

### Patch Changes

- Updated dependencies [663b572]
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
- Updated dependencies [663b572]
  - @adjudicate/audit@1.0.0
  - @adjudicate/core@1.0.0
  - @adjudicate/admin-sdk@1.0.0
