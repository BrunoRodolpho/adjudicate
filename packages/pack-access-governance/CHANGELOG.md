# @adjudicate/pack-access-governance

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

- 94ddc76: feat(conformance,pack-payments-pix,pack-access-governance,pack-deployments-approval): 035 — wire the constitutional authority guard (034's `createAuthorityGuard`) into every shipping pack's `authGuards` and add the static conformance check `AC-007` (untrusted-mutating-needs-owner), closing the §D #8 violation that pack-payments-pix (`pix.charge.create`/`refund`) and pack-access-governance shipped today with `authGuards: []` (mutating UNTRUSTED-min kinds with no owner predicate). 035 is the single authoritative owner of `authGuards` wiring. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved).
  - **`@adjudicate/conformance` (`src/checks/untrusted-mutating-needs-owner.ts`, `src/checks.ts`, `src/index.ts`):** add `untrustedMutatingNeedsOwnerCheck` (`id: "AC-007"`), a STATIC/STRUCTURAL check — like AC-006 and unlike the fuzz checks it does NOT call `adjudicate()`, so it is SAMPLING-FREE and SEED-FREE. It flags a violation when a kind is MUTATING **and** `canPropose("UNTRUSTED", kind, pack.policy.taint) === true` (UNTRUSTED-min, so the taint gate does not short-circuit it) **and** `pack.policy.authGuards.length === 0` (no owner predicate). The MUTATING classifier is **DEFAULT-MUTATING, fail-closed** (resolved by human gate, `_RUN_STATE.md` 2026-06-18): a kind is mutating UNLESS the pack AFFIRMATIVELY declares it read-only via `sideEffects[kind] ∈ {"none","read"}` — an unclassified kind (or a pack with no `sideEffects` map) is assumed mutating. This deliberately avoids the vacuous reading (keying off `sideEffects ∈ {"write","destructive"}` passes on every current pack, since none declare `sideEffects`) and cannot be silenced by omission. Registered in `DEFAULT_CHECKS` (ahead of AC-008 so ids are dense) and exported from the barrel; `runConformance`/`ConformanceCheck` need no change. `run` MUST NOT throw and is deterministic. AC-007 is non-vacuous: it FAILS the pre-035 packs (`authGuards: []`) and PASSES once the guard is wired.
  - **`@adjudicate/pack-payments-pix` / `pack-access-governance` / `pack-deployments-approval` (`src/types.ts`, `src/policies.ts`/`src/index.ts`):** append the SINGLE `createAuthorityGuard` owner predicate (NOT a second `requireTenantBinding`) into each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds (`pix.charge.create`/`refund`; `access.request`/`revoke`; `deployment.approval.request`/`rollback.execute`). Kernel order `state→taint→auth→business` is preserved — the guard lives in `authGuards`, after taint (§D #3), and the TRUSTED-only kinds (`pix.charge.confirm`, `access.review.resolve`/`breakglass`, `deployment.approval.resolve`) are NOT gated (the taint gate owns them). Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `PixAuthorityContext`/`AccessAuthorityContext`/`DeploymentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). The guard reads it from `state` (the kernel never hands a guard identity). When `state.authority` is present the guard is BINDING and fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-035 standalone-demo posture the lighthouse scenarios/fixtures use (which carry no identity model), so existing pack behavior is preserved.
  - **⚠️ IDOR residual (034-F1/F2, documented).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet (`IntentActor.principal` is the provenance enum; `attest()` is a v0.2 stub), so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed), never the run-state-flagged false-sense-of-security. §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority. The guard BODY is not sealed by ConfigSeal (GROUP 08 residual), unchanged here.
  - **`@adjudicate/red-team` (`src/vectors/taint-escalation.ts`):** document that 035 wires the real packs + host seam so 034's `generateOwnershipViolationEnvelopes` IMPERSONATION case is now defended for the shipped money-moving kinds — the ownership-axis canary 084 consumes. (Tests: a state-valid forged-owner refund against the REAL pix pack with authority injected is REFUSEd at the AUTH gate, `auth:scope_insufficient`, proving the owner predicate is genuinely reached, not the taint floor.)

  Tests: AC-007 registration/id-array (`conformance/tests/conformance.test.ts`); the wired owner-predicate REFUSE path per pack (binding/IDOR-closed/fail-closed/ordering) in the pack tests; non-empty `authGuards` asserted for access-governance; the IDOR red-team vector against the real pix pack. The fail-open read-only conformance fixture now AFFIRMATIVELY declares `sideEffects: { "read.only": "read" }` (the documented AC-007 exemption). Monotonicity (§C) preserved: the check and the guard only ADD friction, never authorize EXECUTE.

### Patch Changes

- a9be0ad: feat(adapter-core,core,pack-payments-pix,pack-incident-response,pack-access-governance): 024 — cap-gated executor contract + adapter wiring. Make the executor honor a kernel-shell-minted, single-use, resource-bound capability instead of a raw envelope, so the §B "on EXECUTE → mint signed CAPABILITY → capability-gated EXECUTION FABRIC" edge is enforced in code, not by pack-author convention. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED: the kernel decides, the impure shell mints/signs AFTER the decision (§D), and constitutional invariant #1 holds bytewise — only EXECUTE (or the REWRITE-rewritten envelope) reaches `invokeIntent`, now additionally gated by a burned-on-use capability.
  - **`@adjudicate/adapter-core` (`src/types.ts`, `src/decisions.ts`, `src/loop.ts`, `src/index.ts`):** add the `CapabilityGate` contract (T1) — a DEPENDENCY-INJECTED gate carrying `mint` (the node-side ed25519 `signCapability`, supplied by the adopter), `verify` (the node-side `verifyCapabilitySignature` bound with the issuer's public keys), 022's atomic `burnStore`, and `kernelId`. Adapter-core never imports `@adjudicate/approval-engine` (that would be a dependency cycle) and stays `node:crypto`-free / browser-bundleable, mirroring the config-seal verifier seam. New `AdjudicatedAgentOptions.capabilityGate` (T2) — **DEFAULT OFF**; omitted ⇒ byte-identical to the pre-024 raw-envelope seam (rollback dial, §7). When set, the loop's shell MINTS + SIGNS a capability bound to the EFFECTIVE (EXECUTE or REWRITE-rewritten) envelope's `intentHash` AFTER the pure decision and `mint`s it into 022's store keyed by the effective nonce (best-effort; a throwing signer/store leaves no grant ⇒ the seam fail-closes). `runExecute` (T5) then redeems it EXACTLY ONCE before `invokeIntent`: BURN from 022's atomic store (single-use; a second use re-burns to `null` and is suppressed — never a parallel one), ed25519-VERIFY via the injected `verify`, and constant-time-BIND the capability's `intentHash` to the effective envelope's own hash (anti-IDOR / anti-replay). Any failure (burn miss/expiry, store/IO error, bad signature, hash mismatch) ABORTS the EXECUTE — `invokeIntent` is never reached (invariant #1, fail-closed per #6; §C: gating only adds friction). Composes ABOVE the existing 023 `verifyResourceBinding` fence. `CapabilityGate` re-exported from the package surface (T6).
  - **⚠️ Kernel authority is ed25519, NOT the forgeable hash-bind (021-F1 footgun).** The gate honors a capability as kernel-minted ONLY when the injected `verify` returns true; adopters MUST wire approval-engine's ASYMMETRIC `verifyCapabilitySignature`, NEVER core's pure-JS `verifyCapability` (which checks only hash-bind self-consistency — integrity, not authenticity, and is forgeable by anyone who can recompute the canonical hash). The contract type documents this; the approval-engine integration test PROVES it end-to-end (a `bindCapability` hash-bind-only grant with `alg:"sha256-hashbind"` is REJECTED by the gate; an `ed25519`-signed one is accepted).
  - **`@adjudicate/core` (`src/llm/planner-conformance.ts`, `src/llm/index.ts`):** (T4) widen the optional `pack` parameter of `safePlan` and `assertPlanSubsetOfPack` from a full `PackV0` to the minimal `PackIntentsSurface` (`{ intents }`). A full `PackV0` is structurally assignable (existing callers — `install.ts`, tests — unaffected), but the narrower surface lets a Pack break the planner↔pack construction cycle and adopt the pack-bound 3-arg form from its own `capabilities.ts` (the full `PackV0` value references the planner). `PackIntentsSurface` exported from `@adjudicate/core/llm`. The pure capability schema (021: `Capability`/`UnsignedCapability`/`verifyCapability`) was already exported from `@adjudicate/core` and is unchanged.
  - **`@adjudicate/pack-payments-pix` / `pack-incident-response` / `pack-access-governance` (`src/capabilities.ts`):** (T4) adopt the pack-bound 3-arg `safePlan(planner, classification, pack)` form — declare the pack's intent tuple (`PIX_INTENTS`/`INCIDENT_INTENTS`/`ACCESS_INTENTS`, `satisfies readonly <Kind>[]` to pin against the declared `IntentKind` union, and asserted equal to the `PackV0.intents` field in conformance tests so they cannot drift) and pass `{ intents }` so `assertPlanSubsetOfPack` runs on EVERY `plan()` (not only at install). A planner advertising an intent kind absent from the pack's declared intents now throws `PlanConformanceError` loud — the subset invariant the shipped 2-arg form never engaged.

  Tests: cap-gate single-use redemption / second-use suppression / burn-miss fail-closed / ed25519-verify rejection (non-vacuous toggle) / intentHash-bind anti-IDOR / store-error fail-closed / REWRITE-path gating / OFF-by-default no-op (`adapter-core/tests/cap-gate.test.ts`); the name-collision-not-READ cap-gate-bypass closure (`adapter-core/tests/bridge.test.ts`); the REAL ed25519 kernel-authority leg through the actual executor seam incl. the 021-F1 hash-bind-rejection and cross-intent-replay (`approval-engine/tests/cap-gate-ed25519.test.ts`); the 3-arg subset-leak conformance via the new `PackIntentsSurface` (`core/tests/llm/plan-allowed-intents.test.ts`); the shipped-pack subset invariant engaged non-vacuously (`pack-payments-pix/tests/conformance.test.ts`); and constitutional invariant #1 / kernel-unchanged under the cap gate (`core/tests/kernel/invariants/untrusted-never-executes.property.test.ts`). No schema/persistence migration is hashed (the gate is pure registry/runtime wiring, not ConfigSeal-pinned), so revert is clean (drop the worktree branch / unset the option).

- e8698b1: feat(core,adapter-core,audit,admin-sdk,pack-payments-pix,pack-incident-response,pack-access-governance): 025 — capabilities-as-budgets (bounded standing pre-auth). Add a human-granted, BOUNDED, STANDING pre-authorization that lets a CLASS of intents satisfy the "ask first" threshold up to a declared limit WITHOUT a per-intent confirmation receipt. The pure kernel only ever SUBSTITUTES EXECUTE for the threshold-style outcome (exactly as the confirmation-receipt override does today) and never weakens any state/taint/auth/business guard; the impure shell burns the budget down per EXECUTE. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (§D #2: no new Decision kind, no `confidence`/free metadata). The budget substitution is monotonicity-preserving (§C) and fully replayable (§D #5): omitting the additive `budgetGrant` deps slot keeps records byte-identical to pre-025.
  - **`@adjudicate/core` (`src/audit.ts`, `src/basis-codes.ts`, `src/kernel/adjudicate-and-audit.ts`, `src/explain.ts`):** add the `BudgetGrant` data contract (`{ budgetId, intentKind, limit, windowSeconds }`) and the `budget_satisfied` `SupersessionReason` (T1/T3). Add the `budget` basis category with `BASIS_CODES.budget.SATISFIED` (T1). New optional additive `AdjudicateAndAuditDeps.budgetGrant` slot (T1); when supplied AND `grant.intentKind === envelope.kind` AND the kernel returned `REQUEST_CONFIRMATION`, the kernel substitutes `EXECUTE` with an appended `budget:satisfied` basis and auto-derives a `budget_satisfied` `Supersession` linking back to the original REQUEST_CONFIRMATION row (`token` carries the `budgetId`) — EXACTLY mirroring the `confirmationReceipt` override (T2). REFUSE/REWRITE/ESCALATE/DEFER/EXECUTE pass through UNCHANGED. The branch is the second site (after the confirmation receipt) explicitly allowlisted under the `@adjudicate/monotonic-ceiling` lint as a deterministic §C carve-out (a human-granted bounded pre-auth is a recorded deterministic input, not a risk model lowering a ceiling). The kernel does NOT verify or count the grant — the shell asserts it ONLY after a successful atomic decrement. Explain narrations added for `budget:satisfied` and `supersedes:budget_satisfied`.
  - **`@adjudicate/adapter-core` (`src/persistence.ts`, `src/decisions.ts`, `src/loop.ts`, `src/types.ts`, `src/index.ts`):** add the authoritative single-use-COUNTED `BudgetStore` + `createBudgetStore` (T4) backed by the ATOMIC `ParkRedis.evalIncrCheck` Lua primitive (increment-and-check against `limit`) — a deliberately DISTINCT store from 022's claim-and-burn `BurnStore` (a budget METERS N substitutions; a capability BURNS a single token; a per-token burn cannot express an N-use budget). Concurrent burn-downs over a `limit`-N budget yield AT MOST N grants across replicas (the headline atomicity guarantee), WITHOUT mirroring the non-atomic GET+DEL caveat of `persistence-redis.ts`. A client without `evalIncrCheck` throws at construction (no silent non-atomic fallback — fail-closed §D #6). Add an in-memory `evalIncrCheck` to `createInMemoryDeferStore` (atomic within the single-threaded event loop; window refills on TTL expiry). Add the `runBudgetBurnDown` shell helper (T5) that calls `evalIncrCheck` directly (decrement-then-assert-grant; fail-closed on over-limit / missing-primitive / store error). Wire it into the loop's send path (T5): on a REQUEST_CONFIRMATION for a budget-capable kind, resolve a grant (`AdjudicatedAgentOptions.budget.resolveGrant` — host authority), atomically burn down, and on a successful in-budget decrement RE-adjudicate with `budgetGrant` asserted — yielding a budget-satisfied EXECUTE that supersedes the REQUEST_CONFIRMATION row. **DEFAULT OFF** (option omitted) ⇒ byte-identical to the pre-025 REQUEST_CONFIRMATION path (rollback dial, §7). Authority stays in the single-use-counted counter, never the lossy approval projection.
  - **`@adjudicate/audit` (`src/supersession-chain.ts`):** extend the exhaustive `Record<SupersessionReason, number>` reason-count map + key list with `budget_satisfied` (T6). A budget-satisfied EXECUTE rides the existing EXECUTE-claim ledger plumbing — it claims a key first-writer-wins exactly like any EXECUTE; a second attempt for the same intentHash is REPLAY_SUPPRESSED, so the budget burn is observable in the ledger without weakening first-writer-wins.
  - **`@adjudicate/admin-sdk` (`src/schemas/basis.ts`, `src/schemas/audit.ts`):** add `budget` to `BasisCategorySchema` (keeps the build-time core↔wire drift guard satisfied) and `budget_satisfied` to `SupersessionReasonSchema`, so a budget-satisfied record round-trips through the admin wire schemas (consequence of the new core category/reason).
  - **`@adjudicate/pack-payments-pix` / `pack-incident-response` / `pack-access-governance` (`src/capabilities.ts`, `src/index.ts`):** declare the budget-CAPABLE intent class (T7): `PIX_BUDGET_CAPABLE_INTENTS` (`pix.charge.create`/`pix.charge.refund` — the LLM-proposable money-movers; the TRUSTED-only `pix.charge.confirm` webhook is NOT budget-capable), `INCIDENT_BUDGET_CAPABLE_INTENTS` (`incident.remediation.execute`), `ACCESS_BUDGET_CAPABLE_INTENTS` (`access.request`/`access.revoke`). Each is `satisfies readonly <Kind>[]`, a non-empty subset of the pack's declared intents (asserted in conformance tests), and excludes system-only/escalate kinds. Re-exported from each pack surface so a host wires `budget.resolveGrant` against an operator-authorized subset.

  Tests: kernel substitution + non-flip over all six outcomes + supersession + ledger-claim + confirmation-receipt-wins precedence (`core/tests/kernel/budget-grant.test.ts`); determinism fence (additive-omitted-slot byte-identical auditHash + replayable same-grant byte-identical record) + closed-algebra + property over random kinds (`core/tests/kernel/invariants/budget-substitution.property.test.ts`); atomic at-most-`limit` under CONCURRENT burn-down + window-refill + missing-primitive/store-error fail-closed + loop wiring (in-budget EXECUTE invokes executor, over-limit/no-grant/OFF leaves REQUEST_CONFIRMATION standing) (`adapter-core/tests/budget.test.ts`); in-memory `evalIncrCheck` primitive (`adapter-core/tests/persistence.test.ts`); budget burn recorded in the ledger without weakening first-writer-wins + replay-intact (`audit/tests/ledger.test.ts`); budget-capable declaration per pack (`pack-*/tests/conformance.test.ts`). The substitution is behind an additive deps slot (no slot ⇒ byte-identical legacy behavior); revert = stop asserting grants from the shell and drop the branch.

- e81b801: feat(core): 023 — resource-binding verifier (`verifyResourceBinding`, `ResourceBindingPolicy`, `ResourceBindingResult`, `DEFAULT_RESOURCE_BINDING_POLICY`) in `envelope.ts`. Re-derives the envelope's `intentHash` via the UNTOUCHED `intentHashInput` recipe (`deriveIntentHash`) and constant-time-compares it against the carried hash with `timingSafeHexEqual` — the executor must honor ONLY the kernel-bound (signed) payload. A `payload` / `resourceRefs` (031) swapped AFTER the kernel decision re-derives a DIFFERENT hash and fail-closes (anti-IDOR / anti-resource-swap; invariants #1, #4, #6). The `intentHashInput`/`buildEnvelope`/`deriveIntentHash` bodies are BYTE-IDENTICAL (additive-only file change), so every existing envelope hash, golden vector, and replay corpus is unchanged (invariant #5). No `node:crypto`, no `Buffer` — core stays browser-bundleable (pure-JS canonical fence). The passive `AuditRecord.signature` slot stays PASSIVE — 023 is a hash fence only; the AuditSigner is plan 092. The bound envelope inputs are already recorded on the AuditRecord for replay.

  feat(adapter-core): 023 — enforce the resource binding at the executor seam (`runExecute`, `decisions.ts`) before `invokeIntent`, threaded via a new `resourceBindingPolicy` option (default `"strict"`). The check SUBSUMES the 011/T4 forged-REWRITE re-verify AND EXTENDS the same fence to the EXECUTE payload, so a post-decision resource-swap can never reach the executor (invariant #1). Coexists with 012 (reads serve via `invokeRead`, never reach this gate) and 013 (the kernel crossing that produced the Decision already emitted the required AuditRecord) — none weakened. `"warn"` still fail-closes a mismatch (friction never decreases, §C); `"off"` is the documented rollback dial restoring the exact pre-023 seam. Re-exports `verifyResourceBinding` from the barrel so the seam pins ONE recipe. The `AdopterExecutor.invokeIntent` contract now documents that it receives only the kernel-bound payload.

  feat(runtime): 023 — re-export `verifyResourceBinding` / `ResourceBindingPolicy` and a T4 cross-drift note pinning that the resource-binding pre-image equals the parked-envelope verifier's pre-image (`verifyParkedEnvelopeHash`) — the SAME canonical recipe + comparator, so the executor-seam binding and the resume-time park check cannot disagree (no drift; invariants #4/#5).

  feat(adjutant): 023 — `assertResourceBound` fence at the orchestrator's direct `invokeIntent` seam (it has no `runExecute`): re-derive + constant-time-compare the envelope's `intentHash` before the side effect in both `handle` (EXECUTE) and `resolve` (confirmation EXECUTE), so a swapped/forged proposal envelope fail-closes before the executor (anti-IDOR).

  feat(pack-\*): 023 — document the bound-payload contract on the three shipped packs' `capabilities.ts` (pix / incident-response / access-governance): an LLM-proposable intent reaches the adopter's executor ONLY through a binding-enforced seam, so the executor honors only the exact kernel-adjudicated `payload` / `resourceRefs`.

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

## 0.2.1

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/primitives@0.3.1

## 0.2.0

### Minor Changes

- 2ca4532: feat: new @adjudicate/pack-incident-response (Item 9) and @adjudicate/pack-access-governance (Item 10) — domain Packs exercising all six Decision outcomes via L2 primitives, registered in the console pack registry. Incident: ESCALATE on blast radius / DEFER on dependency-down / REWRITE auto-scope-clamp / CONFIRM destructive remediation. Access: DEFER pending review / REWRITE least-privilege / ESCALATE sensitive resource / CONFIRM revoke. Both system-only kinds (monitor callback, review resolve) are TRUSTED-gated.
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

## 0.1.0-experimental

### Minor Changes

- Initial release. Access-governance Pack exercising all six Decision outcomes
  (DEFER pending review, REWRITE least-privilege, ESCALATE sensitive resource,
  REQUEST_CONFIRMATION revoke, REFUSE, EXECUTE) via L2 primitives.
