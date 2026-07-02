# @adjudicate/pack-cli-agent

## 0.1.4

### Patch Changes

- Updated dependencies [e650c37]
  - @adjudicate/core@1.9.0
  - @adjudicate/primitives@0.4.4

## 0.1.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0
  - @adjudicate/primitives@0.4.3

## 0.1.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/primitives@0.4.2

## 0.1.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/primitives@0.4.1

## 0.1.0

### Minor Changes

- 5dfa0e5: feat(pack-cli-agent,pack-identity-kyc,pack-incident-response): 201 — wire the constitutional authority guard (034's `createAuthorityGuard`) into the three remaining packs that still shipped mutating UNTRUSTED-min kinds with `authGuards: []`, closing the tracked 035-F1 §D #8 gap. Purely ADDITIVE pack-policy wiring — NO kernel change. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (the guard reads injected `state`, never the hashed envelope pre-image; invariants #2/#3/#4/#5 preserved). The `authority` seam rides INJECTED, NON-serialized `state` (the pack rehydrators are untouched), so it never enters the audit/replay hash.
  - **`@adjudicate/pack-cli-agent` / `pack-identity-kyc` / `pack-incident-response` (`src/types.ts`, `src/policies.ts`/`src/policy.ts`, `src/index.ts`):** mirror the 035 pix template exactly. Each pack's `State` gains an OPTIONAL injected `authority?: { store: AuthorityGraphStore; principalOf?: (sessionId) => string|null }` (exported as `CliAuthorityContext` / `KycAuthorityContext` / `IncidentAuthorityContext`) — the documented host-identity injection seam (032/033 store + the IDOR-closing identity map). A single `createAuthorityGuard` owner predicate is appended to each pack's `authGuards`, scoped (via the guard's `matches`) to the mutating UNTRUSTED-min kinds: cli `terminal.run`; kyc `kyc.start` / `kyc.document.upload`; incident `incident.remediation.execute` / `incident.escalate`. The system-only callback kinds (`kyc.vendor.callback`, `incident.monitor.callback`) are EXCLUDED — the taint gate owns them (the same exclusion pix applies to `pix.charge.confirm`). Kernel order `state→taint→auth→business` is preserved (the guard lives in `authGuards`, after taint, §D #3). When `state.authority` is present the guard is BINDING + fail-closed: it resolves ownership from the injected store via `envelope.resourceRefs` and REFUSEs `SECURITY`/`tenant_binding_violation` (basis `auth.scope_insufficient`) on an unbound/absent declared owner, on a `principalOf` mismatch (the AUTHENTICATED actor is not the declared owner — IDOR closure), on a `null` authenticated principal, and on any resolver throw (§D #6, §C: `EXECUTE→REFUSE` only). When `state.authority` is ABSENT the guard returns `null` (inert) — the pre-201 standalone-demo posture, so existing pack behavior is preserved. Each pack's `basisCodes` gains `"tenant_binding_violation"` (the guard's bare `Refusal.code`) to suppress the observe-only `basis_code_drift` telemetry on the §D #8 owner-predicate refusal.
  - **kyc is the SUBSTANTIVE close (the one genuinely-open 035-F1 hole).** Before 201 a forged/unbound/impersonated owner of `kyc.start` / `kyc.document.upload` passed the EMPTY auth slot and landed on the unconditional business DEFER guards (`requireDocumentUpload` / `waitForVerification`) ⇒ DEFER. Because the kernel evaluates state → taint → AUTH → business, wiring the auth-phase guard makes a forged owner REFUSE at the AUTH phase, short-circuiting BEFORE the business DEFER ⇒ the outcome flips **DEFER → REFUSE**. No business-guard change is needed — it is the kernel phase ordering that converts it. The load-bearing regression test (`pack-identity-kyc/tests/ownership.test.ts`) pins `forged-owner → REFUSE, NOT DEFER`.
  - **Host-injection contract (per pack, documented in `types.ts`):** `resourceRefs.resource` names — cli: the cwd / host scope the command acts in; incident: the incident id / blast-radius target (the AUTHENTICATED principal comes from `state.authority.principalOf(actor.sessionId)`, NOT `IncidentContext.operatorId`); kyc: the session's `userId`. `resourceRefs.owner` is the principal the host authority graph binds to that resource.
  - **⚠️ IDOR residual (034-F1/F2, documented, unchanged).** Real IDOR closure requires the host to supply `principalOf` from a TRUSTED session→identity map keyed by `actor.sessionId` (NEVER `resourceRefs.owner`) whose namespace matches the authority-graph principal names. There is no production authenticated-identity data model yet, so this is the documented host injection point. The wiring deliberately does NOT fall back to bare declared-owner binding: a host that injects a store but no `principalOf` yields `null` ⇒ REFUSE (fail-closed). §D #8 is enforced STRUCTURALLY by AC-007 (the owner predicate is present in `authGuards`) and becomes binding at runtime once the host injects authority.
  - **`@adjudicate/conformance` (`tests/ac007-real-packs.test.ts`, `package.json`):** add a non-vacuous AC-007 regression suite against the three real packs — each now PASSES `untrustedMutatingNeedsOwnerCheck`, plus a "if the wiring is reverted (`authGuards: []`) → AC-007 fails" backstop (the stronger backstop lesson, 014-F1). The three packs are added as devDependencies so the test can import them. No conformance runtime/API change.

  **HONEST CAVEAT (not smuggled).** The committed CI adversarial-canary gate loads packs via `loadPackFromModule`, which injects NO authority context — so the ownership probe is structurally inert at that gate for EVERY pack, including pix (whose baseline REFUSEs are state-schema refusals, not owner-predicate refusals). 201 brings these three packs to the SAME bar pix ships at: structural guard presence (AC-007) + in-package unit tests that genuinely exercise the predicate (inject `authority` + a state-valid payload so the envelope REACHES the auth phase). Re-deriving the canary baselines via the documented README workflow is a byte-identical NO-OP — kyc's baseline stays at 12 escaped/DEFER because the committed gate injects no authority and the guard is correctly inert there. Genuine gate-level non-vacuity (extending the red-team generator + canary to inject authority + state-valid payloads for ALL packs incl. pix, the AC-008 reaching-business pattern) is a broader red-team change and remains the tracked FOLLOW-UP, explicitly OUT OF SCOPE here.

### Patch Changes

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
