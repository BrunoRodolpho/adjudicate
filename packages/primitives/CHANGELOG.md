# @adjudicate/primitives

## 0.4.4

### Patch Changes

- Updated dependencies [e650c37]
  - @adjudicate/core@1.9.0

## 0.4.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0

## 0.4.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0

## 0.4.0

### Minor Changes

- 5a261ef: feat(core): 032 — authority-graph data model + store + PURE ownership resolver. Add the `AuthorityGraph` snapshot model (`principal —relationship→ resource —permits→ {actions, limits}`, index §G) co-located with the actor/envelope contracts in `envelope.ts`: new `AuthorityRelationship` (`owns`/`joint`/`advisor`/`custodian`), `AuthorityPermits`, `AuthorityEdge`, `AuthorityGraph` types. The graph is an IMMUTABLE INJECTED SNAPSHOT (index §B/§D) — it is NOT an envelope field and does NOT enter the `intentHashInput` pre-image (`intentHashInput`/`EXPECTED_ENVELOPE_KEYS` are byte-identical to their post-031 value; every existing envelope hash is unchanged). In `decision.ts` add `createAuthorityGraphStore` (a read-only, frozen-snapshot lookup with a pure `edgesFor(principal, resource)`) and the pure `resolveOwnership(store, envelope) => OwnershipFact` resolver: it binds the envelope's declared owner/resource (`resourceRefs`, 031) to the snapshot and returns a FACT (`{ principal, resource, bound, relationships, permits, edges }`) — NEVER a `Decision` (index §B), so it can never authorize EXECUTE or lower friction (index §C). `hashAuthorityGraph` content-addresses the snapshot via `@adjudicate/canonical` for replay (invariant #5). PURE & synchronous (no clock/RNG/IO, kernel-purity §D). The closed 6-outcome `Decision` algebra is UNTOUCHED — no 7th outcome, no `confidence`/`metadata` field (invariant #2). ADDITIVE: no pack policy, no authority guard (034), no AC-007 (035).

  feat(canonical): 032 — add `canonicalSnapshot` / `sha256SnapshotCanonical`, intent-revealing aliases over `canonicalJson` / `sha256Canonical` for injected-snapshot serialization (authority-graph + future aggregate/limit snapshots). They DELEGATE byte-for-byte — same NFC normalization, same `RangeError` on non-finite, same undefined-elision — so a recorded snapshot replays bit-identically (invariant #5) and never drifts from `intentHash` semantics; NO forked canonicalizer (index §B caveat). Re-exported from `@adjudicate/core` via `hash.ts`. Golden-vector tests pin authority-graph snapshot canonicalization (key-order insensitivity, edge-array order significance, NFC, fail-on-non-finite, tamper-evidence).

  feat(primitives): 032 — add `ownershipBindingPredicate`, the seam that adapts an `OwnershipFact` to the EXISTING `requireTenantBinding(isActorBoundToTenant)` predicate shape `(actor, state) => boolean` (identity on `OwnershipFact.bound`) so plan 034 can wire a constitutional authority guard onto a pack's `authGuards` WITHOUT reshaping the fact. Seam ONLY — 032 wires NO guard; PIX/access bundles still ship `authGuards:[]`. Pure; browser-safe; no authorization (a `false` lets `requireTenantBinding` REFUSE — raise friction — never EXECUTE).

  feat(conformance): 032 — extend `ConformanceOptions` with an optional `authorityGraph` snapshot so a later authority/ownership check (035 AC-007) can be fed the graph deterministically without another options change. Surface only: `DEFAULT_CHECKS` (AC-001..AC-006, AC-008) is unchanged, AC-007 stays out of scope (035), and `runConformance` does NOT throw on the option's presence/absence (a report with the snapshot supplied is identical to one without).

- f072839: feat(primitives,red-team): 034 — ship the constitutional authority guard PRIMITIVE (`createAuthorityGuard`), a real, FAIL-CLOSED authority guard so 035 can wire a `tenant_binding_violation` refusal onto a shipped mutating decision path (constitutional invariant §D #8). 034 ships the PRIMITIVE ONLY — it does NOT inject at install (`install.ts` is UNCHANGED) and does NOT persist; the single-owner per-pack wiring into `authGuards` (preserving kernel order `state→taint→auth→business` so taint short-circuits before auth, §D #3) is 035's job.
  - **`@adjudicate/primitives` (`src/guards.ts`, `src/index.ts`):** add `createAuthorityGuard<K,P,S>(resolveOwner, options?)`, modeled on the existing `requireTenantBinding` and the fail-closed blanket pattern of `createSideEffectTaintFloor`. It returns a kernel `Guard<K,P,S> = (envelope, state) => Decision | null` (arity-2 — the kernel never hands a guard identity/RuntimeContext, so the authority FACT flows through injected `state`). `resolveOwner(envelope, state)` produces the `OwnershipFact` (032's `resolveOwnership(store, envelope)` over the injected authority-graph snapshot from 032/033 read from `state`); the guard returns `null` (continue) ONLY when `fact.bound === true` (an edge binds the declared owner to the declared resource) AND — when the `authenticatedPrincipal` seam is supplied — the resolved owner principal equals the authenticated principal; it REFUSEs `SECURITY` / `tenant_binding_violation` with basis `auth.scope_insufficient` (the SAME test-pinned codes `requireTenantBinding` emits) on EVERY other case: declared owner not bound, absent/unresolvable owner ref, an empty/misconfigured snapshot, an authenticated-principal mismatch, OR a `resolveOwner`/`authenticatedPrincipal` that THROWS (caught and REFUSEd, never propagated as a fail-open `null`). There is no code path that returns `null` on an unresolvable owner or unresolved authenticated principal — absence defaults to friction, never bypass (§D #6, §C monotonicity: this is `EXECUTE→REFUSE` only). Emits only members of the closed 6-outcome `Decision` union (`REFUSE` | `null`); adds no `confidence`/free `metadata` (§D #2). Pure & synchronous (no clock/RNG/IO); browser-safe. Exported from the primitives barrel (`createAuthorityGuard` + `AuthorityGuardOptions`) for 035 to wire — `createAuthorityGuard` supersedes `requireTenantBinding` as the authority primitive 035 wires.
  - **⚠️ KNOWN RESIDUAL — the BARE ownership-binding wiring does NOT close the IDOR class (handed forward to the actor-identity / v3-actor-model plan).** Under the canonical wiring `resolveOwner=(env,store)=>resolveOwnership(store,env)`, the `OwnershipFact.principal` is read from `envelope.resourceRefs.owner` — an ATTACKER-CONTROLLED envelope field (031). Nothing in the bare wiring ties that declared owner to the AUTHENTICATED actor, because there is no authenticated identity to bind: `IntentActor.principal` is the provenance enum `"llm"|"user"|"system"` only (it carries no owner/account identity) and `attestation` is an unimplemented stub. So a caller that forges `resourceRefs.owner = <a real, snapshot-bound victim principal>` PASSES the bare check (the snapshot binds that victim to the resource), even though the authenticated session is not that principal — a full IDOR bypass. The bare wiring enforces the real-but-weaker invariant "the DECLARED owner genuinely owns the resource"; it does NOT enforce "the AUTHENTICATED actor IS that owner". **To actually close IDOR, supply `options.authenticatedPrincipal`** — a host-side resolver that derives the acting principal from `envelope.actor` (or a `state` identity map keyed by `actor.sessionId`), NEVER from `resourceRefs.owner`. With the seam supplied, the guard additionally requires `OwnershipFact.principal === authenticatedPrincipal`, so a forged victim owner ref no longer passes. **035 must NOT wire the bare resolver onto a mutating kind and advertise it as IDOR-closed**; it must supply `authenticatedPrincipal` (or defer to the actor-identity plan that introduces a verifiable resolved actor identity).
  - **`@adjudicate/red-team` (`src/vectors/taint-escalation.ts`, `src/index.ts`):** add `generateOwnershipViolationEnvelopes` (tagged `taint_escalation`), an ownership/IDOR vector that, for each MUTATING UNTRUSTED-min kind (where the taint gate does NOT short-circuit — the exact gap the authority guard closes), emits two shapes: an UNTRUSTED actor declaring a FORGED `owner` ref for a resource the snapshot binds to a DIFFERENT principal (the honest-unbound case the bare wiring defends), AND an IMPERSONATION case that forges `owner = <the real snapshot-bound victim principal>` (the case that DEFEATS the bare wiring and is only defended once `authenticatedPrincipal` is supplied). Exported from the barrel; the wired-into-shipped-packs red-team coverage + AC-007 land in 035 (the vector targets UNTRUSTED-min kinds the taint gate leaves silent, so a defended result genuinely exercises the OWNER predicate, not the taint floor).

  The pure `adjudicate()` decision path, the closed 6-outcome `Decision` algebra, and `intentHashInput` are UNCHANGED (the guard reads injected `state`, not the hashed envelope pre-image — invariants #4/#5 preserved). The guard BODY is not sealed by ConfigSeal (`describePolicyBundle` reads guard metadata/code-artifacts, never the closure body) — a known residual handed to GROUP 08 (081 signs guard code), unchanged by 034.

- c0b1b44: feat(core): 042 — contaminating session-flag model on the origin axis (consumes 041). Make untrusted ORIGIN contaminating at the session level so an LLM-proposed intent that follows retrieved/external content in context no longer re-enters the loop byte-identical to a user-induced proposal. Adds to `taint.ts`: `isContaminatingOrigin(origin)` (the pure predicate over the closed `Origin` union — `Retrieved`/`ExternalAPI` are contaminating; `Human`/`System`/`LLM` are not), the `SessionContamination` flag type (`{ taint; origin }`), `applySessionContamination(declaredTaint, flag)` (the monotonic lattice-meet fold — minted taint = `mergeTaint(declared, contamination.taint)`, never raises trust), and `contaminateSession(prior, datum)` (monotonic accumulation that only ever tightens; preserves the FIRST contaminating origin as the audit anchor). The pure kernel taint gate (`kernel/adjudicate.ts`) now reads `envelope.origin` READ-ONLY (already in the intentHash pre-image from 041) to ATTRIBUTE a sub-minimum `canPropose` refusal: a contaminating origin populates the previously-UNUSED `taint:propagation_violation` basis (instead of the bare `taint:level_insufficient`) so audit can distinguish a contamination-lowered refusal from a declared-untrusted one. This is NOT a 7th outcome (still REFUSE), NOT a new guard phase, NOT a friction change, and adds NO IO — kernel purity (§D), guard order #3 (taint short-circuits before auth), the closed 6-outcome algebra #2, the intentHash recipe #4, and monotonicity #7 are all preserved. The pre-existing 041 invariant `origin-not-gated.property.test.ts` is EVOLVED in lock-step (origin still never changes the Decision KIND; `propagation_violation` now appears ONLY on a taint REFUSE AND ONLY for a contaminating origin).

  feat(primitives): 042 — adopter-facing `createSessionContaminationPolicy({ enabled })` factory (DEFAULT OFF) + `SessionContaminationPolicy`/`SessionContaminationPolicyOptions` types, mirroring `createSystemTaintPolicy` so "is contamination enabled for this Pack?" is a one-line single-sourced audit. Default OFF keeps existing deployments byte-identical to pre-042.

  feat(adapter-core): 042 — fold the per-session contamination flag into the minted taint at the SINGLE envelope-minting seam (`loop.ts`), replacing the former unconditional `taint:"UNTRUSTED"` literal with the lattice meet of the declared taint and the session contamination taint, applied BEFORE `buildEnvelopeFromToolUse` hashes (so the contaminated taint/origin are inside the intentHash pre-image #4 — an LLM cannot post-hoc flip them). An authorized READ that SERVES a datum (the laundering leg) contaminates the session (treated as `Retrieved`); the next minted LLM intent then inherits the lowered taint and the contaminating origin stamp. `buildEnvelopeFromToolUse` (`bridge.ts`) threads an optional `contamination` arg via `applySessionContamination` (monotonic; idempotent under the loop's pre-meet); `routeReadThroughKernel` (`decisions.ts`) returns a `served` flag; `AdjudicatedAgentOptions.contamination` (`types.ts`) is the adopter opt-in (DEFAULT OFF — option omitted is byte-identical to pre-042). Clearing is structural: a fresh `runLoop` (including the authenticated `resume()` path) starts uncontaminated — never an LLM-controlled action.

  feat(red-team): 042 — land the `provenance_injection` (contamination / data-provenance) vector that 041 only opened the union seam for. New `vectors/provenance-injection.ts` generator: for each system-only intent kind, an UNTRUSTED envelope stamped with a CONTAMINATING origin (`Retrieved`/`ExternalAPI`), sourced from `planner.visibleReadTools` (the 041 declared-but-unconsumed seam — the READ→inject→intent path), expecting REFUSE. `ScenarioIntent` gains an optional, canonical-drop-safe `origin` (the runner threads it only when present, so existing vectors hash and decide byte-identically). Wired into `generateAllVectors`. Non-vacuity: against a pack whose state guards do not pre-empt the taint gate the kernel REFUSEs every contaminated proposal with `taint:propagation_violation`.

  feat(cli): 042 — wire `generateProvenanceInjectionEnvelopes` into the `adjudicate red-team` command's per-vector dispatch (the `provenance_injection` key already in `ALL_VECTORS` now produces real scenarios instead of zero).

- 0d83e43: feat(core,primitives,red-team,cli): 043 — origin-aware policy branch at the kernel taint gate + READ→inject→intent red-team vector (consumes 041/042). Close the laundering gap 042 cannot reach: an UNTRUSTED-min MUTATING intent whose trust-rank floor (`canPropose`, `1 >= 1`) ALWAYS passes regardless of where the bytes came from, so a `READ`→inject→intent path re-enters byte-identical to a user-induced intent and cleanly EXECUTEs. 043 adds the real per-intent propagation gate that actually FLIPS such a decision when the proposal traces to a contaminating origin, plus a 4th red-team vector that proves it catches what current packs honestly fail. Default-OFF / dark-ship: with no policy opt-in, behaviour is byte-identical to pre-043.
  - **`@adjudicate/core` (T2 `src/taint.ts`):** add the OPTIONAL `TaintPolicy.requiresUncontaminatedOrigin?(kind): boolean` method and the new `canProposeWithOrigin(taint, kind, origin, policy)` gate. The gate is MONOTONIC by construction: it first applies the unchanged trust-rank floor (`canPropose`) and NEVER authorizes a proposal the floor rejects; it only ADDS friction — when the floor passed but the policy marks the kind origin-required AND the origin is contaminating (`isContaminatingOrigin` — `Retrieved`/`ExternalAPI`), it returns `false`. A policy without the method (or returning `false`) falls straight through to the `canPropose` result, so every existing `{ minimumFor }` policy is unaffected. Pure: a function of `(taint, kind, origin, policy)` only — no clock/RNG/IO. Re-exported via the package barrel (`export * from "./taint.js"`).
  - **`@adjudicate/core` (T1 `src/kernel/adjudicate.ts`):** the single taint-gate call site now calls `canProposeWithOrigin` (alongside the rank-floor `canPropose`, used only to ATTRIBUTE the refusal). When the origin branch fires (rank floor would have PASSED but the proposal laundered its provenance), the refusal is attributed to the latent `taint:propagation_violation` basis with a distinct message and a `detail.branch === "origin_required"` marker; a `requiresUncontaminatedOrigin` that throws fails CLOSED as a taint-phase `kernel:guard_panic`. The 042 rank-floor attribution path (sub-minimum + contaminating origin → `propagation_violation` without the branch marker) is preserved exactly. Still a REFUSE (no 7th outcome), still one envelope-level call, still ahead of auth (guard order #3); `intentHash` reads only the already-bound `origin` + payload provenance — NO new field enters the hash pre-image (#4).
  - **`@adjudicate/core` (`src/basis-codes.ts`):** document the dual emission of the (already-present) `taint.PROPAGATION_VIOLATION` code — 042 ATTRIBUTION vs 043 ORIGIN-BRANCH (`detail.branch === "origin_required"`). No vocabulary/category change.
  - **`@adjudicate/primitives` (T3 `src/taint.ts`):** extend `createSystemTaintPolicy` with the OPT-IN `originRequiredKinds?: ReadonlyArray<string>` option. When at least one kind is declared, the returned policy ALSO carries `requiresUncontaminatedOrigin`; when absent/empty the method is OMITTED entirely so the policy shape is byte-identical to pre-043. `minimumFor` is unchanged for every kind (the trust-rank floor is untouched) — listing a kind can ONLY add friction.
  - **`@adjudicate/red-team` (T4 `src/scenario.ts` + `src/runner.ts`):** add the 4th `AttackVector` member `read_inject_intent` (additive/MINOR) and the matching `emptyByVector()` key so the runner's exhaustive Record stays total over the closed union.
  - **`@adjudicate/red-team` (T5 `src/vectors/taint-escalation.ts` + `src/vectors.ts` + `src/index.ts`):** add `generateReadInjectIntentEnvelopes` and register it in `generateAllVectors`. It targets ONLY UNTRUSTED-min kinds the pack MARKS origin-required (skips elevated-min kinds — those belong to the trust floor / the 042 provenance vector — and emits NOTHING for a pack that declares none, so it is never vacuous), stamps a contaminating origin + a READ-tool laundering source drawn from the previously-unconsumed `planner.visibleReadTools` seam (synthetic fallback otherwise), and expects REFUSE.
  - **`@adjudicate/cli` (T6 `src/commands/red-team.ts`):** surface the `read_inject_intent` vector through the existing `red-team` command (added to `ALL_VECTORS` + the per-vector dispatch) without changing its contract.

  Tests: kernel-gate origin-branch unit tests + a new invariant suite (`tests/kernel/invariants/origin-policy-branch.property.test.ts`) pinning MONOTONICITY (an origin-aware policy never EXECUTEs where its origin-blind twin REFUSEd), DARK-by-default byte-identity (a no-branch / disabled policy is identical to a plain `{ minimumFor }` policy), the `origin_required` branch-marker appearing only on a rank-PASS REFUSE for a contaminating origin, and replay byte-identity (#4); `canProposeWithOrigin` unit/property tests; policy-factory tests for `originRequiredKinds`; red-team generator NON-VACUITY (the kernel REFUSEs the laundered proposal via the 043 branch, basis `taint:propagation_violation`, NOT `level_insufficient`) + CONTROL tests (clean origin EXECUTEs; a pack without the branch lets it ESCAPE); CLI smoke tests (vector wired for PIX as a no-op; fires and is defended for an origin-required fixture pack). The pre-existing 041/042 `origin-not-gated.property.test.ts` invariant is UNCHANGED and still passes — its plain-policy fixtures never trip the opt-in 043 branch.

  Kernel purity (§D), the closed 6-outcome `Decision` algebra (#2), the guard order (#3, taint short-circuits before auth), `intentHashInput` (#4, no new field), and monotonicity (§C / #7) are all preserved. Rollback: contained to the listed packages on `feat/merged-043-origin-policy-redteam`; disable the policy option (or revert the branch) to restore the single rank-floor `canPropose` call and the 3-member `AttackVector` union with no residual schema/hash change.

### Patch Changes

- 5310f7d: feat(web,pack-identity-kyc,pack-deployments-approval,primitives): 101 — freeze the on-path escalate-only compliance-signal contract and close the documented-vs-enforced `amlStatus` enum drift. The contract is realized by three already-shipped, structurally escalate-only guards — the tiered session-risk guard (`primitives/src/session-risk.ts`), the regression-score escalate guard (`pack-deployments-approval/src/policies.ts`), and the AML-flag escalate guard (`pack-identity-kyc/src/policy.ts`) — each ordered ahead of any clamp/allow/EXECUTE branch so a compliance signal can only raise friction, never waive a gate. 101 FREEZES that shape with non-vacuous conformance tests and is otherwise a doc-alignment change: NO guard logic, NO basis vocabulary, and NO `intentHashInput` change. §C monotonicity (a signal sets a ceiling, never a floor; only deterministic rules authorize EXECUTE), the closed 6-outcome `Decision` algebra (§D #2), and replay-determinism (§D #5) are all preserved.
  - **`@adjudicate/web` (`src/content/intent-schemas.ts`) — the only production source change (drift closure):** align the public `kyc.vendor.callback` schema doc's `amlStatus` enum from the stale lowercase 3-value `"clear" | "hit" | "pending"` to the ENFORCED `"CLEAR" | "FLAGGED"` (`pack-identity-kyc/src/types.ts:43`), and update the `amlMatchScore`/`amlMatchEntity` field copy that referenced `"hit"`. Before this fix a callback sent with the documented `"hit"` silently failed the enforced `amlStatus === "FLAGGED"` discriminator and fell through to score handling / default REFUSE — it never escalated. Doc-only: no runtime enum or guard logic changes.
  - **`@adjudicate/pack-identity-kyc` (`tests/kyc.test.ts`) — contract freeze (tests only, no src change):** add a COMPILE-TIME `AmlStatus` enum-shape lock (fails to type-check if the enum ever drifts from exactly the two UPPERCASE values, the type-side complement to T6); add the drift-closure backstop pinning that a documented-but-unenforced AML value (lowercase `"hit"`) does NOT escalate (it falls through to the score path), demonstrating WHY the doc must equal the enforced enum; add a conformance fixture asserting ONLY the enforced UPPERCASE `"FLAGGED"` escalates over any score while `CLEAR` never does. The escalate discriminator (`policy.ts:196 amlStatus !== "FLAGGED"`) and the guard ordering (`escalateOnAmlFlag` before `refuseLowScore`/`executeOnHighScore`) are UNCHANGED; the `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/pack-deployments-approval` (`tests/gates.test.ts`) — contract freeze (tests only, no src change):** add a FROZEN escalate-only contract block proving the regression-score signal (`escalateRegressionScore`, ordered before all clamp/allow guards) is structurally non-downgradable: a sub-threshold `aiEvalScore` ESCALATEs and wins over a REWRITE (dirty region) AND over a REQUEST_CONFIRMATION (model change), and across the whole sub-threshold band never authorizes EXECUTE. The pre-existing precedence (`gates.test.ts:96-99`) and replay-determinism (`gates.test.ts:101-107`) tests are kept green.
  - **`@adjudicate/primitives` (`tests/session-risk.test.ts`, `tests/m2-factories.test.ts`) — contract freeze (tests only, no src change):** freeze `createSessionRiskGuard` as escalate-only — a full-range sweep of accumulated risk asserts it only ever abstains or emits REFUSE/ESCALATE/REQUEST_CONFIRMATION/REWRITE (never EXECUTE/DEFER) and abstains below the `minCount` warm-up floor (`session-risk.ts:135`) no matter how high the risk; freeze `createEscalateGuard` as a thin escalate-only alias — it abstains unless the predicate matches AND the value crosses the threshold, and the ONLY non-null disposition it can emit is ESCALATE (`onCross` pinned to `decisionEscalate`, `guards.ts:432-457`), across both comparators and routes.

  `@adjudicate/core` is UNCHANGED by 101 (the closed `validation`/`business` basis vocabularies and the constitutional invariants are confirmed via `core test` + `core test:invariants`, T9). Rollback: revert the branch `feat/merged-101-compliance-signal-contract` — the change set is a single doc-content alignment plus contract tests over already-shipped guards, so revert is a clean `git revert` with no data migration and no feature flag.

- d2c3625: feat(core,conformance,adapter-core,primitives,cli): 082 — enforce the SIGNED pack at LOAD time (`installPack`). The adopter's in-process load path now REFUSES to install a Pack whose signature/trust or config seal does not verify, so a swapped/unsigned/tampered Pack cannot become the live adjudication authority (§D-1: only a verified Pack reaches the executor; §D-6: a write-path verification failure ABORTS the install; §C: failure → friction, never bypass). Fail-closed by default; behind the new `verifyOnLoad` option so an absent option is byte-identical to pre-082 (only `assertPackConformance` runs).
  - **T1 (`core/src/install.ts`):** add `VerifyOnLoadOptions` to `InstallPackOptions` and a FAIL-CLOSED provenance gate inside `installPack` that runs AFTER conformance but BEFORE any sink wiring / default install / snapshot recording, so a Pack that does not verify installs NOTHING destructive. The verifiers (`verifyPackTrust` / `verifyConfigSeal`) are INJECTED through `verifyOnLoad` — `@adjudicate/core` takes NO dependency on `@adjudicate/conformance` (which already depends on core; a `core → conformance` import would be a cycle, and the kernel dep allowlist stays clean: `@adjudicate/canonical, @noble/hashes, zod`). Defaults are STRICT at the load boundary: trust policy `require_signature` (NOT the library `best_effort`) and seal policy `require_signature` (NOT `require_digest`), so an UNSIGNED Pack (no signature / no publicKeyPem) refuses the install. A non-verifying report throws the new `PackLoadVerificationError` (axis: `trust` | `config_seal`). New exports: `VerifyOnLoadOptions`, `LoadTrustReport`, `LoadSealReport`, `PackFingerprintLike`, `PackLoadVerificationError` (all additive; recorded in the V1 freeze matrix). The pure `adjudicate()` path and `intentHashInput` are UNTOUCHED — this is impure install-shell wiring (§D).
  - **T2 (`conformance/src/index.ts`):** confirm + document that `verifyPackTrust` (`pack-trust.ts`) and `verifyConfigSeal` (`config-seal.ts`) are the single public verifiers the core load path injects; the pre-existing verifiers are unchanged.
  - **T3 (`adapter-core/src/types.ts`):** document the STRICT KNOB PAIRING on `AgentLoopOptions.configSeal` — operators must set `policy:"require_signature"` + `publicKeyPem` + `engageKillSwitchOnMismatch:true` together for fail-closed runtime posture (the same enforcement the load path runs by default). The runtime enforcement path (`loop.ts` `checkConfigSeal`) already honors this; documented, not silently relied upon (082 §7 risk: lax adapter default).
  - **T4 (`primitives/src/guards.ts`):** inline residual-blind-spot note at the `createRewriteGuard` code-artifact site — a clean seal proves SIGNATURE + sealed-surface provenance, NOT behavioral correctness of every closure (a state-derived `cap` pins the function source, not its runtime value), so load-time enforcement does not over-claim; closing the cap-pinning gap is 081's upstream scope.
  - **T5 (`cli/src/commands/pack-verify.ts`, `cli/src/bin.ts`):** align the `pack verify` command docs with the load-path posture — CI/adopters should run `--policy require_signature --public-key --signature` (+ `--expect-seal`) so the CLI gate and the runtime `installPack` load gate agree. The runtime `--policy` default stays `best_effort` for backwards-compatible local dev.
  - **T6 (tests):** `core/tests/install.test.ts` exercises the fail-closed gate with REAL ed25519 sign/verify (refuses unsigned / wrong-key / drifted-seal / unsigned-seal; installs a validly signed pack + matching signed seal; verifies no sinks install on failure; absent option ⇒ unchanged). `conformance/tests/pack-trust.test.ts` + `config-seal.test.ts` add the explicit `require_signature` load-path defaults (ed25519 + rsa-pss over the fingerprint; re-extract/re-hash of the LIVE pack), each with accept + fail-closed cases.

  Invariants preserved: kernel purity/determinism/replay (verification reads injected snapshots + the live pack surface only; no IO/clock/RNG; `intentHashInput` byte-identical), the closed 6-outcome `Decision` algebra (no new outcome), fail-closed (#6), and monotonicity (§C — an unverified Pack only ADDS friction by refusing to install).

- 21a7895: feat(pack-identity-kyc,pack-deployments-approval,primitives): 103 — harden the KYC-status + suitability/Reg-BI compliance signals as on-path, escalate-only providers and PIN escalate-only precedence so a compliance signal can only ever step friction UP (§C `final = min(deterministic, risk_ceiling)`, §D inv-7). 103 CONSUMES 102's escalate-only AML UNION (FLAGGED OR `amlMatchScore >= threshold`) and does NOT re-author it; its additive scope is the suitability/Reg-BI (`aiEvalScore` regression) escalate-only signal and the KYC-status path. This is a contract-locking change (per §7: doc-reconciliation + precedence-locking only, no runtime mechanism added): NO guard logic, NO basis vocabulary, NO `intentHashInput`, and NO `@adjudicate/core` source change. The closed 6-outcome `Decision` algebra (§D #2), replay-determinism (§D #5), and §C monotonicity are all preserved and re-confirmed via `core test` + `core test:invariants` (T6).
  - **`@adjudicate/pack-deployments-approval` (`tests/gates.test.ts`) — suitability/Reg-BI escalate-only precedence over an EXECUTE allow guard (tests only, no src change):** the 101/102 tests pin the regression-score signal (`escalateRegressionScore`, ordered before all clamp/allow guards) beating a REWRITE (dirty region) and a REQUEST*CONFIRMATION (model change). 103 adds the STRICTEST precedence — escalate over a genuine EXECUTE \_allow* guard: an APPROVED production deploy that would otherwise EXECUTE via `allowApprovedProduction` ESCALATEs when `aiEvalScore` is sub-threshold, across the whole failing-eval band; a CONTROL at/above threshold confirms the guard abstains and the deterministic EXECUTE allow guard fires (proving the ESCALATE is a real threshold crossing, not an always-on side effect). The suitability signal sets a ceiling, never a floor, even against the one guard that authorizes EXECUTE.
  - **`@adjudicate/pack-identity-kyc` (`tests/kyc.test.ts`) — KYC-status escalate-only precedence + fail-closed enum + closed basis (tests only, no src change):** add a 103 anchor proving BOTH branches of 102's AML UNION beat the kernel's single EXECUTE allow guard (`executeOnHighScore`) at an EXECUTE-grade verification score (≥ 90) — the FLAGGED branch and the `amlMatchScore ≥ threshold` (CLEAR) branch — and that across the EXECUTE band a union hit never authorizes EXECUTE (friction ceiling, never a floor). Add the fail-closed enum backstop (the §3/§7 risk): an unrecognized `amlStatus` at a borderline score (no union hit, sub-EXECUTE) falls through to default REFUSE — never EXECUTE — pinning the enforced `AmlStatus = "CLEAR" | "FLAGGED"` (`types.ts:43`) as the single source of truth (an unknown value fails closed to friction). Add the T6 closed-vocabulary backstop: the AML escalate emits the existing business basis CODE `rule_violated` with `aml_screening` as a `detail.rule` STRING only — no new basis code introduced. The pre-existing 101/102 AML-union, compile-time `AmlStatus` lock, and drift-closure tests stay green; the `05-vendor-escalate-aml-flag` scenario stays green.
  - **`@adjudicate/primitives` (`tests/m2-factories.test.ts`) — reaffirm the escalate-only conjunction the 103 providers rely on (tests only, no src change):** both 103-relevant providers (deployments `escalateRegressionScore`, KYC `escalateOnSanctionsMatchScore`) ride `createEscalateGuard`. Add a 103 anchor pinning its CONJUNCTION contract — escalate iff `matches` is true AND the comparator crosses — so a matches-true-but-sub-threshold value ABSTAINS (returns `null`, letting the deterministic score path run) rather than leaking a non-null Decision, and an ABSENT extracted value abstains (precisely why the FLAGGED-only/no-score case must be a STANDALONE sibling guard). At/above threshold it emits ESCALATE to the configured route only. Complements 101's frozen escalate-only-shape block from the consumers' perspective.

  `@adjudicate/core` is UNCHANGED by 103 (the closed basis vocabularies and the constitutional invariants are confirmed via `core test` + `core test:invariants`). `@adjudicate/web` is UNCHANGED by 103 (102 owns the `intent-schemas.ts` reconciliation; the documented `amlStatus` value-set already matches the enforced enum). Rollback: revert the branch `feat/merged-103-kyc-suitability-providers` — a per-package test-only change with no data migration and no feature flag; revert is a clean `git revert`.

- 539337f: feat(core): 081 — pin per-guard CODE artifacts into the policy descriptor. Add `attachGuardCodeArtifact` / `readGuardCodeArtifact` / `GuardCodeArtifact` (a symbol-keyed slot carrying closure-captured numeric caps + predicate body) and surface a per-guard `codeDigest` (sha256-over-canonical via `@adjudicate/canonical`) on `GuardDescriptor` in `describePolicyBundle`. Additive + back-compatible: guards without an artifact carry no `codeDigest`. No new kernel dependency; the kernel decision is unchanged (purity/determinism preserved).

  feat(conformance): the ConfigSeal sealable surface now binds guard CODE, not just declared metadata. `SealableSurface` gains an order-stable `guardCodeDigests` list (new `GuardCodeDigest` type) threaded through `extractSealableSurface`; `computeConfigDigest` / `verifyConfigSeal` / `verifyConfigSealFrozen` signatures are unchanged. Closes Critique #27 / the 034→081 body-integrity dependency: editing a `createRewriteGuard` closure-captured cap (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) now drives a digest mismatch instead of verifying clean (fail-closed, §D-inv-6).

  fix(primitives): `createRewriteGuard` exposes its closure-captured cap (and clamp body) to the descriptor via `attachGuardCodeArtifact`, so a behavior-changing cap edit is no longer invisible to the seal.

  feat(red-team): add `runConfigSealCapEditRegression` (+ `CapEditRegressionResult`) — a `config_integrity` regression that asserts a tampered guard cap is DETECTED by the sealed surface digest.

  feat(cli): `pack verify --expect-seal <hex>` verifies the extended ConfigSeal surface (guard code bodies pinned), in addition to the declarative-subset fingerprint.

  chore(adapter-core, admin-sdk): doc + wire-schema updates for the extended descriptor surface (the `configSeal` loop gate now binds guard code; `GuardDescriptorSchema` tolerates the optional `codeDigest`).

- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [a9be0ad]
- Updated dependencies [e8698b1]
- Updated dependencies [6121a7a]
- Updated dependencies [c0d1b93]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [cb8d608]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
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

## 0.3.1

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 0.3.0

### Minor Changes

- ce2cdc5: feat(primitives): add `createCommandRiskGuard` + `command-classify` (classifyCommand/stripDangerousFlags) for CLI/terminal agents — REFUSE/REWRITE(flag-strip, taint preserved)/REQUEST_CONFIRMATION by command risk (ADR-123).

  feat(core): add `validation.COMMAND_BLOCKED/COMMAND_FLAG_STRIPPED/COMMAND_SANITIZED` basis codes.

- 464db38: feat(primitives): add `createDataClassificationGuard` (PII/PHI redaction & refusal). REWRITE masks matched payload fields (taint preserved); REFUSE blocks. Runtime sensitivity tier + redacted fields ride in `DecisionBasis.detail`.

  feat(core): widen `GuardDescription` with the additive `data_classification` variant; add `validation.PII_DETECTED/PII_REDACTED/PII_BLOCKED` basis codes (ADR-117).

  feat(analyze): AJD-104 also flags a `data_classification` REWRITE guard with empty `scannedFields`.

  feat(admin-sdk): add `governance.piiClassificationStats` — aggregates data-classification dispositions by (sensitivityLevel × disposition) for the console.

- 1e0058b: feat(primitives): add `createTokenBudgetGuard` — pure guard that REFUSE/DEFERs on per-session/per-tenant token budgets, reading the counter from adopter state S (ADR-120).

  feat(adapter-core): `AssistantTurn.usage` + `onTokenUsage` hook surface provider token usage per turn (the adopter folds it into state S).

  feat(anthropic,openai): map provider token usage onto `AssistantTurn.usage`.

  feat(admin-sdk): add `governance.tokenBudget` for the console Token Budget panel.

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
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

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
