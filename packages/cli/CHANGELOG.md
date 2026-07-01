# @adjudicate/cli

## 0.4.4

### Patch Changes

- 641dd78: CLI derives its `--version` output from `package.json` at runtime instead of a hardcoded string, so the advertised version can never drift from the published package version.

  Previously `bin.ts` hardcoded `.version("x.y.z")`. The changesets release flow bumps `package.json` but never touches source, so every CLI version bump left the literal stale and failed the release PR's version-consistency gate (both the `Version consistency` job and the `rc:check` chain). `bin.ts` now reads the version via `readFileSync(new URL("../package.json", import.meta.url))` (resolves identically from `dist/bin.js` and `src/bin.ts`), and `scripts/check-versions.ts` now forbids re-introducing a hardcoded `.version("…")` literal.

## 0.4.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0
  - @adjudicate/analyze@0.4.5
  - @adjudicate/conformance@6.0.0
  - @adjudicate/red-team@0.3.3

## 0.4.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/analyze@0.4.4
  - @adjudicate/conformance@5.0.0
  - @adjudicate/red-team@0.3.2

## 0.4.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/analyze@0.4.3
  - @adjudicate/conformance@4.0.0
  - @adjudicate/red-team@0.3.1

## 0.4.0

### Minor Changes

- 539337f: feat(core): 081 — pin per-guard CODE artifacts into the policy descriptor. Add `attachGuardCodeArtifact` / `readGuardCodeArtifact` / `GuardCodeArtifact` (a symbol-keyed slot carrying closure-captured numeric caps + predicate body) and surface a per-guard `codeDigest` (sha256-over-canonical via `@adjudicate/canonical`) on `GuardDescriptor` in `describePolicyBundle`. Additive + back-compatible: guards without an artifact carry no `codeDigest`. No new kernel dependency; the kernel decision is unchanged (purity/determinism preserved).

  feat(conformance): the ConfigSeal sealable surface now binds guard CODE, not just declared metadata. `SealableSurface` gains an order-stable `guardCodeDigests` list (new `GuardCodeDigest` type) threaded through `extractSealableSurface`; `computeConfigDigest` / `verifyConfigSeal` / `verifyConfigSealFrozen` signatures are unchanged. Closes Critique #27 / the 034→081 body-integrity dependency: editing a `createRewriteGuard` closure-captured cap (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) now drives a digest mismatch instead of verifying clean (fail-closed, §D-inv-6).

  fix(primitives): `createRewriteGuard` exposes its closure-captured cap (and clamp body) to the descriptor via `attachGuardCodeArtifact`, so a behavior-changing cap edit is no longer invisible to the seal.

  feat(red-team): add `runConfigSealCapEditRegression` (+ `CapEditRegressionResult`) — a `config_integrity` regression that asserts a tampered guard cap is DETECTED by the sealed surface digest.

  feat(cli): `pack verify --expect-seal <hex>` verifies the extended ConfigSeal surface (guard code bodies pinned), in addition to the declarative-subset fingerprint.

  chore(adapter-core, admin-sdk): doc + wire-schema updates for the extended descriptor surface (the `configSeal` loop gate now binds guard code; `GuardDescriptorSchema` tolerates the optional `codeDigest`).

