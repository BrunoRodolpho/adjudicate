# @adjudicate/web

## 0.1.7

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/admin-sdk@6.0.0
  - @adjudicate/audit@6.0.0
  - @adjudicate/pack-deployments-approval@0.4.2
  - @adjudicate/pack-identity-kyc@0.3.2
  - @adjudicate/pack-payments-pix@0.3.2
  - @adjudicate/primitives@0.4.2

## 0.1.6

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/admin-sdk@5.0.0
  - @adjudicate/audit@5.0.0
  - @adjudicate/pack-deployments-approval@0.4.1
  - @adjudicate/pack-identity-kyc@0.3.1
  - @adjudicate/pack-payments-pix@0.3.1
  - @adjudicate/primitives@0.4.1

## 0.1.5

### Patch Changes

- 5310f7d: feat(web,pack-identity-kyc,pack-deployments-approval,primitives): 101 — freeze the on-path escalate-only compliance-signal contract and close the documented-vs-enforced `amlStatus` enum drift. The contract is realized by three already-shipped, structurally escalate-only guards — the tiered session-risk guard (`primitives/src/session-risk.ts`), the regression-score escalate guard (`pack-deployments-approval/src/policies.ts`), and the AML-flag escalate guard (`pack-identity-kyc/src/policy.ts`) — each ordered ahead of any clamp/allow/EXECUTE branch so a compliance signal can only raise friction, never waive a gate. 101 FREEZES that shape with non-vacuous conformance tests and is otherwise a doc-alignment change: NO guard logic, NO basis vocabulary, and NO `intentHashInput` change. §C monotonicity (a signal sets a ceiling, never a floor; only deterministic rules authorize EXECUTE), the closed 6-outcome `Decision` algebra (§D #2), and replay-determinism (§D #5) are all preserved.
  - **`@adjudicate/web` (`src/content/intent-schemas.ts`) — the only production source change (drift closure):** align the public `kyc.vendor.callback` schema doc's `amlStatus` enum from the stale lowercase 3-value `"clear" | "hit" | "pending"` to the ENFORCED `"CLEAR" | "FLAGGED"` (`pack-identity-kyc/src/types.ts:43`), and update the `amlMatchScore`/`amlMatchEntity` field copy that referenced `"hit"`. Before this fix a callback sent with the documented `"hit"` silently failed the enforced `amlStatus === "FLAGGED"` discriminator and fell through to score handling / default REFUSE — it never escalated. Doc-only: no runtime enum or guard logic changes.
  - **`@adjudicate/pack-identity-kyc` (`tests/kyc.test.ts`) — contract freeze (tests only, no src change):** add a COMPILE-TIME `AmlStatus` enum-shape lock (fails to type-check if the enum ever drifts from exactly the two UPPERCASE values, the type-side complement to T6); add the drift-closure backstop pinning that a documented-but-unenforced AML value (lowercase `"hit"`) does NOT escalate (it falls through to the score path), demonstrating WHY the doc must equal the enforced enum; add a conformance fixture asserting ONLY the enforced UPPERCASE `"FLAGGED"` escalates over any score while `CLEAR` never does. The escalate discriminator (`policy.ts:196 amlStatus !== "FLAGGED"`) and the guard ordering (`escalateOnAmlFlag` before `refuseLowScore`/`executeOnHighScore`) are UNCHANGED; the `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/pack-deployments-approval` (`tests/gates.test.ts`) — contract freeze (tests only, no src change):** add a FROZEN escalate-only contract block proving the regression-score signal (`escalateRegressionScore`, ordered before all clamp/allow guards) is structurally non-downgradable: a sub-threshold `aiEvalScore` ESCALATEs and wins over a REWRITE (dirty region) AND over a REQUEST_CONFIRMATION (model change), and across the whole sub-threshold band never authorizes EXECUTE. The pre-existing precedence (`gates.test.ts:96-99`) and replay-determinism (`gates.test.ts:101-107`) tests are kept green.
  - **`@adjudicate/primitives` (`tests/session-risk.test.ts`, `tests/m2-factories.test.ts`) — contract freeze (tests only, no src change):** freeze `createSessionRiskGuard` as escalate-only — a full-range sweep of accumulated risk asserts it only ever abstains or emits REFUSE/ESCALATE/REQUEST_CONFIRMATION/REWRITE (never EXECUTE/DEFER) and abstains below the `minCount` warm-up floor (`session-risk.ts:135`) no matter how high the risk; freeze `createEscalateGuard` as a thin escalate-only alias — it abstains unless the predicate matches AND the value crosses the threshold, and the ONLY non-null disposition it can emit is ESCALATE (`onCross` pinned to `decisionEscalate`, `guards.ts:432-457`), across both comparators and routes.

  `@adjudicate/core` is UNCHANGED by 101 (the closed `validation`/`business` basis vocabularies and the constitutional invariants are confirmed via `core test` + `core test:invariants`, T9). Rollback: revert the branch `feat/merged-101-compliance-signal-contract` — the change set is a single doc-content alignment plus contract tests over already-shipped guards, so revert is a clean `git revert` with no data migration and no feature flag.

- 374edfa: marketing(web): 131 — re-pitch playground receipt copy to keyless `auditHash` reality.

  Copy + diagram-only Layer-13 plan. NO kernel, pack, runtime, or response-shape change: the `PlaygroundResponse { decision, record, packId, packName, trace }` contract, the closed 6-outcome `Decision` algebra (constitutional invariant 2), the `intentHash` recipe (invariant 4), and the guard order are all preserved by construction. The re-pitch is grounded against the running code (`kernel-runner.ts` wires `adjudicateAndAudit(envelope, state, policy, { sink })` — no signer, no ledger, no `RuntimeContext`), and the §5 gates re-run the unchanged suites that PIN that behavior.

  The playground demo emits a record that carries an `auditHash` only (keyless sha256 tamper-evidence): `buildAuditRecord` always sets `auditHash` and only attaches `signature` when a signer is injected, `prevAuditHash` when a chain link is supplied, and `kernelIdentity` when a `RuntimeContext` is present — none of which the playground wires. Marketing copy that asserted "signed receipt" (16+ sites) and "hash-chained, signed receipt" (home/StepReceipt.tsx) therefore overclaimed on the demoed path.
  - **StepReceipt.tsx (centerpiece, T1).** The receipt headline copy now reads "tamper-evident, replayable receipt" with an `auditHash` callout instead of "tamper-evident, hash-chained, signed receipt". The annotation rail's `auditHash` entry reframes to keyless tamper-evidence (drops the false "chaining to the record before it" claim); the `signature` entry becomes a `signature · prevAuditHash` entry that honestly attributes non-repudiation and the inter-record hash-chain to the impure production shell (§D: the kernel decides; the shell signs and persists) and states the demo record shows an `auditHash` and no `signature`. The persistence rail notes the demo keeps records in memory only.
  - **Playground-path copy reconciled (T1).** Hero, Playground, PlaygroundEntry, MagicMoment, OutcomesBento, StepConsole, GuidedCaseRunner, GuidedStep, ConsoleHandoff, RecipeLayout, guided-cases content, the `/playground` and `/how-it-works` route copy, the `recipes` page heading, and the site-wide `layout.tsx` metadata description now say "tamper-evident (replayable) receipt/decision" wherever they previously promised a "signed" receipt on the demoed path. Full-product / persisted-backend claims where signing + the hash-chain are genuinely delivered (FAQ "hash-chained AuditRecord with an optional signature", WhoItsFor persisted bank replay, Positioning/SocialProof/DepthLinks architecture claims, the v1 product-ships-signed-receipts announcement) are left intact — they do not describe the playground receipt path.
  - **Stale cross-reference removed (T4, GuardMetadataGraph.tsx).** The "the playground surfaces the same data interactively per Pack" copy pointed at the never-mounted `PackInspector`; it now states this `/introspection` view reads `/api/playground/policy` live and links the playground only for running intents end to end.
  - **Live consumer/provider boundary reconciled (T5/T6).** `policy-context.tsx` doc reflects that the shipped consumer of `/api/playground/policy` is `GuardMetadataGraph` on `/introspection` (fetched directly), and that `PackInspector`/`PolicyProvider` are not in a mounted tree. The `outcome-distribution/route.ts` doc states its in-memory sink records are NOT persisted, NOT hash-chained, NOT signed (`auditHash` only).
  - **Test (kernel-runner.test.ts).** Adds a non-vacuous shape assertion that the record `runPlayground` returns carries an `auditHash` (64-char hex) and has no `signature` / `prevAuditHash` / `kernelIdentity` — the canonical backstop that keeps the new copy grounded.

- f88f889: test(web): 132 — pin the playground's advertised scenarios to the real kernel (conformance + route tests).

  Terminal Layer-13 plan. TEST-ONLY + content-truth: NO kernel, pack, runtime, or response-shape change. The `PlaygroundResponse { decision, record, packId, packName, trace }` contract, the closed 6-outcome `Decision` algebra (constitutional invariant 2), the `intentHash` recipe (invariant 4), the `state→taint→auth→business→default` guard order, §C monotonicity, and §D-6 fail-closed are all preserved by construction. The new tests drive the SAME `runPlayground` / `POST /api/playground/adjudicate` path as production, so a marketing literal that drifts from real Pack policy now fails CI instead of only surfacing in the UI "Heads up" banner.
  - **Guided conformance (new, `src/content/guided-cases.test.ts`, T1).** Table-drives every step of `GUIDED_CASES` through `runPlayground` and asserts `decision.kind === step.expectedKind` for all 14 documented steps (PIX overshoot→REWRITE, mid→REQUEST_CONFIRMATION, small→EXECUTE; KYC start/upload→DEFER; deploy staging→EXECUTE, prod-overshoot→ESCALATE, prod-noapproval→ESCALATE; PII dirty→REWRITE, clean→EXECUTE; token under→EXECUTE, over→REFUSE; cmd safe→EXECUTE, pipe→REQUEST_CONFIRMATION, wipe→REFUSE). Adds a non-vacuity guard (table ≥14) and a §D-5 determinism check (re-running a step yields the identical kind).
  - **Sandbox conformance (new, `src/content/sandbox-schemas.test.ts`, T2).** For every `SandboxIntentSchema`, assembles the form's opening payload from each field's `.default` plus the `stateKnobs[].default` written at its `statePath` into `baseState` (exactly what the Configure-&-test surface opens on), runs `runPlayground`, and asserts the decision is one of the six closed outcomes (§D-2, no 7th kind) and that the intent routed to the expected installed Pack. The content `packId` is a UI-layer slug (`payments-pix`); the kernel returns the real installed id (`pack-payments-pix`, or `pack-pii-demo`/`pack-token-budget-demo`/`pack-terminal-agent` for the inline demo packs), so a slug→kernel-id map (asserted exhaustive) makes the routing check non-vacuous. Per §7 (over-pinning risk) sandbox defaults are NOT pinned to a specific kind — only six-outcome well-formedness + correct routing.
  - **Route handlers (new, `src/app/api/playground/adjudicate/route.test.ts`, T3).** First test under `apps/web/src/app/api`. Pins the route contract: 400 `{ error: "invalid_json" }` on an unparseable body, 400 `{ error: "invalid_body" }` when `intentKind` is not a string / `payload` is not a non-null object (covers `42`, `"nope"`, and `null` payload), a 200 full `PlaygroundResponse` on a valid body (clean ticket → EXECUTE, `auditHash` present, `packId === "pack-pii-demo"`, `trace` array), and the 400 thrown-message branch when no Pack handles the intent.
  - **Record-level (extend, `src/lib/kernel-runner.test.ts`, T4).** Adds an assertion via `recentRecords()` (the in-memory sink the `/api/playground/outcome-distribution` route and console replica read) that the persisted record carries a 64-char-hex `auditHash` and NO `signature` / `prevAuditHash` / `kernelIdentity` — the code-backed source of truth the 131 keyless-receipt copy must match, now covering the persisted feed and not just the value `runPlayground` returns.
  - **Content-truth corrections (§7 literal-drift resolution; content-only, no kernel/pack change).** Pinning surfaced one advertised literal that never matched real Pack policy: the `deploy-prod-overshoot` story (production, 100% ramp, no approval on file) was advertised as REWRITE but the audited decision is ESCALATE. The deployments pack REWRITEs the 100% ramp down to the 25% production cap, then RE-ADJUDICATES the corrected envelope (011 REWRITE re-adjudication); the clamped deploy still has no approval, so `escalateProductionWithoutApproval` fires and the final, audited decision is ESCALATE. Corrected `expectedKind` + `aiProposes`/`whatToWatch`/`narrateByOutcome` in `guided-cases.ts`, and the identical stale "Production at 100% → REWRITE" preset literal + label/description in `pack-presets.ts`, to the true ESCALATE outcome. No kernel/Pack policy was edited — the invariants forbid editing policy to make copy pass.
  - **Homepage REWRITE-centerpiece drift fix + drift-closure test (§7, content-only).** The SAME stale "production / 100% / no-approval → REWRITE" literal also lived in `DECISIONS.REWRITE.playgroundPreset` (`decisions.ts`), which is consumed LIVE (`real: true`) by three homepage centerpieces — `StepReceipt` (renders the live ReceiptCard under a hardcoded REWRITE / `quantity_capped` / 100%→25% annotation rail), `MagicMoment` (reads back `decision.rewritten.payload.rampPercent`), and `StepConsole` (pins the highlighted REWRITE row's real `intentHash`). Driven through `runPlayground` that preset returned **ESCALATE**, so the most prominent marketing page rendered an ESCALATE receipt under REWRITE copy. **Fix:** the REWRITE preset now seeds an `approved` approval in `state` (`production/api/feedface`) so the 100%→25% ramp clamp SURVIVES the 011 re-adjudication (the clamped, now-approved deploy clears the production-approval gate) and the live audited decision is a genuine REWRITE (`rewrittenRamp=25`, basis `quantity_capped`) — making the StepReceipt rail, MagicMoment's ramp readout, and StepConsole's REWRITE-row hash all true. Added an optional `state` field to the `playgroundPreset` shape and threaded `PRESET.state` through the three live `runPlayground` callsites; reconciled the now-false "no recorded approval" prose in `StepActs`/`MagicMoment` to the over-ramp framing (the over-ramp is what REWRITEs). **New drift-closure test (`src/content/decisions.test.ts`):** table-drives every `DECISIONS[k].playgroundPreset` through `runPlayground` and asserts `decision.kind === k` for all six outcomes, plus pins the REWRITE preset's load-bearing shape (`rewrittenRamp === 25`, `quantity_capped` present) — so this drift class is now a build failure for the homepage too. No kernel/Pack policy was edited.

- b78860b: feat(web,pack-identity-kyc): 102 — turn the single-shot AML enum echo into a real sanctions/OFAC screening signal provider. The sanctions result rides as an injected snapshot on the `kyc.vendor.callback` payload and is read by the pure kernel as an on-path, escalate-only compliance signal: it may only ESCALATE to a human (or fall through to REFUSE), never authorize EXECUTE and never waive a downstream gate — preserving §C monotonicity (inv. 7: a compliance signal sets a friction ceiling, never a floor) and the §D kernel-purity invariants (closed 6-outcome algebra, injected snapshot, byte-identical replay). NO change to `intentHashInput`, the basis vocabulary, or any constitutional invariant.
  - **`@adjudicate/pack-identity-kyc` — ground the AML/sanctions signal in the escalate-only primitive contract as a UNION:** the previous `escalateOnAmlFlag` discriminated solely on `amlStatus === "FLAGGED"` and never compared `amlMatchScore` (it was decoration only). The signal now escalates on the UNION of two INDEPENDENT conditions, implemented as TWO escalate-only checks both ordered before `refuseLowScore`/`executeOnHighScore` (so the kernel first-non-null short-circuit structurally prevents any downgrade to EXECUTE):
    - **(a) `escalateOnAmlFlag` (inline, unchanged shape) — `amlStatus === "FLAGGED"`:** a hard, score-INDEPENDENT escalate predicate. A FLAGGED callback with NO `amlMatchScore` still escalates. Kept as its OWN standalone check because `createEscalateGuard` ANDs predicate+threshold and abstains when `extract()` is null/undefined — folding the flag into the score guard would let a missing score gate it out (the §7 regression).
    - **(b) `escalateOnSanctionsMatchScore` (NEW, via `createEscalateGuard`) — `amlMatchScore >= KYC_SANCTIONS_MATCH_THRESHOLD` (80):** grounds `amlMatchScore` as a VALIDATED, range-checked escalate signal instead of a never-compared decoration. A strong watchlist correlation escalates to a human even when `amlStatus` is `"CLEAR"` and the verification score is EXECUTE-grade — purely additive friction. Escalate-only by construction (`onCross` pinned to `decisionEscalate`).
    - Both branches emit ESCALATE → "human" with a business `rule_violated` basis (`rule: "aml_screening"`, `signal: "aml_flag"` | `"sanctions_match_score"`). Adds `KYC_SANCTIONS_MATCH_THRESHOLD = 80` to `types.ts` (re-exported). The business guard count is now 6 (was 5); the conformance test count was updated accordingly. New non-vacuous tests pin: FLAGGED+no-score still ESCALATEs; CLEAR+match≥80 ESCALATEs over an EXECUTE-grade score; CLEAR+match=79 does NOT escalate (real threshold crossing); and a full-range escalate-only precedence sweep (sanctions match never authorizes EXECUTE). The `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/web` (`src/content/intent-schemas.ts`) — finish the signal-shape doc reconciliation (doc-only):** the lowercase 3-value `amlStatus` drift was already closed by 101; 102 updates the `amlStatus`/`amlMatchScore`/`amlMatchEntity` field copy to describe the escalate-only sanctions contract (FLAGGED escalates regardless of score and never authorizes EXECUTE; `amlMatchScore ≥ 80` escalates even when CLEAR). The enforced 2-value UPPERCASE enum (`pack-identity-kyc/src/types.ts`) remains the source of truth; the doc cannot weaken the kernel.

  Rollback: revert the branch `feat/merged-102-sanctions-provider` — a single per-package change with no data migration and no feature flag; revert restores the prior `escalateOnAmlFlag` echo and schema doc.

- Updated dependencies [58cad7a]
- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [9928601]
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
- Updated dependencies [5f37c7c]
- Updated dependencies [cb8d608]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [137c533]
- Updated dependencies [5dfa0e5]
- Updated dependencies [21a7895]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [b78860b]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
- Updated dependencies [94ddc76]
  - @adjudicate/admin-sdk@4.0.0
  - @adjudicate/audit@4.0.0
  - @adjudicate/core@1.5.0
  - @adjudicate/primitives@0.4.0
  - @adjudicate/pack-payments-pix@0.3.0
  - @adjudicate/pack-identity-kyc@0.3.0
  - @adjudicate/pack-deployments-approval@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/audit@3.0.0
  - @adjudicate/pack-deployments-approval@0.3.1
  - @adjudicate/pack-identity-kyc@0.2.2
  - @adjudicate/pack-payments-pix@0.2.2
  - @adjudicate/primitives@0.3.1

## 0.1.3

### Patch Changes

- Updated dependencies [b94372b]
  - @adjudicate/admin-sdk@2.2.0
  - @adjudicate/audit@3.0.0
  - @adjudicate/pack-identity-kyc@0.2.1

## 0.1.2

### Patch Changes

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
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [9f1e379]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
- Updated dependencies [804af8f]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/core@1.3.0
  - @adjudicate/primitives@0.3.0
  - @adjudicate/pack-deployments-approval@0.3.0
  - @adjudicate/audit@3.0.0
  - @adjudicate/pack-identity-kyc@0.2.1
  - @adjudicate/pack-payments-pix@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [9e65871]
- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/audit@2.0.0
  - @adjudicate/admin-sdk@2.0.0
  - @adjudicate/core@1.2.0
  - @adjudicate/primitives@0.2.0
  - @adjudicate/pack-payments-pix@0.2.0
  - @adjudicate/pack-identity-kyc@0.2.0
  - @adjudicate/pack-deployments-approval@0.2.0

## 0.1.0

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
- Updated dependencies [d8c11b7]
- Updated dependencies [2e308f6]
- Updated dependencies [d8c11b7]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/audit@1.0.0
  - @adjudicate/core@1.0.0
  - @adjudicate/pack-payments-pix@0.1.0
  - @adjudicate/pack-identity-kyc@0.1.0
  - @adjudicate/admin-sdk@1.0.0
  - @adjudicate/pack-deployments-approval@0.1.0
  - @adjudicate/primitives@0.1.0
