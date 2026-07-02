# @adjudicate/conformance

## 7.0.0

### Patch Changes

- Updated dependencies [e650c37]
  - @adjudicate/core@1.9.0

## 6.0.0

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0

## 5.0.0

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0

## 4.0.0

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0

## 3.0.0

### Minor Changes

- 5a261ef: feat(core): 032 — authority-graph data model + store + PURE ownership resolver. Add the `AuthorityGraph` snapshot model (`principal —relationship→ resource —permits→ {actions, limits}`, index §G) co-located with the actor/envelope contracts in `envelope.ts`: new `AuthorityRelationship` (`owns`/`joint`/`advisor`/`custodian`), `AuthorityPermits`, `AuthorityEdge`, `AuthorityGraph` types. The graph is an IMMUTABLE INJECTED SNAPSHOT (index §B/§D) — it is NOT an envelope field and does NOT enter the `intentHashInput` pre-image (`intentHashInput`/`EXPECTED_ENVELOPE_KEYS` are byte-identical to their post-031 value; every existing envelope hash is unchanged). In `decision.ts` add `createAuthorityGraphStore` (a read-only, frozen-snapshot lookup with a pure `edgesFor(principal, resource)`) and the pure `resolveOwnership(store, envelope) => OwnershipFact` resolver: it binds the envelope's declared owner/resource (`resourceRefs`, 031) to the snapshot and returns a FACT (`{ principal, resource, bound, relationships, permits, edges }`) — NEVER a `Decision` (index §B), so it can never authorize EXECUTE or lower friction (index §C). `hashAuthorityGraph` content-addresses the snapshot via `@adjudicate/canonical` for replay (invariant #5). PURE & synchronous (no clock/RNG/IO, kernel-purity §D). The closed 6-outcome `Decision` algebra is UNTOUCHED — no 7th outcome, no `confidence`/`metadata` field (invariant #2). ADDITIVE: no pack policy, no authority guard (034), no AC-007 (035).

  feat(canonical): 032 — add `canonicalSnapshot` / `sha256SnapshotCanonical`, intent-revealing aliases over `canonicalJson` / `sha256Canonical` for injected-snapshot serialization (authority-graph + future aggregate/limit snapshots). They DELEGATE byte-for-byte — same NFC normalization, same `RangeError` on non-finite, same undefined-elision — so a recorded snapshot replays bit-identically (invariant #5) and never drifts from `intentHash` semantics; NO forked canonicalizer (index §B caveat). Re-exported from `@adjudicate/core` via `hash.ts`. Golden-vector tests pin authority-graph snapshot canonicalization (key-order insensitivity, edge-array order significance, NFC, fail-on-non-finite, tamper-evidence).

  feat(primitives): 032 — add `ownershipBindingPredicate`, the seam that adapts an `OwnershipFact` to the EXISTING `requireTenantBinding(isActorBoundToTenant)` predicate shape `(actor, state) => boolean` (identity on `OwnershipFact.bound`) so plan 034 can wire a constitutional authority guard onto a pack's `authGuards` WITHOUT reshaping the fact. Seam ONLY — 032 wires NO guard; PIX/access bundles still ship `authGuards:[]`. Pure; browser-safe; no authorization (a `false` lets `requireTenantBinding` REFUSE — raise friction — never EXECUTE).

  feat(conformance): 032 — extend `ConformanceOptions` with an optional `authorityGraph` snapshot so a later authority/ownership check (035 AC-007) can be fed the graph deterministically without another options change. Surface only: `DEFAULT_CHECKS` (AC-001..AC-006, AC-008) is unchanged, AC-007 stays out of scope (035), and `runConformance` does NOT throw on the option's presence/absence (a report with the snapshot supplied is identical to one without).

- 539337f: feat(core): 081 — pin per-guard CODE artifacts into the policy descriptor. Add `attachGuardCodeArtifact` / `readGuardCodeArtifact` / `GuardCodeArtifact` (a symbol-keyed slot carrying closure-captured numeric caps + predicate body) and surface a per-guard `codeDigest` (sha256-over-canonical via `@adjudicate/canonical`) on `GuardDescriptor` in `describePolicyBundle`. Additive + back-compatible: guards without an artifact carry no `codeDigest`. No new kernel dependency; the kernel decision is unchanged (purity/determinism preserved).

  feat(conformance): the ConfigSeal sealable surface now binds guard CODE, not just declared metadata. `SealableSurface` gains an order-stable `guardCodeDigests` list (new `GuardCodeDigest` type) threaded through `extractSealableSurface`; `computeConfigDigest` / `verifyConfigSeal` / `verifyConfigSealFrozen` signatures are unchanged. Closes Critique #27 / the 034→081 body-integrity dependency: editing a `createRewriteGuard` closure-captured cap (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) now drives a digest mismatch instead of verifying clean (fail-closed, §D-inv-6).

  fix(primitives): `createRewriteGuard` exposes its closure-captured cap (and clamp body) to the descriptor via `attachGuardCodeArtifact`, so a behavior-changing cap edit is no longer invisible to the seal.

  feat(red-team): add `runConfigSealCapEditRegression` (+ `CapEditRegressionResult`) — a `config_integrity` regression that asserts a tampered guard cap is DETECTED by the sealed surface digest.

  feat(cli): `pack verify --expect-seal <hex>` verifies the extended ConfigSeal surface (guard code bodies pinned), in addition to the declarative-subset fingerprint.

  chore(adapter-core, admin-sdk): doc + wire-schema updates for the extended descriptor surface (the `configSeal` loop gate now binds guard code; `GuardDescriptorSchema` tolerates the optional `codeDigest`).

- 94ddc76: feat(conformance,pack-payments-pix,pack-access-governance,pack-deployments-approval): 035 — wire the constitutional authority guard (034's `createAuthorityGuard`) into every shipping pack's `authGuards` and add the static conformance check `AC-007` (untrusted-mutating-needs-owner), closing the §D #8 violation that pack-payments-pix (`pix.charge.create`/`refund`) and pack-access-governance shipped today with `authGuards: []` (mutating UNTRUSTED-min kinds with no owner predicate). 035 is the single authoritative owner of `authGuards` wiring. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved).
  - **`@adjudicate/conformance` (`src/checks/untrusted-mutating-needs-owner.ts`, `src/checks.ts`, `src/index.ts`):** add `untrustedMutatingNeedsOwnerCheck` (`id: "AC-007"`), a STATIC/STRUCTURAL check — like AC-006 and unlike the fuzz checks it does NOT call `adjudicate()`, so it is SAMPLING-FREE and SEED-FREE. It flags a violation when a kind is MUTATING **and** `canPropose("UNTRUSTED", kind, pack.policy.taint) === true` (UNTRUSTED-min, so the taint gate does not short-circuit it) **and** `pack.policy.authGuards.length === 0` (no owner predicate). The MUTATING classifier is **DEFAULT-MUTATING, fail-closed** (resolved by human gate, `_RUN_STATE.md` 2026-06-18): a kind is mutating UNLESS the pack AFFIRMATIVELY declares it read-only via `sideEffects[kind] ∈ {"none","read"}` — an unclassified kind (or a pack with no `sideEffects` map) is assumed mutating. This deliberately avoids the vacuous reading (keying off `sideEffects ∈ {"write","destructive"}` passes on every current pack, since none declare `sideEffects`) and cannot be silenced by omission. Registered in `DEFAULT_CHECKS` (ahead of AC-008 so ids are dense) and exported from the barrel; `runConformance`/`ConformanceCheck` need no change. `run` MUST NOT throw and is deterministic. AC-007 is non-vacuous: it FAILS the pre-035 packs (`authGuards: []`) and PASSES once the guard is wired.
  - **`@adjudicate/pack-payments-pix` / `pack-access-governance` / `pack-deployments-approval` (`src/types.ts`, `src/policies.ts`/`src/index.ts`):** append the SINGLE `createAuthorityGuard` owner predicate (NOT a second `requireTenantBinding`) into each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds (`pix.charge.create`/`refund`; `access.request`/`revoke`; `deployment.approval.request`/`rollback.execute`). Kernel order `state→taint→auth→business` is preserved — the guard lives in `authGuards`, after taint (§D #3), and the TRUSTED-only kinds (`pix.charge.confirm`, `access.review.resolve`/`breakglass`, `deployment.approval.resolve`) are NOT gated (the taint gate owns them). Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `PixAuthorityContext`/`AccessAuthorityContext`/`DeploymentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). The guard reads it from `state` (the kernel never hands a guard identity). When `state.authority` is present the guard is BINDING and fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-035 standalone-demo posture the lighthouse scenarios/fixtures use (which carry no identity model), so existing pack behavior is preserved.
  - **⚠️ IDOR residual (034-F1/F2, documented).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet (`IntentActor.principal` is the provenance enum; `attest()` is a v0.2 stub), so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed), never the run-state-flagged false-sense-of-security. §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority. The guard BODY is not sealed by ConfigSeal (GROUP 08 residual), unchanged here.
  - **`@adjudicate/red-team` (`src/vectors/taint-escalation.ts`):** document that 035 wires the real packs + host seam so 034's `generateOwnershipViolationEnvelopes` IMPERSONATION case is now defended for the shipped money-moving kinds — the ownership-axis canary 084 consumes. (Tests: a state-valid forged-owner refund against the REAL pix pack with authority injected is REFUSEd at the AUTH gate, `auth:scope_insufficient`, proving the owner predicate is genuinely reached, not the taint floor.)

  Tests: AC-007 registration/id-array (`conformance/tests/conformance.test.ts`); the wired owner-predicate REFUSE path per pack (binding/IDOR-closed/fail-closed/ordering) in the pack tests; non-empty `authGuards` asserted for access-governance; the IDOR red-team vector against the real pix pack. The fail-open read-only conformance fixture now AFFIRMATIVELY declares `sideEffects: { "read.only": "read" }` (the documented AC-007 exemption). Monotonicity (§C) preserved: the check and the guard only ADD friction, never authorize EXECUTE.

### Patch Changes

- d2c3625: feat(core,conformance,adapter-core,primitives,cli): 082 — enforce the SIGNED pack at LOAD time (`installPack`). The adopter's in-process load path now REFUSES to install a Pack whose signature/trust or config seal does not verify, so a swapped/unsigned/tampered Pack cannot become the live adjudication authority (§D-1: only a verified Pack reaches the executor; §D-6: a write-path verification failure ABORTS the install; §C: failure → friction, never bypass). Fail-closed by default; behind the new `verifyOnLoad` option so an absent option is byte-identical to pre-082 (only `assertPackConformance` runs).
  - **T1 (`core/src/install.ts`):** add `VerifyOnLoadOptions` to `InstallPackOptions` and a FAIL-CLOSED provenance gate inside `installPack` that runs AFTER conformance but BEFORE any sink wiring / default install / snapshot recording, so a Pack that does not verify installs NOTHING destructive. The verifiers (`verifyPackTrust` / `verifyConfigSeal`) are INJECTED through `verifyOnLoad` — `@adjudicate/core` takes NO dependency on `@adjudicate/conformance` (which already depends on core; a `core → conformance` import would be a cycle, and the kernel dep allowlist stays clean: `@adjudicate/canonical, @noble/hashes, zod`). Defaults are STRICT at the load boundary: trust policy `require_signature` (NOT the library `best_effort`) and seal policy `require_signature` (NOT `require_digest`), so an UNSIGNED Pack (no signature / no publicKeyPem) refuses the install. A non-verifying report throws the new `PackLoadVerificationError` (axis: `trust` | `config_seal`). New exports: `VerifyOnLoadOptions`, `LoadTrustReport`, `LoadSealReport`, `PackFingerprintLike`, `PackLoadVerificationError` (all additive; recorded in the V1 freeze matrix). The pure `adjudicate()` path and `intentHashInput` are UNTOUCHED — this is impure install-shell wiring (§D).
  - **T2 (`conformance/src/index.ts`):** confirm + document that `verifyPackTrust` (`pack-trust.ts`) and `verifyConfigSeal` (`config-seal.ts`) are the single public verifiers the core load path injects; the pre-existing verifiers are unchanged.
  - **T3 (`adapter-core/src/types.ts`):** document the STRICT KNOB PAIRING on `AgentLoopOptions.configSeal` — operators must set `policy:"require_signature"` + `publicKeyPem` + `engageKillSwitchOnMismatch:true` together for fail-closed runtime posture (the same enforcement the load path runs by default). The runtime enforcement path (`loop.ts` `checkConfigSeal`) already honors this; documented, not silently relied upon (082 §7 risk: lax adapter default).
  - **T4 (`primitives/src/guards.ts`):** inline residual-blind-spot note at the `createRewriteGuard` code-artifact site — a clean seal proves SIGNATURE + sealed-surface provenance, NOT behavioral correctness of every closure (a state-derived `cap` pins the function source, not its runtime value), so load-time enforcement does not over-claim; closing the cap-pinning gap is 081's upstream scope.
  - **T5 (`cli/src/commands/pack-verify.ts`, `cli/src/bin.ts`):** align the `pack verify` command docs with the load-path posture — CI/adopters should run `--policy require_signature --public-key --signature` (+ `--expect-seal`) so the CLI gate and the runtime `installPack` load gate agree. The runtime `--policy` default stays `best_effort` for backwards-compatible local dev.
  - **T6 (tests):** `core/tests/install.test.ts` exercises the fail-closed gate with REAL ed25519 sign/verify (refuses unsigned / wrong-key / drifted-seal / unsigned-seal; installs a validly signed pack + matching signed seal; verifies no sinks install on failure; absent option ⇒ unchanged). `conformance/tests/pack-trust.test.ts` + `config-seal.test.ts` add the explicit `require_signature` load-path defaults (ed25519 + rsa-pss over the fingerprint; re-extract/re-hash of the LIVE pack), each with accept + fail-closed cases.

  Invariants preserved: kernel purity/determinism/replay (verification reads injected snapshots + the live pack surface only; no IO/clock/RNG; `intentHashInput` byte-identical), the closed 6-outcome `Decision` algebra (no new outcome), fail-closed (#6), and monotonicity (§C — an unverified Pack only ADDS friction by refusing to install).

- 5dfa0e5: feat(pack-cli-agent,pack-identity-kyc,pack-incident-response): 201 — wire the constitutional authority guard (034's `createAuthorityGuard`) into the three remaining packs that still shipped mutating UNTRUSTED-min kinds with `authGuards: []`, closing the tracked 035-F1 §D #8 gap. Purely ADDITIVE pack-policy wiring — NO kernel change. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved). The `authority` seam rides INJECTED, NON-serialized `state` (the pack rehydrators are untouched), so it never enters the audit/replay hash.
  - **`@adjudicate/pack-cli-agent` / `pack-identity-kyc` / `pack-incident-response` (`src/types.ts`, `src/policies.ts`/`src/policy.ts`, `src/index.ts`):** mirror the 035 pix template exactly. Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `CliAuthorityContext` / `KycAuthorityContext` / `IncidentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). A single `createAuthorityGuard` owner predicate is appended to each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds: cli `terminal.run`; kyc `kyc.start` / `kyc.document.upload`; incident `incident.remediation.execute` / `incident.escalate`. The system-only callback kinds (`kyc.vendor.callback`, `incident.monitor.callback`) are EXCLUDED — the taint gate owns them (the same exclusion pix applies to `pix.charge.confirm`). Kernel order `state→taint→auth→business` is preserved (the guard lives in `authGuards`, after taint, §D #3). When `state.authority` is present the guard is BINDING + fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-201 standalone-demo posture, so existing pack behavior is preserved. Each pack's `basisCodes` gains `"tenant_binding_violation"` (the guard's bare `Refusal.code`) to suppress the observe-only `basis_code_drift` telemetry on the §D #8 owner-predicate refusal.
  - **kyc is the SUBSTANTIVE close (the one genuinely-open 035-F1 hole).** Before 201 a forged/unbound/impersonated owner of `kyc.start` / `kyc.document.upload` passed the EMPTY auth slot and landed on the unconditional business DEFER guards (`requireDocumentUpload` / `waitForVerification`) ⇒ DEFER. Because the kernel evaluates state → taint → AUTH → business, wiring the auth-phase guard makes a forged owner REFUSE at the AUTH phase, short-circuiting BEFORE the business DEFER ⇒ the outcome flips **DEFER → REFUSE**. No business-guard change is needed — it is the kernel phase ordering that converts it. The load-bearing regression test (`pack-identity-kyc/tests/ownership.test.ts`) pins `forged-owner → REFUSE, NOT DEFER`.
  - **Host-injection contract (per pack, documented in `types.ts`):** `resourceRefs.resource` names — cli: the cwd / host scope the command acts in; incident: the incident id / blast-radius target (the AUTHENTICATED principal comes from `state.authority.principalOf(actor.sessionId)`, NOT `IncidentContext.operatorId`); kyc: the session's `userId`. `resourceRefs.owner` is the principal the host authority graph binds to that resource.
  - **⚠️ IDOR residual (034-F1/F2, documented, unchanged).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet, so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed). §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority.
  - **`@adjudicate/conformance` (`tests/ac007-real-packs.test.ts`, `package.json`):** add a non-vacuous AC-007 regression suite against the three real packs — each now PASSES `untrustedMutatingNeedsOwnerCheck`, plus a "if the wiring is reverted (`authGuards: []`) → AC-007 fails" backstop (the stronger backstop lesson, 014-F1). The three packs are added as devDependencies so the test can import them. No conformance runtime/API change.

  **HONEST CAVEAT (not smuggled).** The committed CI adversarial-canary gate loads packs via `loadPackFromModule`, which injects NO authority context — so the ownership probe is structurally inert at that gate for EVERY pack, including pix (whose baseline REFUSEs are state-schema refusals, not owner-predicate refusals). 201 brings these three packs to the SAME bar pix ships at: structural guard presence (AC-007) + in-package unit tests that genuinely exercise the predicate (inject `authority` + a state-valid payload so the envelope REACHES the auth phase). Re-deriving the canary baselines via the documented README workflow is a byte-identical NO-OP — kyc's baseline stays at 12 escaped/DEFER because the committed gate injects no authority and the guard is correctly inert there. Genuine gate-level non-vacuity (extending the red-team generator + canary to inject authority + state-valid payloads for ALL packs incl. pix, the AC-008 reaching-business pattern) is a broader red-team change and remains the tracked FOLLOW-UP, explicitly OUT OF SCOPE here.

- 1978f2b: feat(red-team,adapter-core,cli,ci): 084 — staged rollout (shadow → canary → auto-rollback) + a frozen adversarial-canary gate. Turns the `@adjudicate/red-team` suite (which previously ran only as part of `pnpm test`, wired to zero workflows) into an explicit DETERMINISTIC publish/rollout gate, tightens the canary-stage config-seal knobs to fail-closed, and wires the canary as an explicit CI + publish-precondition gate over the 6 shipped pack dist bundles. All orchestration lives in the impure shell (red-team / adapter / CLI / CI), never inside `adjudicate()` — the pure kernel, `intentHashInput` (invariant #4), the closed 6-outcome `Decision` algebra, and `installPack`'s load surface are all UNTOUCHED. Every added gate can only INCREASE friction (§C monotonicity); a failed canary ABORTS promotion (§D-6 fail-closed), never promotes by default.
  - **T1 (`red-team/src/runner.ts`):** add `runCanaryGate(pack, { stage, policy, ...gen })` — a frozen adversarial-canary gate that reuses `runRedTeam` + `computeRedTeamExitCode` (0 = promote / 2 = rollback) over a FROZEN scenario set (`frozenCanaryScenarios` = `generateAllVectors` PLUS the 035/T10 ownership/IDOR vector `generateOwnershipViolationEnvelopes`, which `generateAllVectors` omits — closing the ownership-axis canary gap so the gate protects §D #8). Under `policy:"strict"` (default) it PROMOTES the `taintEscalationCausality` non-vacuity warning into a HARD FAIL: a `escaped===0` taint pass where the taint gate was never exercised (`byTaintGate===0`, all defenses fired upstream) is a vacuous guarantee → rollback. The new `policy:"execute-escape"` is the §D-1 privilege-escalation gate: it rolls back ONLY on a reached clean `EXECUTE` (the executor) or an error, treating vacuity / non-EXECUTE friction (DEFER/etc.) as advisory — for a heterogeneous catalog whose adversarial scenarios are legitimately defended upstream of the taint gate. Both policies are fail-closed on the real escape and on errors; `execute-escape` only relaxes the advisory axes. Pure: no clock/RNG/IO; deterministic over `(pack, seed)`. Also adds `runBaselinedCanaryGate(pack, baseline, { seed })` + `deriveCanaryBaseline(result)` (and the `CanaryBaseline` type): the FULL STRICT canary measured against a committed baseline — the function CI/release wire (see T6). It rolls back on any new escape/error/IDOR-escape/vacuity beyond the baseline counts AND on any per-scenario §C friction regression (a recorded decision moving to a strictly less-restrictive `kind` via `restrictivenessRank`), with a reached `EXECUTE` / error unconditionally non-baselineable.
  - **T2 (`red-team/src/history.ts`):** add `runStagedCanaryRollout(pack, { store, candidate?, shadowAt, canaryAt, policy? })` — runs the SHADOW stage over the trusted baseline `pack` and the CANARY stage over the `candidate` (defaults to `pack`), persists BOTH stage reports through the existing in-memory history seam (`record(report, at)` — the same surface used for trend charting), and flips to ROLLBACK (exit 2) on any stage failure OR a shadow→canary DELTA regression (more escapes/errors, an IDOR hole newly opened, or taint coverage newly collapsed to vacuous). Friction-only: the rollout exit is never lower than the worst stage verdict. Caller-supplied timestamps (no clock).
  - **T3 (`cli/src/commands/red-team.ts`, `cli/src/bin.ts`):** extend the `red-team` subcommand with `--canary` (run the frozen gate, exit 2 = ROLLBACK / 0 = PROMOTE; ignores `--vectors`) and `--canary-policy <strict|execute-escape>`. Invocable locally and from CI/release.
  - **T4 (`adapter-core/src/types.ts`, `adapter-core/src/index.ts`):** add `canaryStageConfigSeal({ seal, publicKeyPem, onDrift? })` — builds the FAIL-CLOSED canary-stage seal posture (`policy:"require_signature"` + `engageKillSwitchOnMismatch:true` + `reverify:"every_turn"`) so a seal drift during canary LATCHES the kill switch instead of self-healing the next turn (§C/§D-7 monotonicity — the rollout may only add friction). Extract the previously-inline `configSeal` shape into the named exported `AgentConfigSealOptions` type the helper returns. Scoped to the canary stage only, leaving the documented one-release lax default intact for normal turns (082 deprecation window).
  - **T5 (`core/tests/install.test.ts`):** assert the kernel install path stays orchestration-free — `InstallPackOptions` carries NO canary/rollout/red-team key, a candidate installs byte-identically regardless of ambient canary state, and the 082 seal/trust verifiers remain caller-INJECTED (core never imports `@adjudicate/conformance`). `installPack` is UNCHANGED by this plan; the canary runs AROUND install via the red-team shell.
  - **T6 (`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/canary-baselines/*.json`):** wire the adversarial canary as an explicit gate alongside the ADR-140 composition gate and as a PUBLISH PRECONDITION (before the SIGNER/publish step). The wired gate runs the FULL STRICT canary (`red-team --baseline <committed-baseline> --seed 1`, via the new `runBaselinedCanaryGate`) over each shipped pack dist bundle, measured against a COMMITTED, version-controlled baseline (`.github/canary-baselines/<packId>.json` produced by `deriveCanaryBaseline` from a strict run). The gate PROMOTES iff the run is no-worse-than-baseline and ROLLS BACK (exit 2) on ANY new escape/error/IDOR-escape/vacuity beyond the baseline OR any §C friction REGRESSION on a baselined scenario (a recorded decision weakening to a strictly less-restrictive kind, e.g. a money-mover's IDOR `REFUSE → DEFER`). The committed baseline FREEZES the documented pre-existing 035-F1 #8 gaps (pack-identity-kyc's forged-owner DEFER cases; cli/pix/deploy's taint defended-upstream/vacuous cases) so CI/publish does not go permanently red on KNOWN holes, while gating REGRESSIONS — the property the weaker `execute-escape` policy could not deliver (it only catches a reached `EXECUTE`, so it promoted kyc's 12 open non-EXECUTE IDOR DEFERs and any non-EXECUTE friction-lowering). A change to a pack's defended posture therefore requires a REVIEWED baseline update in the same PR. `--canary-policy execute-escape` remains available on the CLI for ad-hoc local inspection but is NOT the CI/publish gate.
  - **Tests:** `red-team` adds a canary-gate suite (frozen-set ownership coverage, vacuous-taint HARD FAIL, EXECUTE-escape rollback, determinism, the strict-vs-execute-escape contrast, never-promote-fail-open), a baseline-gate suite (PROMOTE on a matching baseline, DOCUMENT a pre-existing 035-F1 DEFER gap without reddening, ROLLBACK a NEW non-EXECUTE IDOR escape beyond baseline [finding 1], ROLLBACK a §C `REFUSE → DEFER` friction regression with NO EXECUTE reached [finding 2], a reached EXECUTE can never be baselined away, `deriveCanaryBaseline` round-trip), and a staged-rollout suite (clean PROMOTE + idempotent persistence, stage-failure rollback, shadow→canary delta-regression rollback). `adapter-core` adds the canary-stage seal suite (strict knobs forced, valid seal proceeds, drift LATCHES + does NOT self-heal, contrasted against the lax default that self-heals). `conformance` extends `config-seal.test.ts` (frozen-cadence `verifyConfigSealFrozen` under require_signature gates a clean digest + is fail-closed on unsigned/drift) and `pack-trust.test.ts` (`verifyPackTrust` under require_signature as the canary-stage trust precondition).

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

## 2.0.0

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 1.1.0

### Minor Changes

- 60daeef: feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

  feat(cli): add `adjudicate pack bom <path>`.

  feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.

- 7545b17: feat(conformance): add Configuration Integrity Seal — sealPackConfig / verifyConfigSeal pin the introspectable config surface (declarative + guard metadata + probed taint minimums + basis codes) under a signature (ADR-121). Factored shared canonicalJson into its own module.

  feat(adapter-core): config-seal loop gate — verifies once per agent instance before the first adjudication; on mismatch refuses the turn (new `refused` AgentOutcome + `config_seal_violation` trace) and can engage the kill switch.

  feat(core): add `kill.SEAL_MISMATCH` basis code.

  feat(admin-sdk): add `governance.configSealStatus` for the console seal panel.

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

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

## 1.0.0

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

- 36e7e76: # v0.6 — adapter-core extraction + OpenAI + Tier 2 analyzer

  Second-phase architectural advancement pass. The kernel API stays frozen; the provider integration surface, the analyzer, and the Pack ecosystem primitives all gained substance.

  ## `@adjudicate/adapter-core` (new) — ADR-113

  Extracted the provider-neutral orchestration into its own package. Contains the tool-use loop, the bridge (`classifyIncomingToolUse` + `buildEnvelopeFromToolUse`), the Decision translator, persistence shims (`createInMemoryDeferStore`, `createInMemoryConfirmationStore`), and the error taxonomy (`AdapterError`, `AdapterErrorCode`).

  Provider adapters now implement a `ProviderBridge<H>` against their SDK and re-export `createAdjudicatedAgent` from adapter-core. Adding a third provider is a < 200-line PR.

  History `H` is opaque to the loop — the bridge is the only thing in the codebase that knows the SDK-specific conversation-history shape. Every invariant the v0.5 loop preserved (replay determinism, fail-closed semantics, REWRITE executes the rewritten envelope, DEFER hash-verification, REQUEST_CONFIRMATION blob tamper detection) flows through unchanged.

  ## `@adjudicate/openai` (new)

  Reference OpenAI Chat Completions integration. Thin SDK shim over adapter-core. Accepts any object satisfying `OpenAIChatLikeClient` — the official `openai` SDK satisfies it structurally, mocks satisfy it, Azure OpenAI wrappers satisfy it. No hard `openai` dependency.

  Cross-provider parity verified by `tests/integration-pix.test.ts` — the same canned PIX-Pack conversation reaches the same six Decision kinds with the same audit-record counts and no `withBasisAudit` drift events.

  ## `@adjudicate/anthropic` — breaking surface change
  - The package is now a thin shim over adapter-core. The public API (`createAdjudicatedAgent`, `createAnthropicPromptRenderer`, persistence shims, error taxonomy) is preserved by re-exports from adapter-core.
  - `AgentEvent.tool_result.payload` is now the provider-neutral `ToolResultBlock` shape (`{ toolUseId, content, isError? }`) instead of the Anthropic-specific `ToolResultBlockParam` (`{ type: "tool_result", tool_use_id, content, is_error? }`). The loop maps to the SDK shape only at the bridge boundary.
  - `AnthropicAdapterError` / `AnthropicAdapterErrorCode` are kept as deprecated aliases for `AdapterError` / `AdapterErrorCode`; both will be removed in v2.0.

  ## `@adjudicate/analyze` — Tier 2 AST analyzer

  New `AJD-201 RewriteScopeAstAnalyzer` walks the actual source AST to verify a REWRITE guard's declared `mutatesPayloadFields` matches what the rewritten envelope's payload literal touches. Catches:
  - **Undeclared mutations** (error): a field is assigned in the rewrite but not declared.
  - **Stale declarations** (warning): a declared field is never touched by any rewrite.
  - **Unsafe spreads** (note): `{ ...payload }` without explicit overrides — static scope analysis cannot reason; surface to the operator.

  Diagnostics carry `sourceLocation: { file, line, column }` so editors and GitHub Code Scanning can deep-link. Opt-in via `analyzePolicy({ sourceFiles })`.

  ## `@adjudicate/conformance` — `validatePackManifest` primitive

  Standalone validator for the `package.json` `adjudicate` field per `docs/pack-ecosystem/registry-foundations.md`. Returns either `{ ok: true, manifest }` with a typed view, or `{ ok: false, errors }` with operator-readable violations. Consumed by the CLI, the future registry indexer, and adopter install hooks.

  `crossCheckPackVsManifest` cross-checks the live Pack against its declared manifest — catches drift between what the manifest claims (`intents`, `signals`) and what the Pack actually declares.

  ## `@adjudicate/core`
  - `KERNEL_REFUSAL_CODES` now includes `guard_panic`. The conformance harness's `KERNEL_INTERNAL_REFUSAL_CODES` overlay is removed; one less place for refusal-code drift to hide.
  - `assertPackConformance` vs `runConformance` split documented prominently in the module header — the boot-time / runtime / CI split is no longer ill-documented.
  - `explainRecord` gained `mergeExplanationRegistries(...)` for Pack-authors composing locale registries.
  - `DecisionExplanation` gained `supersession` field — when an AuditRecord v3+ carries `supersedes`, the explanation renders it as a single-sentence narration. Default templates cover `confirmation_resolved`, `defer_resumed`, `rewrite_executed`, `replay`.

  ## Numbers
  - 928 tests passing (up from 876), 1 skipped, 0 failing.
  - 52 net new tests: 24 adapter-core, 12 openai, 10 analyze (Tier 2), 10 core (explain extensions), 20 conformance (manifest), minus 24 anthropic tests that moved into adapter-core.
  - 1 new ADR (ADR-113).
  - 1 new package (`@adjudicate/adapter-core`).
  - 1 new provider adapter (`@adjudicate/openai`).

- 36e7e76: v0.7 — operational hardening + ecosystem trust. All additive; no kernel breaking changes.

  **Distributed kill switch v2.** `startDistributedKillSwitchPubSub` in `@adjudicate/audit` adds Redis pub/sub propagation on top of the existing polling helper. Sub-100 ms transitions when the subscriber is connected; polling retained as fallback for disconnects, restarts, and broker outages. See ADR-114.

  **Real-time audit event substrate.** `createInMemoryAuditEventBus`, `createRedisAuditEventBus`, and `bridgeAuditSinkToBus` in `@adjudicate/audit`. Operator consoles and live-tail views fan out without touching the durable sink contract.

  **Restart-durable confirmations.** `createRedisConfirmationStore` in `@adjudicate/adapter-core/persistence-redis`. REQUEST_CONFIRMATION tokens survive process restarts and rolling deploys.

  **Pack trust primitives.** `computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`, `verifyPackTrust` in `@adjudicate/conformance`. Pure functions, ed25519 + RSA-PSS, no hosted dependencies. See ADR-115.

  **`adjudicate pack verify` CLI.** Install-time + CI-gate wrapper around `verifyPackTrust`. Modes: `none | best_effort | require_fingerprint | require_signature`.

  **`replayWithIntegrity` + `explainReplayReport`.** `@adjudicate/audit` gains a verifier that runs decision-axis check AND envelope `intentHash` + AuditRecord `auditHash` tamper detection in one pass. `explainReplayReport` produces operator-readable narration in three formats (`ci-line | summary | operator`).

  **Cross-runtime golden vectors.** `docs/specs/canonical-hash-vectors.json` is the language-neutral consumer of the canonical-JSON SHA-256 spec. `packages/core/tests/cross-runtime-hash-vectors.test.ts` reads it and asserts the Node implementation matches; non-Node runtimes can do the same.

  **Adapter loop `TraceSink`.** `@adjudicate/adapter-core` exposes a low-cardinality lifecycle hook (`iteration_start | decision_emitted | paused | completed | max_iterations_exceeded`). Defaults to no-op; opt in via `traceSink:` on `createAdjudicatedAgent`.

  **Extended SEMCONV.** Eight new low-cardinality `adjudicate.*` attributes in `@adjudicate/observability` for adapter / provider / pause / kill-switch lifecycle. All additive; no renames.

  **Chaos test suites.** `packages/audit/tests/chaos-kill-switch.test.ts` and `chaos-replay.test.ts` exercise burst-of-malformed messages, disconnect/reconnect recovery, trip/clear storm convergence, multi-replica race (no split-brain), subscribe leak detection, and 100+ corrupted replay envelopes.

  **Test totals.** 1022 passing (was 924), 1 skipped (audit-postgres needs a live DB), 0 failing.

  See `docs/architecture/V0.7-AUDIT-REPORT.md` for the full v1.0 readiness review.

### Patch Changes

- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/core@1.2.0