- 1978f2b: feat(red-team,adapter-core,cli,ci): 084 — staged rollout (shadow → canary → auto-rollback) + a frozen adversarial-canary gate. Turns the `@adjudicate/red-team` suite (which previously ran only as part of `pnpm test`, wired to zero workflows) into an explicit DETERMINISTIC publish/rollout gate, tightens the canary-stage config-seal knobs to fail-closed, and wires the canary as an explicit CI + publish-precondition gate over the 6 shipped pack dist bundles. All orchestration lives in the impure shell (red-team / adapter / CLI / CI), never inside `adjudicate()` — the pure kernel, `intentHashInput` (invariant #4), the closed 6-outcome `Decision` algebra, and `installPack`'s load surface are all UNTOUCHED. Every added gate can only INCREASE friction (§C monotonicity); a failed canary ABORTS promotion (§D-6 fail-closed), never promotes by default.
  - **T1 (`red-team/src/runner.ts`):** add `runCanaryGate(pack, { stage, policy, ...gen })` — a frozen adversarial-canary gate that reuses `runRedTeam` + `computeRedTeamExitCode` (0 = promote / 2 = rollback) over a FROZEN scenario set (`frozenCanaryScenarios` = `generateAllVectors` PLUS the 035/T10 ownership/IDOR vector `generateOwnershipViolationEnvelopes`, which `generateAllVectors` omits — closing the ownership-axis canary gap so the gate protects §D #8). Under `policy:"strict"` (default) it PROMOTES the `taintEscalationCausality` non-vacuity warning into a HARD FAIL: a `escaped===0` taint pass where the taint gate was never exercised (`byTaintGate===0`, all defenses fired upstream) is a vacuous guarantee → rollback. The new `policy:"execute-escape"` is the §D-1 privilege-escalation gate: it rolls back ONLY on a reached clean `EXECUTE` (the executor) or an error, treating vacuity / non-EXECUTE friction (DEFER/etc.) as advisory — for a heterogeneous catalog whose adversarial scenarios are legitimately defended upstream of the taint gate. Both policies are fail-closed on the real escape and on errors; `execute-escape` only relaxes the advisory axes. Pure: no clock/RNG/IO; deterministic over `(pack, seed)`. Also adds `runBaselinedCanaryGate(pack, baseline, { seed })` + `deriveCanaryBaseline(result)` (and the `CanaryBaseline` type): the FULL STRICT canary measured against a committed baseline — the function CI/release wire (see T6). It rolls back on any new escape/error/IDOR-escape/vacuity beyond the baseline counts AND on any per-scenario §C friction regression (a recorded decision moving to a strictly less-restrictive `kind` via `restrictivenessRank`), with a reached `EXECUTE` / error unconditionally non-baselineable.
  - **T2 (`red-team/src/history.ts`):** add `runStagedCanaryRollout(pack, { store, candidate?, shadowAt, canaryAt, policy? })` — runs the SHADOW stage over the trusted baseline `pack` and the CANARY stage over the `candidate` (defaults to `pack`), persists BOTH stage reports through the existing in-memory history seam (`record(report, at)` — the same surface used for trend charting), and flips to ROLLBACK (exit 2) on any stage failure OR a shadow→canary DELTA regression (more escapes/errors, an IDOR hole newly opened, or taint coverage newly collapsed to vacuous). Friction-only: the rollout exit is never lower than the worst stage verdict. Caller-supplied timestamps (no clock).
  - **T3 (`cli/src/commands/red-team.ts`, `cli/src/bin.ts`):** extend the `red-team` subcommand with `--canary` (run the frozen gate, exit 2 = ROLLBACK / 0 = PROMOTE; ignores `--vectors`) and `--canary-policy <strict|execute-escape>`. Invocable locally and from CI/release.
  - **T4 (`adapter-core/src/types.ts`, `adapter-core/src/index.ts`):** add `canaryStageConfigSeal({ seal, publicKeyPem, onDrift? })` — builds the FAIL-CLOSED canary-stage seal posture (`policy:"require_signature"` + `engageKillSwitchOnMismatch:true` + `reverify:"every_turn"`) so a seal drift during canary LATCHES the kill switch instead of self-healing the next turn (§C/§D-7 monotonicity — the rollout may only add friction). Extract the previously-inline `configSeal` shape into the named exported `AgentConfigSealOptions` type the helper returns. Scoped to the canary stage only, leaving the documented one-release lax default intact for normal turns (082 deprecation window).
  - **T5 (`core/tests/install.test.ts`):** assert the kernel install path stays orchestration-free — `InstallPackOptions` carries NO canary/rollout/red-team key, a candidate installs byte-identically regardless of ambient canary state, and the 082 seal/trust verifiers remain caller-INJECTED (core never imports `@adjudicate/conformance`). `installPack` is UNCHANGED by this plan; the canary runs AROUND install via the red-team shell.
  - **T6 (`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/canary-baselines/*.json`):** wire the adversarial canary as an explicit gate alongside the ADR-140 composition gate and as a PUBLISH PRECONDITION (before the SIGNER/publish step). The wired gate runs the FULL STRICT canary (`red-team --baseline <committed-baseline> --seed 1`, via the new `runBaselinedCanaryGate`) over each shipped pack dist bundle, measured against a COMMITTED, version-controlled baseline (`.github/canary-baselines/<packId>.json` produced by `deriveCanaryBaseline` from a strict run). The gate PROMOTES iff the run is no-worse-than-baseline and ROLLS BACK (exit 2) on ANY new escape/error/IDOR-escape/vacuity beyond the baseline OR any §C friction REGRESSION on a baselined scenario (a recorded decision weakening to a strictly less-restrictive kind, e.g. a money-mover's IDOR `REFUSE → DEFER`). The committed baseline FREEZES the documented pre-existing 035-F1 #8 gaps (pack-identity-kyc's forged-owner DEFER cases; cli/pix/deploy's taint defended-upstream/vacuous cases) so CI/publish does not go permanently red on KNOWN holes, while gating REGRESSIONS — the property the weaker `execute-escape` policy could not deliver (it only catches a reached `EXECUTE`, so it promoted kyc's 12 open non-EXECUTE IDOR DEFERs and any non-EXECUTE friction-lowering). A change to a pack's defended posture therefore requires a REVIEWED baseline update in the same PR. `--canary-policy execute-escape` remains available on the CLI for ad-hoc local inspection but is NOT the CI/publish gate.
  - **Tests:** `red-team` adds a canary-gate suite (frozen-set ownership coverage, vacuous-taint HARD FAIL, EXECUTE-escape rollback, determinism, the strict-vs-execute-escape contrast, never-promote-fail-open), a baseline-gate suite (PROMOTE on a matching baseline, DOCUMENT a pre-existing 035-F1 DEFER gap without reddening, ROLLBACK a NEW non-EXECUTE IDOR escape beyond baseline [finding 1], ROLLBACK a §C `REFUSE → DEFER` friction regression with NO EXECUTE reached [finding 2], a reached EXECUTE can never be baselined away, `deriveCanaryBaseline` round-trip), and a staged-rollout suite (clean PROMOTE + idempotent persistence, stage-failure rollback, shadow→canary delta-regression rollback). `adapter-core` adds the canary-stage seal suite (strict knobs forced, valid seal proceeds, drift LATCHES + does NOT self-heal, contrasted against the lax default that self-heals). `conformance` extends `config-seal.test.ts` (frozen-cadence `verifyConfigSealFrozen` under require_signature gates a clean digest + is fail-closed on unsigned/drift) and `pack-trust.test.ts` (`verifyPackTrust` under require_signature as the canary-stage trust precondition).

### Patch Changes

- 0bcb5ac: feat(red-team,cli): 202 — DE-VACUUM the red-team ownership canary so it GENUINELY exercises every pack's owner predicate (the convergence point for the #8 story). 201 wired the owner predicates into cli/kyc/incident (pix already wired); the committed CI ownership canary, however, was VACUOUS for EVERY pack INCLUDING pix: `generateOwnershipViolationEnvelopes` emitted forged-owner/impersonation envelopes against `state = emptyStateFor(pack)` (NO injected `authority`) paired with a synthetic `{forged,note,seq}` payload, so the probe was refused UPSTREAM of the auth phase (a state-schema guard for cli/incident/pix; a business DEFER for kyc) and NEVER reached the owner predicate. The baseline's ownership REFUSEs/DEFERs were therefore NOT owner-predicate outcomes — the cross-pack signal was noise (kyc recorded 12 DEFER "escapes"; cli/pix carried `taintVacuous`). Per the 084 non-vacuity doctrine a vacuous security gate manufactures false confidence — worse than none. 202 fixes the HARNESS only (red-team + baselines); NO pack-policy, NO kernel, NO primitives change.
  - **`@adjudicate/red-team` (`src/vectors/ownership-fixtures.ts` — NEW):** add `OwnershipFixture` + the `OWNERSHIP_FIXTURES` registry keyed by `pack.id` then by authority-gated kind, with honest authority builders. A fixture supplies the three things a probe needs to reach the auth phase: a `stateValidPayload` that passes the pack's state guards (cli `{command:"ls"}`; kyc `{sessionId,userId}`; incident `{incidentId,blastRadius}` against a seeded live incident; pix.charge.refund `{chargeId}` against a seeded confirmed charge); a `baseState` (the raw shape the pack's `rehydrateState` consumes); and a `buildAuthority()` that returns an HONEST `AuthorityGraphStore` binding the REAL victim → resource (so the impersonation case's forged owner genuinely OWNS the resource, `fact.bound===true`) PLUS a `principalOf` mapping the attacker's `actor.sessionId` to a DIFFERENT principal (so impersonation is a genuine mismatch the `authenticatedPrincipal` seam REFUSEs at auth — `auth:scope_insufficient`, never a state code). The four shipped packs are ALL covered (cli `terminal.run`; kyc `kyc.start`,`kyc.document.upload`; incident `incident.remediation.execute`,`incident.escalate`; pix `pix.charge.create`,`pix.charge.refund`). Fixtures live in red-team (compiled into dist, keyed by `pack.id`) — NOT in the packs, NOT injected by the pack loader — so the CLI gate uses them with NO pack-loader change. The fixtures reference only the packs' KIND STRINGS + plain-object payload/state and build authority via `@adjudicate/core`, so red-team's RUNTIME deps stay `core` + `canonical` (the 4 packs are TEST-only devDeps). Pure: `buildAuthority` is a deterministic constructor (no clock/RNG/IO).
  - **`@adjudicate/red-team` (`src/vectors/taint-escalation.ts`):** `generateOwnershipViolationEnvelopes` now branches on a fixture: when `ownershipFixtureFor(pack.id, kind)` exists it emits the forged_unbound + impersonation envelopes with the fixture's `stateValidPayload` AND a `prebuiltState = { ...rehydrate(baseState), authority: buildAuthority() }` so the envelope passes state + taint and REACHES auth (marked `fixtureBacked`). The legacy synthetic-payload + empty-state path is preserved verbatim for un-fixtured packs (the stub packs the 034/035 tests inject authority through, and any future pack not yet covered — documented not-yet-covered, §7 risk 4).
  - **`@adjudicate/red-team` (`src/scenario.ts`, `src/runner.ts`):** add an optional `prebuiltState` to `RedTeamScenario` that the runner uses VERBATIM (bypassing `pack.rehydrateState`, which strips host `authority` by design); add `reachedAuth`/`fixtureBacked` to `RedTeamResult` (the runner reads `adjudicateWithTrace`'s trace — `reachedAuth = trace.some(e=>e.phase==="auth")`). Add the `reachedAuth` NON-VACUITY gate to `runCanaryGate` (`ownershipNonVacuity`): a fixture-backed ownership probe that does NOT reach auth (a broken/vacuous fixture) is reported NOT-EXERCISED and is a HARD FAIL (exit 2) under BOTH policies — mirroring `no-payload-self-confirmation.ts`'s `reachedBusiness` gate. `runBaselinedCanaryGate` rolls back on any NOT-EXERCISED probe AND on a baseline that recorded a genuinely-exercised owner predicate regressing to vacuous; `deriveCanaryBaseline`/`CanaryBaseline` carry `ownershipExercised` (a pre-202 baseline absent the field is treated as not-yet-asserted, never falsely reddening). Export `OWNERSHIP_FIXTURES`/`ownershipFixtureFor`/`OWNERSHIP_ATTACKER_*` + the new types.
  - **`@adjudicate/cli` (`src/commands/red-team.ts`):** surface `ownershipNonVacuity` in the canary + baselined gate output (text: `owner-predicate exercised N/M`; JSON: the full verdict) so operators see whether the owner predicate genuinely ran and a VACUOUS fixture is loudly flagged. No loader / kernel-call change.
  - **`.github/canary-baselines/*.json`:** re-derived ALL baselines via the README workflow (`runCanaryGate(pack,{policy:"strict",seed:1})` → `deriveCanaryBaseline`, committed verbatim — NOT hand-edited). Now that the predicate is exercised: kyc `ownershipEscaped 12 → 0` GENUINELY (forged/impersonated owners REFUSE at auth, no longer DEFER at business); cli/incident/pix ownership entries are genuine auth-phase REFUSEs; every baseline records `ownershipExercised: true` for the four wired packs. access-governance / deployments-approval have no 202 fixtures (legacy path) and stay `ownershipExercised: false` with 0 ownership escapes (documented).

  The pure `adjudicate()` decision path, the closed 6-outcome `Decision` algebra, the guard order, and `intentHashInput` are UNCHANGED — the change is entirely in the red-team SHELL + committed baselines (no `packages/*/src/**` policy file, no `packages/core/src/**`, no `packages/primitives/src/**`).

- c0b1b44: feat(core): 042 — contaminating session-flag model on the origin axis (consumes 041). Make untrusted ORIGIN contaminating at the session level so an LLM-proposed intent that follows retrieved/external content in context no longer re-enters the loop byte-identical to a user-induced proposal. Adds to `taint.ts`: `isContaminatingOrigin(origin)` (the pure predicate over the closed `Origin` union — `Retrieved`/`ExternalAPI` are contaminating; `Human`/`System`/`LLM` are not), the `SessionContamination` flag type (`{ taint; origin }`), `applySessionContamination(declaredTaint, flag)` (the monotonic lattice-meet fold — minted taint = `mergeTaint(declared, contamination.taint)`, never raises trust), and `contaminateSession(prior, datum)` (monotonic accumulation that only ever tightens; preserves the FIRST contaminating origin as the audit anchor). The pure kernel taint gate (`kernel/adjudicate.ts`) now reads `envelope.origin` READ-ONLY (already in the intentHash pre-image from 041) to ATTRIBUTE a sub-minimum `canPropose` refusal: a contaminating origin populates the previously-UNUSED `taint:propagation_violation` basis (instead of the bare `taint:level_insufficient`) so audit can distinguish a contamination-lowered refusal from a declared-untrusted one. This is NOT a 7th outcome (still REFUSE), NOT a new guard phase, NOT a friction change, and adds NO IO — kernel purity (§D), guard order #3 (taint short-circuits before auth), the closed 6-outcome algebra #2, the intentHash recipe #4, and monotonicity #7 are all preserved. The pre-existing 041 invariant `origin-not-gated.property.test.ts` is EVOLVED in lock-step (origin still never changes the Decision KIND; `propagation_violation` now appears ONLY on a taint REFUSE AND ONLY for a contaminating origin).

  feat(primitives): 042 — adopter-facing `createSessionContaminationPolicy({ enabled })` factory (DEFAULT OFF) + `SessionContaminationPolicy`/`SessionContaminationPolicyOptions` types, mirroring `createSystemTaintPolicy` so "is contamination enabled for this Pack?" is a one-line single-sourced audit. Default OFF keeps existing deployments byte-identical to pre-042.

  feat(adapter-core): 042 — fold the per-session contamination flag into the minted taint at the SINGLE envelope-minting seam (`loop.ts`), replacing the former unconditional `taint:"UNTRUSTED"` literal with the lattice meet of the declared taint and the session contamination taint, applied BEFORE `buildEnvelopeFromToolUse` hashes (so the contaminated taint/origin are inside the intentHash pre-image #4 — an LLM cannot post-hoc flip them). An authorized READ that SERVES a datum (the laundering leg) contaminates the session (treated as `Retrieved`); the next minted LLM intent then inherits the lowered taint and the contaminating origin stamp. `buildEnvelopeFromToolUse` (`bridge.ts`) threads an optional `contamination` arg via `applySessionContamination` (monotonic; idempotent under the loop's pre-meet); `routeReadThroughKernel` (`decisions.ts`) returns a `served` flag; `AdjudicatedAgentOptions.contamination` (`types.ts`) is the adopter opt-in (DEFAULT OFF — option omitted is byte-identical to pre-042). Clearing is structural: a fresh `runLoop` (including the authenticated `resume()` path) starts uncontaminated — never an LLM-controlled action.

  feat(red-team): 042 — land the `provenance_injection` (contamination / data-provenance) vector that 041 only opened the union seam for. New `vectors/provenance-injection.ts` generator: for each system-only intent kind, an UNTRUSTED envelope stamped with a CONTAMINATING origin (`Retrieved`/`ExternalAPI`), sourced from `planner.visibleReadTools` (the 041 declared-but-unconsumed seam — the READ→inject→intent path), expecting REFUSE. `ScenarioIntent` gains an optional, canonical-drop-safe `origin` (the runner threads it only when present, so existing vectors hash and decide byte-identically). Wired into `generateAllVectors`. Non-vacuity: against a pack whose state guards do not pre-empt the taint gate the kernel REFUSEs every contaminated proposal with `taint:propagation_violation`.

  feat(cli): 042 — wire `generateProvenanceInjectionEnvelopes` into the `adjudicate red-team` command's per-vector dispatch (the `provenance_injection` key already in `ALL_VECTORS` now produces real scenarios instead of zero).

- d2c3625: feat(core,conformance,adapter-core,primitives,cli): 082 — enforce the SIGNED pack at LOAD time (`installPack`). The adopter's in-process load path now REFUSES to install a Pack whose signature/trust or config seal does not verify, so a swapped/unsigned/tampered Pack cannot become the live adjudication authority (§D-1: only a verified Pack reaches the executor; §D-6: a write-path verification failure ABORTS the install; §C: failure → friction, never bypass). Fail-closed by default; behind the new `verifyOnLoad` option so an absent option is byte-identical to pre-082 (only `assertPackConformance` runs).
  - **T1 (`core/src/install.ts`):** add `VerifyOnLoadOptions` to `InstallPackOptions` and a FAIL-CLOSED provenance gate inside `installPack` that runs AFTER conformance but BEFORE any sink wiring / default install / snapshot recording, so a Pack that does not verify installs NOTHING destructive. The verifiers (`verifyPackTrust` / `verifyConfigSeal`) are INJECTED through `verifyOnLoad` — `@adjudicate/core` takes NO dependency on `@adjudicate/conformance` (which already depends on core; a `core → conformance` import would be a cycle, and the kernel dep allowlist stays clean: `@adjudicate/canonical, @noble/hashes, zod`). Defaults are STRICT at the load boundary: trust policy `require_signature` (NOT the library `best_effort`) and seal policy `require_signature` (NOT `require_digest`), so an UNSIGNED Pack (no signature / no publicKeyPem) refuses the install. A non-verifying report throws the new `PackLoadVerificationError` (axis: `trust` | `config_seal`). New exports: `VerifyOnLoadOptions`, `LoadTrustReport`, `LoadSealReport`, `PackFingerprintLike`, `PackLoadVerificationError` (all additive; recorded in the V1 freeze matrix). The pure `adjudicate()` path and `intentHashInput` are UNTOUCHED — this is impure install-shell wiring (§D).
  - **T2 (`conformance/src/index.ts`):** confirm + document that `verifyPackTrust` (`pack-trust.ts`) and `verifyConfigSeal` (`config-seal.ts`) are the single public verifiers the core load path injects; the pre-existing verifiers are unchanged.
  - **T3 (`adapter-core/src/types.ts`):** document the STRICT KNOB PAIRING on `AgentLoopOptions.configSeal` — operators must set `policy:"require_signature"` + `publicKeyPem` + `engageKillSwitchOnMismatch:true` together for fail-closed runtime posture (the same enforcement the load path runs by default). The runtime enforcement path (`loop.ts` `checkConfigSeal`) already honors this; documented, not silently relied upon (082 §7 risk: lax adapter default).
  - **T4 (`primitives/src/guards.ts`):** inline residual-blind-spot note at the `createRewriteGuard` code-artifact site — a clean seal proves SIGNATURE + sealed-surface provenance, NOT behavioral correctness of every closure (a state-derived `cap` pins the function source, not its runtime value), so load-time enforcement does not over-claim; closing the cap-pinning gap is 081's upstream scope.
  - **T5 (`cli/src/commands/pack-verify.ts`, `cli/src/bin.ts`):** align the `pack verify` command docs with the load-path posture — CI/adopters should run `--policy require_signature --public-key --signature` (+ `--expect-seal`) so the CLI gate and the runtime `installPack` load gate agree. The runtime `--policy` default stays `best_effort` for backwards-compatible local dev.
  - **T6 (tests):** `core/tests/install.test.ts` exercises the fail-closed gate with REAL ed25519 sign/verify (refuses unsigned / wrong-key / drifted-seal / unsigned-seal; installs a validly signed pack + matching signed seal; verifies no sinks install on failure; absent option ⇒ unchanged). `conformance/tests/pack-trust.test.ts` + `config-seal.test.ts` add the explicit `require_signature` load-path defaults (ed25519 + rsa-pss over the fingerprint; re-extract/re-hash of the LIVE pack), each with accept + fail-closed cases.

  Invariants preserved: kernel purity/determinism/replay (verification reads injected snapshots + the live pack surface only; no IO/clock/RNG; `intentHashInput` byte-identical), the closed 6-outcome `Decision` algebra (no new outcome), fail-closed (#6), and monotonicity (§C — an unverified Pack only ADDS friction by refusing to install).

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

- 94560c7: fix(red-team,cli): u4 — close three canary-gate fail-open / counter-pollution defects (H12/H13/H14). All within the canary publish gate; the pure 6-outcome kernel, `intentHashInput`, the `Decision` algebra, and determinism are UNTOUCHED. Every change only RAISES friction or refuses to gate (§C monotonicity / fail-CLOSED).
  - **H12 (MED) — a harness error could be baselined away (`@adjudicate/red-team` `runner.ts`).** The `runBaselinedCanaryGate` errors check was baseline-RELATIVE (`errors > baseline.errors`), contradicting the stated invariant "Hard escapes can NEVER be baselined away" and inconsistent with the UNCONDITIONAL EXECUTE gate and the ownership-non-vacuity hard fail beside it. A stale/malicious baseline recording `errors:N` would allowlist N live harness errors (a vacuous/broken canary manufacturing false confidence). FIX: the check is now `if (strict.report.summary.errors > 0)` — unconditional, like a reached EXECUTE; and `deriveCanaryBaseline` now FORCES `errors:0`, so a baseline can never MINT an errors:N ceiling in the first place. Regression test: an errors:N run still ROLLS BACK (exit 2) even against a hand-crafted errors:N baseline, and `deriveCanaryBaseline(...).errors === 0`.
  - **H13 (HIGH, void-the-gate leg) — an unvalidated baseline cast voided the §C gate (`@adjudicate/cli` `commands/red-team.ts`).** `JSON.parse(...) as CanaryBaseline` trusted the file shape blindly. A baseline `{packId:'<match>', scenarios:[]}` passes the packId guard, then every count check evaluates `N > undefined → false`, so the gate exits 0 PROMOTE despite live escapes — a clean exit code CI's `set -e` cannot catch. FIX: a `validateCanaryBaselineShape` structural check runs BETWEEN `JSON.parse` and the packId check, asserting `Number.isFinite` on the required numeric ceilings (`escaped`/`errors`/`ownershipEscaped`), a boolean `taintVacuous`, a string `packId`, and a well-formed `scenarios` array; ANY deviation FAILS CLOSED (exit 2, clear message). `ownershipExercised` stays optional (pre-202 backward-compat). (The "crash → fail-open" half of the finding does not apply — a parse crash already fails closed under `set -e`; only the silent void-the-gate leg is closed.)
  - **H14 (LOW) — ownership scenarios polluted the taint-causality counters (`@adjudicate/red-team` `runner.ts`).** The `ownership_violation.*` scenarios share the `taint_escalation` generator and carry `vector:"taint_escalation"`, so `taintEscalationCausality` miscounted them (a REFUSE at the AUTH phase miscredited against the TAINT gate's operator counters). FIX: the causality filter now excludes them by their stable `ownership_violation.` name prefix. The `taintVacuous` verdict and the 202 ownership-non-vacuity signal are UNCHANGED — only the operator-facing causality breakdown is corrected.

- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [f072839]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [0bcb5ac]
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
- Updated dependencies [5dfa0e5]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [94560c7]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
- Updated dependencies [94ddc76]
  - @adjudicate/core@1.5.0
  - @adjudicate/conformance@3.0.0
  - @adjudicate/red-team@0.3.0
  - @adjudicate/analyze@0.4.2

## 0.3.2

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/analyze@0.4.1
  - @adjudicate/conformance@2.0.0
  - @adjudicate/red-team@0.2.1

## 0.3.1

### Patch Changes

- Updated dependencies [b94372b]
  - @adjudicate/analyze@0.4.0

## 0.3.0

### Minor Changes

- 60daeef: feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

  feat(cli): add `adjudicate pack bom <path>`.

  feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.

- b642424: feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

  feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

  feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.

### Patch Changes

- Updated dependencies [60daeef]
- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
  - @adjudicate/conformance@2.0.0
  - @adjudicate/core@1.3.0
  - @adjudicate/red-team@0.2.0
  - @adjudicate/analyze@0.3.0

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
  - @adjudicate/analyze@0.2.0
  - @adjudicate/conformance@1.0.0

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

- d8c11b7: Phase 6.4 — `adjudicate simulate --scenarios <dir>` diff mode.

  Walk a directory of `*.json` scenario fixtures, run each against the supplied Pack, and render a summary table comparing each `decision.kind` to the scenario's `expected.kind`.

  ```sh
  adjudicate simulate --pack @adjudicate/pack-payments-pix --scenarios ./scenarios
  adjudicate simulate --pack ./packs/my-pack/src/index.ts --scenarios ./scenarios --format json
  ```

  Sample text output:

  ```
  pack: pack-payments-pix

  ✓ 01-execute            EXECUTE               (expected EXECUTE)
  ✗ 02-escalate           ESCALATE              (expected REFUSE)
  ○ 03-advisory           REQUEST_CONFIRMATION  (no expected)
  ! 04-broken             ERROR                 Failed to parse JSON ...

  1 matched · 1 changed · 1 advisory · 1 error
  ```

  ## Per-scenario outcomes

  | Marker       | Status     | Meaning                                                   |
  | ------------ | ---------- | --------------------------------------------------------- |
  | `✓` (green)  | `match`    | `decision.kind === expected.kind`                         |
  | `✗` (red)    | `mismatch` | `decision.kind !== expected.kind`                         |
  | `○` (dim)    | `advisory` | Scenario has no `expected`; reported for visibility       |
  | `!` (yellow) | `error`    | Scenario failed to load (malformed JSON, schema error, …) |

  ## Exit code policy

  | Exit | When                                                                                                 |
  | ---- | ---------------------------------------------------------------------------------------------------- |
  | 0    | No mismatches, no errors                                                                             |
  | 2    | One or more mismatches (mismatch wins over errors — policy regression is the more actionable signal) |
  | 1    | One or more errors and zero mismatches                                                               |

  Mirrors the single-scenario mode's `exit 2 on expected mismatch` contract.

  ## File discovery
  - Top-level `*.json` files only (no recursion).
  - Hidden files (`.foo.json`) and non-JSON entries skipped silently.
  - Sorted alphabetically by basename for stable output across runs.

  ## JSON format

  ```json
  {
    "pack": { "id": "pack-payments-pix" },
    "summary": {
      "total": 4,
      "matched": 1,
      "changed": 1,
      "advisory": 1,
      "errors": 1
    },
    "results": [
      {
        "scenario": "01-execute",
        "status": "match",
        "decision": "EXECUTE",
        "expected": "EXECUTE"
      },
      {
        "scenario": "02-escalate",
        "status": "mismatch",
        "decision": "ESCALATE",
        "expected": "REFUSE"
      },
      {
        "scenario": "03-advisory",
        "status": "advisory",
        "decision": "REQUEST_CONFIRMATION"
      },
      { "scenario": "04-broken", "status": "error", "error": "..." }
    ]
  }
  ```

  Stable shape; safe to pipe into other tools or check into a snapshot file.

  ## Mode selection (mutually exclusive)

  The `simulate` command now accepts exactly one of three input modes:
  - `--scenarios <dir>` — diff mode (new in 6.4)
  - `--scenario <file>` — single bundled (6.2)
  - `--intent <file> --state <file>` — single from pair (6.2)

  Passing more than one (or none) produces a clear error and exits 1.

  ## New programmatic exports from `@adjudicate/cli`
  - `listScenarios(dir)` — directory walker (sorted, filtered, non-recursive)
  - `runDiff(pack, scenarioPaths)` — orchestration; returns `DiffReport`
  - `renderDiffText(report, pack)`, `renderDiffJson(report, pack)` — renderers
  - `computeExitCode(summary)` — exit-code policy in a single place
  - Types: `DiffReport`, `DiffSummary`, `ScenarioResult`, `ScenarioStatus`

  ## Verification

  10 new tests cover: walker correctness (sort/skip-hidden/skip-non-json/empty-dir), `runDiff` outcome classification (match/mismatch/advisory/error), exit-code policy (every combination), and end-to-end command integration (text + JSON output, exit-on-mismatch, mode-selection validation).

  All prior CLI tests pass (38 → 48). Core 253/253, PIX 28/28, KYC 14/14, primitives 13/13 unchanged.

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

### Patch Changes

- d8c11b7: Phase 6.6 — Documentation for `adjudicate simulate` and the scenarios convention.

  ## What changed

  ### `packages/cli/README.md` — rewritten

  Adds the `simulate` command section: three input modes (single bundled, intent+state pair, diff directory), Pack resolution semantics, text and JSON output formats, exit-code policy. Documents the scenario JSON format with a worked example, includes a real text-mode render, and the diff summary table with the four marker statuses (`✓ ✗ ○ !`).

  Also updates the existing `pack init` description to reflect the new template — scenarios/ directory and `test:scenarios` script are now part of the scaffolded layout.

  ### `docs/guides/testing-your-policy.md` — new how-to guide

  End-to-end walkthrough for Pack authors:
  - Why scenarios complement programmatic tests (two surfaces, two audiences).
  - Scenario file anatomy (intent + state + optional expected).
  - Working example using `@adjudicate/pack-payments-pix/scenarios/`.
  - Wiring scenarios into your own Pack: directory layout, `test:scenarios` script, vitest conformance test.
  - The `rehydrateState` convention for state shapes that don't round-trip JSON.
  - CI integration example.
  - Three common authoring patterns (regression capture, threshold pinning, attack-defense documentation).
  - Common gotchas (closed-enum fields, hash determinism, etc.).

  ### Top-level `README.md` — packages + docs updates
  - Packages table extended with `@adjudicate/primitives`, `@adjudicate/admin-sdk`, `@adjudicate/cli`, `@adjudicate/pack-identity-kyc` — previously missing despite shipping.
  - Maturity ladder L2 status updated from `emerging` to `shipped` (factory primitives `createThresholdGuard`, `createStateDeferGuard`, `createSystemTaintPolicy` extracted in Phase 5). L3 now mentions Pack #3 (`pack-identity-kyc`).
  - "Heads-up on rework" paragraph removed (L2 has landed; the callout was stale).
  - New entry in the Documentation section linking to the testing guide.

  ## Why this is a `@adjudicate/cli` patch

  The CLI shipped its `simulate` surface across PRs 6.1–6.5 without README coverage. This PR closes that gap and is functionally a documentation-only patch — no code or contract changes. Bundled under the CLI package because the CLI README + simulate guide are the load-bearing additions; the top-README + maturity-ladder edits are factual maintenance on shipped state.

  ## Verification
  - All cross-references resolve (verified via `test -e` on every linked path).
  - Concepts §9 anchor still exists (`#9-architectural-direction-intended-evolution`).
  - All package tests pass: core 253/253, primitives 13/13, PIX 29/29, KYC 15/15, CLI 48/50 (2 pre-existing pack-init failures unchanged).
  - All affected packages lint clean.

  ## Known-stale forward-pointers (out of scope)

  [`packages/anthropic/README.md`](packages/anthropic/README.md) still has an "L2 rework callouts" section that was written before L2 shipped. The forward-ref from the top README to that section was removed in this PR; the anthropic README itself is left for a separate doc pass (would be sensitive to anthropic-adapter API stability, not docs maintenance).

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
