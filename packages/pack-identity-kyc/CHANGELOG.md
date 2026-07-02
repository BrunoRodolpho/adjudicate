# @adjudicate/pack-identity-kyc

## 0.3.4

### Patch Changes

- Updated dependencies [e650c37]
  - @adjudicate/core@1.9.0
  - @adjudicate/primitives@0.4.4

## 0.3.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0
  - @adjudicate/primitives@0.4.3

## 0.3.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/primitives@0.4.2

## 0.3.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/primitives@0.4.1

## 0.3.0

### Minor Changes

- 5dfa0e5: feat(pack-cli-agent,pack-identity-kyc,pack-incident-response): 201 — wire the constitutional authority guard (034's `createAuthorityGuard`) into the three remaining packs that still shipped mutating UNTRUSTED-min kinds with `authGuards: []`, closing the tracked 035-F1 §D #8 gap. Purely ADDITIVE pack-policy wiring — NO kernel change. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved). The `authority` seam rides INJECTED, NON-serialized `state` (the pack rehydrators are untouched), so it never enters the audit/replay hash.
  - **`@adjudicate/pack-cli-agent` / `pack-identity-kyc` / `pack-incident-response` (`src/types.ts`, `src/policies.ts`/`src/policy.ts`, `src/index.ts`):** mirror the 035 pix template exactly. Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `CliAuthorityContext` / `KycAuthorityContext` / `IncidentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). A single `createAuthorityGuard` owner predicate is appended to each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds: cli `terminal.run`; kyc `kyc.start` / `kyc.document.upload`; incident `incident.remediation.execute` / `incident.escalate`. The system-only callback kinds (`kyc.vendor.callback`, `incident.monitor.callback`) are EXCLUDED — the taint gate owns them (the same exclusion pix applies to `pix.charge.confirm`). Kernel order `state→taint→auth→business` is preserved (the guard lives in `authGuards`, after taint, §D #3). When `state.authority` is present the guard is BINDING + fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-201 standalone-demo posture, so existing pack behavior is preserved. Each pack's `basisCodes` gains `"tenant_binding_violation"` (the guard's bare `Refusal.code`) to suppress the observe-only `basis_code_drift` telemetry on the §D #8 owner-predicate refusal.
  - **kyc is the SUBSTANTIVE close (the one genuinely-open 035-F1 hole).** Before 201 a forged/unbound/impersonated owner of `kyc.start` / `kyc.document.upload` passed the EMPTY auth slot and landed on the unconditional business DEFER guards (`requireDocumentUpload` / `waitForVerification`) ⇒ DEFER. Because the kernel evaluates state → taint → AUTH → business, wiring the auth-phase guard makes a forged owner REFUSE at the AUTH phase, short-circuiting BEFORE the business DEFER ⇒ the outcome flips **DEFER → REFUSE**. No business-guard change is needed — it is the kernel phase ordering that converts it. The load-bearing regression test (`pack-identity-kyc/tests/ownership.test.ts`) pins `forged-owner → REFUSE, NOT DEFER`.
  - **Host-injection contract (per pack, documented in `types.ts`):** `resourceRefs.resource` names — cli: the cwd / host scope the command acts in; incident: the incident id / blast-radius target (the AUTHENTICATED principal comes from `state.authority.principalOf(actor.sessionId)`, NOT `IncidentContext.operatorId`); kyc: the session's `userId`. `resourceRefs.owner` is the principal the host authority graph binds to that resource.
  - **⚠️ IDOR residual (034-F1/F2, documented, unchanged).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet, so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed). §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority.
  - **`@adjudicate/conformance` (`tests/ac007-real-packs.test.ts`, `package.json`):** add a non-vacuous AC-007 regression suite against the three real packs — each now PASSES `untrustedMutatingNeedsOwnerCheck`, plus a "if the wiring is reverted (`authGuards: []`) → AC-007 fails" backstop (the stronger backstop lesson, 014-F1). The three packs are added as devDependencies so the test can import them. No conformance runtime/API change.

  **HONEST CAVEAT (not smuggled).** The committed CI adversarial-canary gate loads packs via `loadPackFromModule`, which injects NO authority context — so the ownership probe is structurally inert at that gate for EVERY pack, including pix (whose baseline REFUSEs are state-schema refusals, not owner-predicate refusals). 201 brings these three packs to the SAME bar pix ships at: structural guard presence (AC-007) + in-package unit tests that genuinely exercise the predicate (inject `authority` + a state-valid payload so the envelope REACHES the auth phase). Re-deriving the canary baselines via the documented README workflow is a byte-identical NO-OP — kyc's baseline stays at 12 escaped/DEFER because the committed gate injects no authority and the guard is correctly inert there. Genuine gate-level non-vacuity (extending the red-team generator + canary to inject authority + state-valid payloads for ALL packs incl. pix, the AC-008 reaching-business pattern) is a broader red-team change and remains the tracked FOLLOW-UP, explicitly OUT OF SCOPE here.

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

- b78860b: feat(web,pack-identity-kyc): 102 — turn the single-shot AML enum echo into a real sanctions/OFAC screening signal provider. The sanctions result rides as an injected snapshot on the `kyc.vendor.callback` payload and is read by the pure kernel as an on-path, escalate-only compliance signal: it may only ESCALATE to a human (or fall through to REFUSE), never authorize EXECUTE and never waive a downstream gate — preserving §C monotonicity (inv. 7: a compliance signal sets a friction ceiling, never a floor) and the §D kernel-purity invariants (closed 6-outcome algebra, injected snapshot, byte-identical replay). NO change to `intentHashInput`, the basis vocabulary, or any constitutional invariant.
  - **`@adjudicate/pack-identity-kyc` — ground the AML/sanctions signal in the escalate-only primitive contract as a UNION:** the previous `escalateOnAmlFlag` discriminated solely on `amlStatus === "FLAGGED"` and never compared `amlMatchScore` (it was decoration only). The signal now escalates on the UNION of two INDEPENDENT conditions, implemented as TWO escalate-only checks both ordered before `refuseLowScore`/`executeOnHighScore` (so the kernel first-non-null short-circuit structurally prevents any downgrade to EXECUTE):
    - **(a) `escalateOnAmlFlag` (inline, unchanged shape) — `amlStatus === "FLAGGED"`:** a hard, score-INDEPENDENT escalate predicate. A FLAGGED callback with NO `amlMatchScore` still escalates. Kept as its OWN standalone check because `createEscalateGuard` ANDs predicate+threshold and abstains when `extract()` is null/undefined — folding the flag into the score guard would let a missing score gate it out (the §7 regression).
    - **(b) `escalateOnSanctionsMatchScore` (NEW, via `createEscalateGuard`) — `amlMatchScore >= KYC_SANCTIONS_MATCH_THRESHOLD` (80):** grounds `amlMatchScore` as a VALIDATED, range-checked escalate signal instead of a never-compared decoration. A strong watchlist correlation escalates to a human even when `amlStatus` is `"CLEAR"` and the verification score is EXECUTE-grade — purely additive friction. Escalate-only by construction (`onCross` pinned to `decisionEscalate`).
    - Both branches emit ESCALATE → "human" with a business `rule_violated` basis (`rule: "aml_screening"`, `signal: "aml_flag"` | `"sanctions_match_score"`). Adds `KYC_SANCTIONS_MATCH_THRESHOLD = 80` to `types.ts` (re-exported). The business guard count is now 6 (was 5); the conformance test count was updated accordingly. New non-vacuous tests pin: FLAGGED+no-score still ESCALATEs; CLEAR+match≥80 ESCALATEs over an EXECUTE-grade score; CLEAR+match=79 does NOT escalate (real threshold crossing); and a full-range escalate-only precedence sweep (sanctions match never authorizes EXECUTE). The `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/web` (`src/content/intent-schemas.ts`) — finish the signal-shape doc reconciliation (doc-only):** the lowercase 3-value `amlStatus` drift was already closed by 101; 102 updates the `amlStatus`/`amlMatchScore`/`amlMatchEntity` field copy to describe the escalate-only sanctions contract (FLAGGED escalates regardless of score and never authorizes EXECUTE; `amlMatchScore ≥ 80` escalates even when CLEAR). The enforced 2-value UPPERCASE enum (`pack-identity-kyc/src/types.ts`) remains the source of truth; the doc cannot weaken the kernel.

  Rollback: revert the branch `feat/merged-102-sanctions-provider` — a single per-package change with no data migration and no feature flag; revert restores the prior `escalateOnAmlFlag` echo and schema doc.

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

## 0.2.2

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/primitives@0.3.1

## 0.2.1

### Patch Changes

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

### Minor Changes

- d8c11b7: Phase 6.2 — `adjudicate simulate` command + state rehydration convention.

  ## `@adjudicate/cli` — new `simulate` subcommand

  Run a single envelope against a Pack's policy and render the resulting Decision + per-guard evaluation trace.

  ```sh
  adjudicate simulate --pack @adjudicate/pack-payments-pix --scenario refund-medium.json
  adjudicate simulate --pack ./packs/my-pack/src/index.ts --intent intent.json --state state.json --format json
  ```

  - `--pack <module>` accepts any Node import specifier: npm package name (workspace symlinks work) or relative/absolute path (converted to `file://`).
  - `--scenario <file>` reads a bundled JSON with `intent` + `state` + optional `expected`.
  - `--intent <file> --state <file>` reads them separately — useful when many fixtures share state.
  - `--format text|json` selects output. Text is a minimal line-oriented placeholder; the full ANSI-boxed renderer lands in Phase 6.3.
  - When the scenario carries `expected.kind` and the decision doesn't match, exit code is 2. Otherwise exit 0.

  Scenario schema is Zod-validated; malformed JSON or unknown enum values produce a structured `ScenarioParseError` with a bullet list of issues + the source path.

  New programmatic exports from `@adjudicate/cli`:
  - `runSimulate`, `SimulateOptions`
  - `loadScenario`, `loadIntentAndState`, `ScenarioParseError`, `Scenario`, `IntentInput`
  - `loadPackFromModule`, `findPackExport`, `isLikelyPack` (shared with `pack lint`)
  - `renderSimulation`, `SimulationOutput`, `SimulationFormat`

  Internal refactor: the Pack-discovery helpers (`findPackExport`, `isLikelyPack`) moved from `pack-lint.ts` into a new `lib/pack-loader.ts` so `simulate` and `lint` share one definition of "what counts as a Pack export."

  New dependency: `zod ^4.3.6` for scenario validation.

  ## `@adjudicate/core` — `PackV0.rehydrateState`

  PackV0 gains an optional `rehydrateState?: (raw: unknown) => State`. Tools that source state from JSON (CLI `simulate`, future Console scenario builder, future audit-replay payload restoration) call this to convert from a serializable representation (typically `JSON.parse` output) back into the runtime state shape — needed when state contains `Map`/`Set`/`Date`/etc. that don't survive `JSON.stringify` round-tripping.

  Optional and backward-compatible — Packs with state that's already plain JSON (records, arrays, primitives) omit it.

  ## `@adjudicate/pack-payments-pix` — `rehydratePixState`

  Exports a new `rehydratePixState(raw)` function (also wired as `paymentsPixPack.rehydrateState`) that converts `{ charges: { [id]: PixCharge } }` from JSON into `PixState` with the runtime `Map<string, PixCharge>`. Idempotent on already-rehydrated input.

  ## `@adjudicate/pack-identity-kyc` — `rehydrateKycState`

  Exports a new `rehydrateKycState(raw)` function (wired as `IdentityKycPack.rehydrateState`) that converts `{ sessions: { [id]: KycSession } }` into the runtime `Map<string, KycSession>` shape.

  ## Verification
  - 8 new `simulate` integration tests cover all six PIX outcomes (EXECUTE, REQUEST_CONFIRMATION, ESCALATE, DEFER, REWRITE) plus KYC DEFER and the system-only-kind taint refusal.
  - 10 new scenario-schema tests cover valid input, structured Zod errors, missing fields, extra keys, and malformed JSON.
  - All existing tests remain green: core 253/253, PIX 28/28, KYC 14/14, primitives 13/13.

- d8c11b7: Phase 6.5 — Sample scenarios for PIX + KYC, scenario-conformance tests, and `pack init` template extension.

  ## `@adjudicate/pack-payments-pix` — `scenarios/` directory

  Six declarative JSON scenarios covering every Decision outcome:

  | File                                  | Outcome              | Tests                                              |
  | ------------------------------------- | -------------------- | -------------------------------------------------- |
  | `01-refund-execute.json`              | EXECUTE              | small refund (1000 centavos) on confirmed charge   |
  | `02-refund-request-confirmation.json` | REQUEST_CONFIRMATION | medium refund (60000) crosses confirm threshold    |
  | `03-refund-escalate.json`             | ESCALATE             | large refund (150000) crosses supervisor threshold |
  | `04-refund-rewrite-overshoot.json`    | REWRITE              | refund > charge amount is clamped down             |
  | `05-charge-create-defer.json`         | DEFER                | charge.create parks awaiting webhook               |
  | `06-refund-refuse-not-found.json`     | REFUSE               | refund against nonexistent charge                  |

  `tests/scenarios.test.ts` programmatically asserts every scenario produces its `expected.kind` — runs in CI alongside the existing `pnpm test`. No CLI dep needed; the test uses `@adjudicate/core` + the Pack's exported `rehydratePixState`.

  New `test:scenarios` script + `@adjudicate/cli` devDep enables manual verification: `pnpm build && pnpm --filter @adjudicate/pack-payments-pix test:scenarios` renders the diff summary with color-coded results.

  ## `@adjudicate/pack-identity-kyc` — `scenarios/` directory

  Six scenarios covering the async lifecycle + AML branch + system-only-kind taint defense:

  | File                                | Outcome  | Tests                                   |
  | ----------------------------------- | -------- | --------------------------------------- |
  | `01-kyc-start-defer.json`           | DEFER    | `kyc.start` always defers for documents |
  | `02-kyc-upload-defer.json`          | DEFER    | `kyc.document.upload` defers for vendor |
  | `03-vendor-execute-high-score.json` | EXECUTE  | callback CLEAR + score ≥ 90             |
  | `04-vendor-refuse-low-score.json`   | REFUSE   | callback CLEAR + score < 50             |
  | `05-vendor-escalate-aml-flag.json`  | ESCALATE | callback FLAGGED                        |
  | `06-vendor-taint-refuse.json`       | REFUSE   | UNTRUSTED actor on system-only kind     |

  Same conventions as PIX: `tests/scenarios.test.ts` for CI, `test:scenarios` script for dev convenience.

  ## `@adjudicate/cli` — pack-init template scenarios

  The `adjudicate pack init <name>` template now scaffolds:
  - `scenarios/example-execute.json` — minimal sample exercising the default policy.
  - `package.json` with `test:scenarios` script wired to `adjudicate simulate --pack ./dist/index.js --scenarios ./scenarios`.
  - `@adjudicate/cli` declared as devDep so the script resolves locally.
  - `files: ["dist", "scenarios", "README.md"]` so published Packs ship scenarios alongside the built code.

  The post-init message in `pack init` now includes the scenario-test hint:

  ```
  Next steps:
    cd <pack-dir>
    pnpm install                                       # picks up the new package
    pnpm test                                          # runs conformance tests
    pnpm build && pnpm test:scenarios                  # runs ./scenarios/*.json against the policy
    adjudicate pack lint                               # validates against the kernel
  ```

  ## Why two test mechanisms

  Each Pack now has _both_:
  1. `tests/scenarios.test.ts` — runs in vitest, no external bin needed, runs on every `pnpm test`.
  2. `test:scenarios` script — invokes the CLI, gives the same color-coded summary table adopters see.

  The vitest one is the CI gate (auto-runs, no extra wiring). The CLI script is for adopters — when a policy change flips outcomes, they get the readable diff output, not a vitest assertion error.

  ## Verification
  - PIX scenarios: 6/6 produce their expected outcomes
  - KYC scenarios: 6/6 produce their expected outcomes
  - PIX tests: 29 (28 prior + 1 new scenarios test)
  - KYC tests: 15 (14 prior + 1 new scenarios test)
  - CLI: 48/50 unchanged (2 pre-existing pack-init template-path failures persist)
  - All affected packages lint clean

  Manual smoke test confirmed: `pnpm --filter @adjudicate/pack-payments-pix test:scenarios` and the KYC equivalent both render the six-row summary table with `6 matched` and exit 0.

### Patch Changes

- d8c11b7: Phase 6.3 — ANSI-boxed `simulate` text renderer + `nameGuard` helper.

  ## `@adjudicate/cli` — rounded-box text renderer

  The `simulate` command's default text output is now a fixed-width rounded-box layout with four sections: decision header, intent metadata, per-guard trace, and decision-specific detail (refusal / escalation / prompt / defer / rewrite).

  Sample:

  ```
  ╭─ DECISION: REQUEST_CONFIRMATION ─────────────────────────────────────────────╮
  │ Pack       pack-payments-pix                                                 │
  │ Kind       pix.charge.refund                                                 │
  │ Actor      llm/sess-1                                                        │
  │ Taint      UNTRUSTED                                                         │
  │ Nonce      n-1                                                               │
  │ Hash       460891c47222...                                                   │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Trace                                                                        │
  │   kill                                                                pass   │
  │   schema                                                              pass   │
  │   state[0]     escalateFailedConfirm                                  pass   │
  │   ...                                                                        │
  │   business[3]  requestConfirmForMediumRefund                          MATCH  │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Basis                                                                        │
  │   schema     / version_supported                                             │
  │   ...                                                                        │
  │   business   / rule_satisfied                                                │
  │                rule:      confirm_threshold_reached                          │
  │                threshold: 50000                                              │
  │                requested: 60000                                              │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ Prompt                                                                       │
  │   You're about to refund R$ 600.00. Confirm?                                 │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

  - Width: terminal-adaptive, clamped to `[70, 120]`. Override via `RenderOptions.width` programmatically.
  - Color: chalk-styled, auto-disabled under `NO_COLOR=1` or non-TTY stdout.
  - Visual-width math is ANSI-escape-aware, so styled spans align correctly.
  - Long values (refusal `userFacing`, escalate `reason`, rewrite reason) word-wrap to the inner column.
  - `expected.kind` mismatch surfaces inline as `MISMATCH (got X)` in yellow.
  - Decision-specific detail blocks: `Refusal` (kind/code/user-facing/detail), `Escalation` (to/reason), `Prompt` (REQUEST_CONFIRMATION), `Defer` (signal/timeoutMs), `Rewrite` (reason/new kind/new hash). EXECUTE has no detail block — basis alone tells the story.

  `render(output, format, options?)` signature is unchanged on call sites; the new `options.width` is optional.

  ## `@adjudicate/core` — `nameGuard(name, guard)` helper

  Exported from `@adjudicate/core/kernel`. Attaches a stable `Function.name` to factory-built guards so they appear in `AdjudicationTraceEntry.guardName`:

  ```ts
  import { nameGuard } from "@adjudicate/core/kernel";
  import { createThresholdGuard } from "@adjudicate/primitives";

  const escalateLargeRefunds = nameGuard(
    "escalateLargeRefunds",
    createThresholdGuard({ ... }),
  );
  ```

  Guards declared as named consts (`const validateAmount: Guard = ...`) already get useful names via TS's variable-name inference — `nameGuard` is only needed when the guard comes back as an anonymous closure from a factory.

  Implementation: `Object.defineProperty(guard, "name", { value, configurable: true, writable: false })`. Idempotent (re-naming is allowed via `defineProperty`); preserves the guard's type identity (pass-through return).

  ## `@adjudicate/pack-payments-pix` — apply `nameGuard` to factory-built guards

  `escalateLargeRefunds`, `requestConfirmForMediumRefund`, `deferChargeCreate` now carry their names in trace output. Inline-arrow guards (`validateChargeAmount`, `clampRefundToOriginal`, `escalateFailedConfirm`, etc.) were already named via TS inference; no change there.

  ## `@adjudicate/pack-identity-kyc` — apply `nameGuard` to factory-built guards

  `requireDocumentUpload`, `waitForVerification`, `refuseLowScore`, `executeOnHighScore` now carry their names in trace output.

  ## Verification
  - 15 new renderer tests cover box framing, width clamping, section ordering, all six decision detail blocks, trace name/index formatting, expected/mismatch indicators, and JSON-format parseability.
  - All existing tests remain green: core 253/253, primitives 13/13, PIX 28/28, KYC 14/14, CLI scenario+simulate 18/18.
  - Manual smoke-test against PIX for all six outcomes confirms readable terminal output with correct alignment, colors, and decision-specific details.

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
