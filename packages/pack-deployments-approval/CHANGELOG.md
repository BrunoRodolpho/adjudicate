# @adjudicate/pack-deployments-approval

## 0.4.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0
  - @adjudicate/primitives@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/primitives@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/primitives@0.4.1

## 0.4.0

### Minor Changes

- 94ddc76: feat(conformance,pack-payments-pix,pack-access-governance,pack-deployments-approval): 035 — wire the constitutional authority guard (034's `createAuthorityGuard`) into every shipping pack's `authGuards` and add the static conformance check `AC-007` (untrusted-mutating-needs-owner), closing the §D #8 violation that pack-payments-pix (`pix.charge.create`/`refund`) and pack-access-governance shipped today with `authGuards: []` (mutating UNTRUSTED-min kinds with no owner predicate). 035 is the single authoritative owner of `authGuards` wiring. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved).
  - **`@adjudicate/conformance` (`src/checks/untrusted-mutating-needs-owner.ts`, `src/checks.ts`, `src/index.ts`):** add `untrustedMutatingNeedsOwnerCheck` (`id: "AC-007"`), a STATIC/STRUCTURAL check — like AC-006 and unlike the fuzz checks it does NOT call `adjudicate()`, so it is SAMPLING-FREE and SEED-FREE. It flags a violation when a kind is MUTATING **and** `canPropose("UNTRUSTED", kind, pack.policy.taint) === true` (UNTRUSTED-min, so the taint gate does not short-circuit it) **and** `pack.policy.authGuards.length === 0` (no owner predicate). The MUTATING classifier is **DEFAULT-MUTATING, fail-closed** (resolved by human gate, `_RUN_STATE.md` 2026-06-18): a kind is mutating UNLESS the pack AFFIRMATIVELY declares it read-only via `sideEffects[kind] ∈ {"none","read"}` — an unclassified kind (or a pack with no `sideEffects` map) is assumed mutating. This deliberately avoids the vacuous reading (keying off `sideEffects ∈ {"write","destructive"}` passes on every current pack, since none declare `sideEffects`) and cannot be silenced by omission. Registered in `DEFAULT_CHECKS` (ahead of AC-008 so ids are dense) and exported from the barrel; `runConformance`/`ConformanceCheck` need no change. `run` MUST NOT throw and is deterministic. AC-007 is non-vacuous: it FAILS the pre-035 packs (`authGuards: []`) and PASSES once the guard is wired.
  - **`@adjudicate/pack-payments-pix` / `pack-access-governance` / `pack-deployments-approval` (`src/types.ts`, `src/policies.ts`/`src/index.ts`):** append the SINGLE `createAuthorityGuard` owner predicate (NOT a second `requireTenantBinding`) into each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds (`pix.charge.create`/`refund`; `access.request`/`revoke`; `deployment.approval.request`/`rollback.execute`). Kernel order `state→taint→auth→business` is preserved — the guard lives in `authGuards`, after taint (§D #3), and the TRUSTED-only kinds (`pix.charge.confirm`, `access.review.resolve`/`breakglass`, `deployment.approval.resolve`) are NOT gated (the taint gate owns them). Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `PixAuthorityContext`/`AccessAuthorityContext`/`DeploymentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). The guard reads it from `state` (the kernel never hands a guard identity). When `state.authority` is present the guard is BINDING and fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-035 standalone-demo posture the lighthouse scenarios/fixtures use (which carry no identity model), so existing pack behavior is preserved.
  - **⚠️ IDOR residual (034-F1/F2, documented).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet (`IntentActor.principal` is the provenance enum; `attest()` is a v0.2 stub), so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed), never the run-state-flagged false-sense-of-security. §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority. The guard BODY is not sealed by ConfigSeal (GROUP 08 residual), unchanged here.
  - **`@adjudicate/red-team` (`src/vectors/taint-escalation.ts`):** document that 035 wires the real packs + host seam so 034's `generateOwnershipViolationEnvelopes` IMPERSONATION case is now defended for the shipped money-moving kinds — the ownership-axis canary 084 consumes. (Tests: a state-valid forged-owner refund against the REAL pix pack with authority injected is REFUSEd at the AUTH gate, `auth:scope_insufficient`, proving the owner predicate is genuinely reached, not the taint floor.)

  Tests: AC-007 registration/id-array (`conformance/tests/conformance.test.ts`); the wired owner-predicate REFUSE path per pack (binding/IDOR-closed/fail-closed/ordering) in the pack tests; non-empty `authGuards` asserted for access-governance; the IDOR red-team vector against the real pix pack. The fail-open read-only conformance fixture now AFFIRMATIVELY declares `sideEffects: { "read.only": "read" }` (the documented AC-007 exemption). Monotonicity (§C) preserved: the check and the guard only ADD friction, never authorize EXECUTE.

### Patch Changes

- 5310f7d: feat(web,pack-identity-kyc,pack-deployments-approval,primitives): 101 — freeze the on-path escalate-only compliance-signal contract and close the documented-vs-enforced `amlStatus` enum drift. The contract is realized by three already-shipped, structurally escalate-only guards — the tiered session-risk guard (`primitives/src/session-risk.ts`), the regression-score escalate guard (`pack-deployments-approval/src/policies.ts`), and the AML-flag escalate guard (`pack-identity-kyc/src/policy.ts`) — each ordered ahead of any clamp/allow/EXECUTE branch so a compliance signal can only raise friction, never waive a gate. 101 FREEZES that shape with non-vacuous conformance tests and is otherwise a doc-alignment change: NO guard logic, NO basis vocabulary, and NO `intentHashInput` change. §C monotonicity (a signal sets a ceiling, never a floor; only deterministic rules authorize EXECUTE), the closed 6-outcome `Decision` algebra (§D #2), and replay-determinism (§D #5) are all preserved.
  - **`@adjudicate/web` (`src/content/intent-schemas.ts`) — the only production source change (drift closure):** align the public `kyc.vendor.callback` schema doc's `amlStatus` enum from the stale lowercase 3-value `"clear" | "hit" | "pending"` to the ENFORCED `"CLEAR" | "FLAGGED"` (`pack-identity-kyc/src/types.ts:43`), and update the `amlMatchScore`/`amlMatchEntity` field copy that referenced `"hit"`. Before this fix a callback sent with the documented `"hit"` silently failed the enforced `amlStatus === "FLAGGED"` discriminator and fell through to score handling / default REFUSE — it never escalated. Doc-only: no runtime enum or guard logic changes.
  - **`@adjudicate/pack-identity-kyc` (`tests/kyc.test.ts`) — contract freeze (tests only, no src change):** add a COMPILE-TIME `AmlStatus` enum-shape lock (fails to type-check if the enum ever drifts from exactly the two UPPERCASE values, the type-side complement to T6); add the drift-closure backstop pinning that a documented-but-unenforced AML value (lowercase `"hit"`) does NOT escalate (it falls through to the score path), demonstrating WHY the doc must equal the enforced enum; add a conformance fixture asserting ONLY the enforced UPPERCASE `"FLAGGED"` escalates over any score while `CLEAR` never does. The escalate discriminator (`policy.ts:196 amlStatus !== "FLAGGED"`) and the guard ordering (`escalateOnAmlFlag` before `refuseLowScore`/`executeOnHighScore`) are UNCHANGED; the `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/pack-deployments-approval` (`tests/gates.test.ts`) — contract freeze (tests only, no src change):** add a FROZEN escalate-only contract block proving the regression-score signal (`escalateRegressionScore`, ordered before all clamp/allow guards) is structurally non-downgradable: a sub-threshold `aiEvalScore` ESCALATEs and wins over a REWRITE (dirty region) AND over a REQUEST_CONFIRMATION (model change), and across the whole sub-threshold band never authorizes EXECUTE. The pre-existing precedence (`gates.test.ts:96-99`) and replay-determinism (`gates.test.ts:101-107`) tests are kept green.
  - **`@adjudicate/primitives` (`tests/session-risk.test.ts`, `tests/m2-factories.test.ts`) — contract freeze (tests only, no src change):** freeze `createSessionRiskGuard` as escalate-only — a full-range sweep of accumulated risk asserts it only ever abstains or emits REFUSE/ESCALATE/REQUEST_CONFIRMATION/REWRITE (never EXECUTE/DEFER) and abstains below the `minCount` warm-up floor (`session-risk.ts:135`) no matter how high the risk; freeze `createEscalateGuard` as a thin escalate-only alias — it abstains unless the predicate matches AND the value crosses the threshold, and the ONLY non-null disposition it can emit is ESCALATE (`onCross` pinned to `decisionEscalate`, `guards.ts:432-457`), across both comparators and routes.

  `@adjudicate/core` is UNCHANGED by 101 (the closed `validation`/`business` basis vocabularies and the constitutional invariants are confirmed via `core test` + `core test:invariants`, T9). Rollback: revert the branch `feat/merged-101-compliance-signal-contract` — the change set is a single doc-content alignment plus contract tests over already-shipped guards, so revert is a clean `git revert` with no data migration and no feature flag.

- 21a7895: feat(pack-identity-kyc,pack-deployments-approval,primitives): 103 — harden the KYC-status + suitability/Reg-BI compliance signals as on-path, escalate-only providers and PIN escalate-only precedence so a compliance signal can only ever step friction UP (§C `final = min(deterministic, risk_ceiling)`, §D inv-7). 103 CONSUMES 102's escalate-only AML UNION (FLAGGED OR `amlMatchScore >= threshold`) and does NOT re-author it; its additive scope is the suitability/Reg-BI (`aiEvalScore` regression) escalate-only signal and the KYC-status path. This is a contract-locking change (per §7: doc-reconciliation + precedence-locking only, no runtime mechanism added): NO guard logic, NO basis vocabulary, NO `intentHashInput`, and NO `@adjudicate/core` source change. The closed 6-outcome `Decision` algebra (§D #2), replay-determinism (§D #5), and §C monotonicity are all preserved and re-confirmed via `core test` + `core test:invariants` (T6).
  - **`@adjudicate/pack-deployments-approval` (`tests/gates.test.ts`) — suitability/Reg-BI escalate-only precedence over an EXECUTE allow guard (tests only, no src change):** the 101/102 tests pin the regression-score signal (`escalateRegressionScore`, ordered before all clamp/allow guards) beating a REWRITE (dirty region) and a REQUEST*CONFIRMATION (model change). 103 adds the STRICTEST precedence — escalate over a genuine EXECUTE \_allow* guard: an APPROVED production deploy that would otherwise EXECUTE via `allowApprovedProduction` ESCALATEs when `aiEvalScore` is sub-threshold, across the whole failing-eval band; a CONTROL at/above threshold confirms the guard abstains and the deterministic EXECUTE allow guard fires (proving the ESCALATE is a real threshold crossing, not an always-on side effect). The suitability signal sets a ceiling, never a floor, even against the one guard that authorizes EXECUTE.
  - **`@adjudicate/pack-identity-kyc` (`tests/kyc.test.ts`) — KYC-status escalate-only precedence + fail-closed enum + closed basis (tests only, no src change):** add a 103 anchor proving BOTH branches of 102's AML UNION beat the kernel's single EXECUTE allow guard (`executeOnHighScore`) at an EXECUTE-grade verification score (≥ 90) — the FLAGGED branch and the `amlMatchScore ≥ threshold` (CLEAR) branch — and that across the EXECUTE band a union hit never authorizes EXECUTE (friction ceiling, never a floor). Add the fail-closed enum backstop (the §3/§7 risk): an unrecognized `amlStatus` at a borderline score (no union hit, sub-EXECUTE) falls through to default REFUSE — never EXECUTE — pinning the enforced `AmlStatus = "CLEAR" | "FLAGGED"` (`types.ts:43`) as the single source of truth (an unknown value fails closed to friction). Add the T6 closed-vocabulary backstop: the AML escalate emits the existing business basis CODE `rule_violated` with `aml_screening` as a `detail.rule` STRING only — no new basis code introduced. The pre-existing 101/102 AML-union, compile-time `AmlStatus` lock, and drift-closure tests stay green; the `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/primitives` (`tests/m2-factories.test.ts`) — reaffirm the escalate-only conjunction the 103 providers rely on (tests only, no src change):** both 103-relevant providers (deployments `escalateRegressionScore`, KYC `escalateOnSanctionsMatchScore`) ride `createEscalateGuard`. Add a 103 anchor pinning its CONJUNCTION contract — escalate iff `matches` is true AND the comparator crosses — so a matches-true-but-sub-threshold value ABSTAINS (returns `null`, letting the deterministic score path run) rather than leaking a non-null Decision, and an ABSENT extracted value abstains (precisely why the FLAGGED-only/no-score case must be a STANDALONE sibling guard). At/above threshold it emits ESCALATE to the configured route only. Complements 101's frozen escalate-only-shape block from the consumers' perspective.

  `@adjudicate/core` is UNCHANGED by 103 (the closed basis vocabularies and the constitutional invariants are confirmed via `core test` + `core test:invariants`). `@adjudicate/web` is UNCHANGED by 103 (102 owns the `intent-schemas.ts` reconciliation; the documented `amlStatus` value-set already matches the enforced enum). Rollback: revert the branch `feat/merged-103-kyc-suitability-providers` — a per-package test-only change with no data migration and no feature flag; revert is a clean `git revert`.

- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [f072839]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [a9be0ad]
- Updated dependencies [e8698b1]
- Updated dependencies [6121a7a]
- Updated dependencies [c0d1b93]
- Updated dependencies [5310f7d]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [cb8d608]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [21a7895]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
  - @adjudicate/core@1.5.0
  - @adjudicate/primitives@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/primitives@0.3.1

## 0.3.0

### Minor Changes

- 804af8f: feat(pack-deployments-approval): release-gating extensions (Item 14) — regression-score-aware ESCALATE (aiEvalScore below threshold), carbon-budget region REWRITE (clamp to the greenest region, taint preserved), and AI model/prompt-change REQUEST_CONFIRMATION. New payload fields (aiEvalScore, region, modelId, promptVersion), constants (REGRESSION_ESCALATE_THRESHOLD, REGION_CARBON_RANK, GREENEST_REGION, greenestRegion), and guards. No kernel changes; existing scenarios unaffected (new gates are inert without the new fields).

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

- 55c2494: Maturity wave — close the gaps the adversarial audit conceded:
  - **primitives (command-risk):** the REFUSE tier now covers `rm -rf ~`,
    `rm -rf $HOME`/`${HOME}`, `rm -rf /*` (not just `rm -rf /`) and is
    case-insensitive for the destructive rules; a recursive `rm` against a specific
    recoverable path still only CONFIRMs.
  - **pack-deployments-approval:** the carbon clamp is now data-residency-bounded
    (`REGION_RESIDENCY` + `greenestRegionInZone`) — an EU deploy is only relocated
    to a greener EU region, never across a residency boundary; unknown regions are
    left untouched (fail-safe). Closes the GDPR foot-gun.
  - **red-team:** new `taintEscalationCausality` distinguishes taint-gate defenses
    from precondition defenses, so `escaped===0` is no longer a vacuous guarantee.
    The PIX fixture documents that preconditions fire first; a precondition-free
    pack proves the taint gate genuinely fires.
  - **observability:** ships `createLexicalGroundednessScorer`, a deterministic
    reference `HallucinationScorer` (1 − claim/evidence containment), so the
    ADR-124 scoring seam ships with working code, not just an interface.
  - **pack-access-governance:** the pack now actually uses
    `createDataClassificationGuard` — it REWRITE-redacts PII (SSN/email) from the
    free-text `access.request` justification (taint preserved) before processing.

  Console (reference UI, unversioned): the hallucination badge now renders real
  buckets; the Tier-3 analyzer no longer emits false unreachable-intent warnings
  (authenticated planner probes); behavioral-drift `evaluate()`/`onDrift` is wired
  and the demo stream actually drifts; the approvals panel is clearly labeled a
  display-only projection (production authorization runs through the approval
  engine). Web playground: stronger PII demo patterns (dashless SSN, grouped PAN).

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [1e0058b]
  - @adjudicate/core@1.3.0
  - @adjudicate/primitives@0.3.0

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
  - @adjudicate/primitives@0.2.0

## 0.1.0

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
  - @adjudicate/primitives@0.1.0
