# @adjudicate/admin-sdk

## 8.0.0

### Patch Changes

- Updated dependencies [e650c37]
  - @adjudicate/core@1.9.0

## 7.0.0

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0

## 6.0.0

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0

## 5.0.0

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0

## 4.0.0

### Minor Changes

- 58cad7a: feat(admin-sdk,audit,adjudicant): 111 — write-isolated read-only audit-chain access plane + the new Adjudicant (Inspector-General) observer app, and fix the `replayWithIntegrity` envelope-tamper double-count.

  The §B/§G Adjudicant plane is OBSERVE / INVESTIGATE / ESCALATE — never authorize or weaken. This plan stands up that plane on a **router-level write-isolation seam** and ships it as a genuinely NEW third app (separation of powers: `apps/console` = OPERATOR [kill-switch WRITE / replay / recordOutcome], `apps/adjutant` = APPROVER [`approval.resolve` re-adjudicates → can reach EXECUTE], `apps/adjudicant` = OBSERVER, structurally incapable of authorizing or weakening a decision).
  - **admin-sdk — read-only router (T1):** new `readOnlyAdminRouter` = `adminRouter` MINUS every mutation procedure. The READ procedures of the four mutation-bearing namespaces are extracted into shared objects (`emergencyReadProcedures`, `governanceReadProcedures`, `approvalReadProcedures`) that BOTH the full router and the read-only twins spread — a single source of truth, so reads can never drift between the two planes. The full router adds the four mutations (`emergency.update`, `replay.run`, `governance.recordOutcome`, `approval.resolve`) ONLY to itself; the read-only plane exposes ZERO mutations (`replay` becomes an empty namespace; the others keep all their reads). The invariant pinned is "the read plane has no mutations", NOT a mutation count. New exports: `readOnlyAdminRouter`, `ReadOnlyAdminRouter` (type), `createReadOnlyAdminCaller`. The seam is ROUTER-level, not context-level (passing `actor:null` would also break record-level reads — an invalid seam).
  - **admin-sdk — Next adapter (T2):** `NextAdapterOptions.router` widened to `AdminRouter | ReadOnlyAdminRouter` (both share the identical `AdminContext`), so a host can mount either plane through the same `toNextRouteHandler`. The construction-throw mitigation is UNCHANGED — `toNextRouteHandler` still throws "requireAuth is REQUIRED in production" when `requireAuth` is absent in prod, so no Adjudicant app can mount in prod without an explicit auth gate.
  - **admin-sdk — kill-switch write self-isolation (T3):** the lone `emergency.update` mutation, its `NORMAL|DENY_ALL` enum (no allow-all/bypass status), and its wire-level `confirmationPhrase === newStatus` `.refine` are unchanged and remain on the FULL router only — the read-only plane shows kill-switch READ-status (`emergency.state` / `emergency.history`) but cannot toggle it.
  - **audit — `replayWithIntegrity` double-count fix (T4):** gate the `AUDIT_HASH_TAMPERED` push on `auditVerification.reason === "tampered"` ONLY. `verifyAuditRecord` checks envelope intent FIRST and returns `{verified:false, reason:"envelope_intent_mismatch"}` early — that axis is ALREADY captured as `INTENT_HASH_MISMATCH` by the standalone `deriveIntentHash` check, so a forged-envelope / consistent-auditHash record no longer yields a spurious, mislabeled SECOND failure. `total` is unaffected; only the duplicate is removed. (No change needed in `core/src/audit.ts` — `verifyAuditRecord`'s envelope-first ordering is correct; the defect was solely the integrity-harness branch.)

  New tests: read-only-plane write-isolation (full router has exactly the 4 known mutations; read plane has ZERO; every mutation excluded; every query preserved; the four mutations reject NOT_FOUND at runtime on the read-only caller while reads still serve) in `admin-sdk/tests/trpc-router.test.ts`; the isolated "envelope forged, auditHash consistent → EXACTLY ONE INTENT_HASH_MISMATCH, NO spurious AUDIT_HASH_TAMPERED" case in `audit/tests/replay-integrity.test.ts`; the new app's Overview render + the route write-isolation guard (route mounts `readOnlyAdminRouter`, executable code wires no mutation, mandatory `requireAuth`, mounted router has ZERO mutations) in `apps/adjudicant/`.

  Invariants preserved: the pure `adjudicate()` path, `intentHashInput`, and the closed 6-outcome `Decision` algebra are UNTOUCHED. The read-only plane and the integrity-harness fix only REMOVE friction-decreasing surface / a spurious failure (§C monotonicity: the observer can only escalate, never weaken). Per the authoritative human-gate override, the plan's read-plane app-wiring re-targets to the NEW `apps/adjudicant`; `apps/console` and `apps/adjutant` are left otherwise unchanged (no write surface moved).

- 9056c6e: feat(core,audit,audit-postgres,admin-sdk): 093 — inter-record hash chain + external signed checkpoint + chain-continuity replay/read surface, and close the verify-on-read false-tamper cluster on the audit read path. Adds a true cryptographic inter-record link (`prevAuditHash`) so DELETION and REORDERING of audit records become detectable, anchors a chain segment with an externally-signed checkpoint that makes TAIL TRUNCATION detectable, and surfaces chain-continuity status through the replay harness, the supersession-chain report, the cold-store read path, and the admin/console query. All chain machinery lives in the impure shell AFTER the pure decision (§D: "the kernel decides; the shell signs and persists"); `prevAuditHash` is EXCLUDED from the `auditHash` pre-image and from the decision, so the pure `adjudicate()` is byte-unchanged and byte-identical replay (constitutional invariant 5) holds with chain fields present.
  - **T1 (`core/audit.ts`):** add the optional `prevAuditHash?: string` field to `AuditRecord` (the per-stream cryptographic TIP — the `auditHash` of the immediately-preceding record) and an optional `prevAuditHash` on `BuildAuditInput`. `buildAuditRecord` computes `auditHash` FIRST, then threads `prevAuditHash` onto the returned record — so it is EXCLUDED from the `sha256Canonical(baseRecord)` pre-image exactly like `signature`/`metadata`. A genesis record (no predecessor) is `undefined` and hashes byte-identically to a pre-093 record. `verifyAuditRecord` now strips `{auditHash, signature, metadata, prevAuditHash}` before re-deriving, so attaching/threading/changing the chain link never false-tampers an otherwise-intact record. NEVER read by `adjudicate()`, NEVER enters `intentHash` (invariant #4).
  - **T2 (`audit/replay-integrity.ts`):** add the `AUDIT_CHAIN_BROKEN` `IntegrityFailure` kind and a per-stream (session) cursor in `replayWithIntegrity` that compares each record's `prevAuditHash` to the immediately-preceding record's `auditHash` in the same stream. A deleted/reordered INTERIOR record is flagged DISTINCTLY from `AUDIT_HASH_TAMPERED` (each record's own bytes can be intact; the LINK between them is broken — the attack the logical `predecessorIntentHash` could not detect). A genesis record (no link) and an out-of-window predecessor are not flagged (no false positives).
  - **T4 (`audit/replay-integrity.ts`):** add the external signed checkpoint over the chain tip — `AuditCheckpoint` (`{sequence, tipAuditHash, count, signature}`), `auditCheckpointPreimage`, `emitAuditCheckpoint(records, signer, sequence)`, `verifyAuditCheckpoint(records, checkpoint, opts?)`, and the `AuditCheckpointVerification` result. It reuses the 092 `AuditSigner` + `{keyId, alg, value}` signature shape over a versioned canonical pre-image (`AUDIT_CHECKPOINT_PREIMAGE_VERSION`). A deleted TAIL no longer reproduces the signed `(tip, count)` → `count_mismatch`/`tip_mismatch`; the signature (hash-bind verified pure-JS, asymmetric via an injected verifier) stops a forged checkpoint from matching the truncated set; the bound `sequence` stops checkpoint replay at another position.
  - **T3 (`audit/supersession-chain.ts`):** surface the per-stream cryptographic tip on each `SupersessionChainNode` (`auditHash` + `prevAuditHash`) and add a `chainBreaks` diagnostic to `SupersessionChainReport`: a record whose `prevAuditHash` does not equal its RESOLVED supersession predecessor's `auditHash` — the cryptographic break surfaced DISTINCTLY from the (still-resolving) logical `predecessorIntentHash` link.
  - **T5/T6 (`audit-postgres/migrations/012-add-prev-audit-hash.sql`, `src/postgres-sink.ts`):** new ADDITIVE, idempotent migration `012-add-prev-audit-hash.sql` (NOT 011 — `011-create-turn-trace.sql` exists) adding `prev_audit_hash TEXT` PLUS `authority_snapshot_jsonb`/`aggregate_snapshot_jsonb` JSONB columns — NO CHECK widening, NO index/arbiter change (migration 009's UNIQUE arbiter and the 010 `record_version` CHECK are untouched, so the 42P10/23514 activation blockers cannot recur). `INSERT_AUDIT_SQL` / `auditInsertParams` / `IntentAuditRow` / `recordToRow` grow from 25 to 28 columns binding the three new columns in declared order.
  - **T7/T8 (`audit-postgres/src/replay.ts`, `src/audit-store.ts`):** `rowToRecord` rehydrates `prevAuditHash` from the new column (excluded from the pre-image — round-trips) AND, closing the **092-F1 read-path false-tamper cluster**, rehydrates `authoritySnapshot` (033) + `aggregateSnapshot` (052) with the SAME presence-exact omission `buildAuditRecord` used — both ARE in the `auditHash` pre-image, so before 093 a snapshot-bearing record round-tripped through Postgres re-derived a DIFFERENT hash and 092 verify-on-read FALSELY flagged it tampered (fail-SAFE, never fail-open). The cold-store reader's `SELECT_COLUMNS` carries the three new columns.
  - **T9 (`admin-sdk/src/handlers/audit-query.ts`, `src/schemas/query.ts`):** the audit-query handler computes per-stream, ORDER-INDEPENDENT (sorts each stream chronologically before walking, since the cold store lists newest-first) chain-continuity over the returned records and surfaces it as the new optional `AuditQueryResult.chainIntegrity` (`{checked, breaks[]}`) — additive, reading only fields already on each record (no hashing), never altering `records`/`verifications`. Computed standalone (admin-sdk is the BASE package and must not depend on `@adjudicate/audit`).
  - **admin-sdk read-path-owner schema fix (the verify-on-read false-tamper cluster at the WIRE boundary):** Zod `.object()` STRIPS unknown keys, and the tRPC `audit.query`/`audit.byHash` procedures gate output through `AuditRecordSchema`/`AuditQueryResultSchema`. The wire `SupersessionSchema` omitted `binding` (071-F1) and `AuditRecordSchema` omitted `aggregateSnapshot` (052) — BOTH in the `auditHash` pre-image — so a binding/aggregate-bearing record was STRIPPED at the wire and any downstream re-verify FALSELY tampered. Added `binding` to `SupersessionSchema`, `aggregateSnapshot` (+ a new `RecordedAggregateSnapshotSchema`/`AggregateSnapshotSchema` in `schemas/envelope.ts` with drift guards) and `prevAuditHash` to `AuditRecordSchema`. A wire round-trip now preserves every pre-image field and `verifyAuditRecord` stays `verified:true`.
  - **T10 (`apps/console`):** `chainIntegrity` flows through the mounted `adminRouter` + the additive `AuditQueryResultSchema.chainIntegrity` output gate unchanged; a console-side test pins that it reaches the tRPC response via the exact `withVerifyOnRead(store) → createAuditQueryHandler` pipeline the route mounts.

  Invariants preserved: the pure `adjudicate()` path, `intentHashInput`/`EXPECTED_ENVELOPE_KEYS`, and the closed 6-outcome `Decision` algebra are UNCHANGED (no confidence/metadata on Decision; chain fields ride the persist/replay side as injected/recorded state, never the hashed envelope pre-image; invariants #2/#3/#4/#5). Chain-continuity verification and checkpoint validation only ADD friction (§C), never authorize. New tests: `prevAuditHash` pre-image exclusion + genesis verify (`core/tests/audit-record-v5.test.ts`); byte-identical replay with the chain field (`core/tests/kernel/invariants/replay-determinism.property.test.ts`, 1000-run property); chain-break (delete/reorder) + interleaved-stream + out-of-window cases and full checkpoint deleted-tail/forged/sequence-binding suite (`audit/tests/replay-integrity.test.ts`); per-stream cryptographic tip + broken-link-distinct-from-logical-link (`audit/tests/supersession-chain.test.ts`); 28-column INSERT/params binding + chained/snapshot round-trip false-tamper closure + migration-012 additive-only guards (`audit-postgres/tests/postgres-sink.test.ts`); live-PG migration-012-applies + round-trip-verified (`audit-postgres/tests/integration.test.ts`, validated 19/19 against the docker `ibatexas` stack); chain-integrity surfacing + wire-schema-carries-pre-image-fields (`admin-sdk/tests/audit-query-handler.test.ts`, `schemas-roundtrip.test.ts`); and `chainIntegrity` reaching the tRPC response (`apps/console/src/lib/audit-verification.test.ts`).

- 9928601: feat(admin-sdk,audit-postgres,adjudicant): 112 — Audit Explorer (integrity-on-read + tenantScope on by-hash) on the write-isolated Adjudicant observer plane.

  Delivers the Audit Explorer surface of the §B/§G Inspector-General (OBSERVER) plane: a read-only browse / inspect / integrity / chain-verify view over the append-only audit chain. Per the authoritative human-gate override the explorer UI mounts into the NEW `apps/adjudicant` app (NOT `apps/console`); the substantive SDK/audit work is app-agnostic and implemented per the plan.
  - **admin-sdk — tenantScope threading on the by-hash read seam (T2):** `audit.byHash`'s input gains an optional `tenantScope`, threaded through to `ctx.store.getByIntentHash(intentHash, tenantScope)` per the `AuditStore` contract. This closes the 111-residual `audit.byHash` cross-tenant isolation defect: the SDK previously called `getByIntentHash(intentHash)` with ONE argument, so the contract's host-enforced tenant-isolation slot was UNREACHABLE from the wire even for a tenant-aware host store. Single-tenant reference stores ignore it; a multi-tenant store MUST NOT return a cross-tenant record.
  - **admin-sdk — integrity-on-read for the explorer DTO (T4):** new `audit.byHashVerified` `.query` returns the record ALONGSIDE its `verifyAuditRecord` verdict (the pure browser-safe verifier: auditHash + envelope-intentHash re-derivation + hash-bind signature). A tampered / forged record is STILL returned (forensics need the bytes) but carries `verified:false`, so the explorer renders a deny-by-default tamper badge rather than presenting it as authoritative (§C: a read only ADDS friction). It is additive — the existing `audit.byHash` is untouched (the console gateway keeps its bare-record shape), and NO mutation is added (the read-only explorer plane stays at zero mutations; the full router stays at 4).
  - **audit-postgres — by-hash read accepts/ignores tenantScope (T3):** `createPostgresAuditStore`'s `getByIntentHash` gains the contract's optional `tenantScope` second arg. This single-tenant reference cold-store ignores it (no tenant column) and does NOT widen the query (no `$2`, no tenant predicate); the arg keeps the signature contract-compatible so the SDK seam never silently drops the scope. `InvalidCursorError → BAD_REQUEST` duck-typing is untouched.
  - **adjudicant — Audit Explorer surface (T5/T6 re-targeted):** a new `/audit` route + `AuditExplorer` (six-outcome decision-filtered browse, per-row `IntegrityBadge`, `ChainVerifyStatus`), a `useAuditRecord` hook over `audit.byHashVerified`, and a by-hash inspect panel. All pure READS on the read-only tRPC client (typed against `ReadOnlyAdminRouter`): the only procedures reachable are `.query`. LIVE single-record replay (`replay.run`, a mutation) is intentionally ABSENT on this OBSERVER plane — it is an OPERATOR action on the console.

  T1 (the `replayWithIntegrity` `AUDIT_HASH_TAMPERED` double-count/mislabel fix) and its isolated forged-envelope test already landed in 111 — verified NO-OP here, not re-applied.

  Invariants preserved: the pure `adjudicate()` path, the `intentHash` recipe, and the closed 6-outcome `Decision` algebra are UNTOUCHED. No mutation/write surface is added to the read-only explorer plane; integrity-on-read and chain-verify only surface verdicts the pure verifiers already produce (§C/§D — the observer can only add friction, never weaken or authorize).

- 014e8fe: feat(core): 033 — authority-snapshot INJECTION into the kernel decision + RECORDING into the audit record (replayable, §D-5). Per index §B/§D the authority-graph snapshot is an IMMUTABLE INJECTED SNAPSHOT, never a decision layer: it rides into the one kernel decision via injected `state` (because `Guard<K,P,S>` is `(envelope, state)` — the kernel never passes identity) and is recorded into the audit record so re-running the pure kernel over the recorded snapshot reproduces the decision BIT-IDENTICALLY (invariant #5).
  - **T1 (`envelope.ts`):** add the RECORDED `RecordedAuthoritySnapshot` type `{ graph, snapshotHash }` (the injected `AuthorityGraph` + its `hashAuthorityGraph` content-address), co-located with `AuthorityGraph`/`IntentActor`. It is INJECTED STATE, NOT an envelope field: it is NOT in `intentHashInput` and NOT in `EXPECTED_ENVELOPE_KEYS` (both byte-identical to their post-031 value — invariant #4 untouched, every envelope hash unchanged).
  - **T2 (`install.ts`):** thread the snapshot through `installPack` — the documented injection seam (no existing guard injection, no signature check). New optional `InstallPackOptions.authoritySnapshot?: AuthorityGraph`; when supplied, `installPack` content-addresses it (`recordAuthoritySnapshot`) and exposes the RECORDED snapshot on `InstalledPack.authoritySnapshot`. NO authority guard is wired (that is 034); the pack's `authGuards` are untouched.
  - **T3 (`pack-conformance.ts`):** record the injected snapshot by REUSING the `withBasisAudit`/`wrapBundle` idempotent, non-blocking discipline — `recordAuthoritySnapshotOnPack` stamps the recorded snapshot onto a NEW pack object under a `Symbol.for` tag (non-enumerable, never a hashed byte), `readRecordedAuthoritySnapshot` reads it back. Idempotent on an equal snapshot; mutates no guard/policy/Decision. The audit record itself carries it: `AuditRecord.authoritySnapshot` + `BuildAuditInput.authoritySnapshot`, conditionally spread into the `auditHash` pre-image (like 091's `policyVersion`/`kernelVersion`) so the recorded snapshot is tamper-evident and records that injected none stay byte-identical (hash-stable).
  - **T4 (`canonical`):** the recorded snapshot rides 032's `canonicalSnapshot`/`sha256SnapshotCanonical` (RFC 8785 / JCS, NFC, fail-on-non-finite) — NO forked canonicalizer — so it replays bit-identically. Golden-vector tests pin the recorded `{ graph, snapshotHash }` surface.
  - **T5 (`decision.ts`):** `recordAuthoritySnapshot(graph)` builds the recorded snapshot; `authorityGraphStoreFromRecorded(recorded)` re-derives the read-only store from the RECORDED snapshot on REPLAY (so the pure resolver re-runs over byte-identical edges → byte-identical `OwnershipFact` → byte-identical Decision) and FAILS CLOSED (throws) when the recorded `snapshotHash` no longer matches its `graph` (tampered/drifted recorded snapshot — invariant #6). The closed 6-outcome `Decision` algebra is UNTOUCHED (no 7th outcome, no field — invariant #2).

  feat(admin-sdk): 033 — surface the recorded authority snapshot on the audit-envelope schema. Add `AuthorityRelationshipSchema`/`AuthorityPermitsSchema`/`AuthorityEdgeSchema`/`AuthorityGraphSchema`/`RecordedAuthoritySnapshotSchema` (mirroring the core types, with bidirectional build-time drift guards) and the OPTIONAL `authoritySnapshot` field on `AuditRecordSchema`, so recorded decisions expose the injected snapshot for replay/inspection. The `_recordCoreToSchema` drift guard enforces that the schema tracks `AuditRecord`.

  fix(audit-postgres): 033 — `recordedAuthoritySnapshotFromRow` degrade-safe legacy read. The record-level recorded snapshot is 033-new; OLDER audit rows lack it. The tolerant reader returns the recorded snapshot when a structurally-valid one is present and `undefined` otherwise (unreadable JSON, absent, or malformed) — NEVER throws — so legacy rows reconstruct an `AuditRecord` with NO `authoritySnapshot` key (byte-identical, hash-stable, no false-positive tamper on verify). Mirrors the drop-safe `resourceRefs` posture in `legacyV1ToV2`.

  033 ships the INJECTION + RECORDING + replayability only. It does NOT wire the authority guard (034) and does NOT add AC-007 (035). REUSES 032's `AuthorityGraph`/`createAuthorityGraphStore`/`resolveOwnership`/`hashAuthorityGraph`/`canonicalSnapshot` — nothing re-implemented.

- 5f37c7c: feat(admin-sdk,adjudicant): 114 — escalate/recommend surface (escalate-only, rate-limited) on the write-isolated observer plane.

  The §B/§G Adjudicant (Inspector-General) OBSERVER plane gains exactly ONE write: it can RAISE an escalation/recommendation against an audited decision. Unlike the four AUTHORIZE/WEAKEN mutations (`emergency.update`, `replay.run`, `governance.recordOutcome`, `approval.resolve` — all structurally absent from the read plane), this one write is mounted on BOTH the full `adminRouter` and the `readOnlyAdminRouter`, because it is **friction-monotone by construction** and so cannot weaken anything. The plane's write-isolation invariant is "reads + friction-monotone writes only" — NOT "zero mutations".
  - **admin-sdk — escalate schema (T1):** new `EscalateRecommendationSchema` co-located in `schemas/emergency.ts` — a CLOSED friction-only enum (`pause` / `review` / `escalate`) with NO `allow` / `bypass` / `override` / `lower-threshold` / `EXECUTE` value, mirroring the emergency status enum's "no allow-all/bypass" invariant. Wire-level enforcement means a raw-HTTP caller cannot smuggle a friction-DECREASING recommendation past the UI. New `EscalateInputSchema` (intentHash + recommendation + 10..500-char reason) and `RecordedEscalationSchema` (`kind: "escalation.raised"` — a recorded FACT, explicitly NOT a `Decision`: no `decision` field, the closed 6-outcome algebra is untouched).
  - **admin-sdk — escalate mutation (T2):** new `escalate.raise` `.mutation` on `adminRouter` (taking the full router from 4 to 5 mutations) AND on `readOnlyAdminRouter` (the SOLE write the observer plane permits). Uniform actor gate (`UNAUTHORIZED` without an actor, checked BEFORE port feature-detection and rate-limit). Feature-detected `escalationSink` port (`PRECONDITION_FAILED` when unwired). Per-actor sliding-window rate-limit BEFORE any write (`TOO_MANY_REQUESTS` over the window; default 10/min; injectable). Reads the target decision via `getByIntentHash` (tenant-scoped) — `NOT_FOUND` for an unknown hash — but NEVER mutates the audit record. New `createEscalateRateLimiter` (pure, clock-injected) in `trpc/escalate-rate-limit.ts`.
  - **admin-sdk — escalation sink + public surface (T3):** new `EscalationSink` contract + `createInMemoryEscalationSink` (append-only, capped, newest-first) in `store/escalation-store.ts`, with the fail-OPEN durable-log posture documented (governance-plane-only; decision hot-path stays fail-closed). New `escalationSink` + optional `escalateRateLimiter` ports on `AdminContext`. All new schemas, the sink, and the rate limiter are exported from the package root.
  - **adjudicant — durable sink + route mount (T4/T5):** new `createDurableEscalationSink` (the 114 analog of `apps/console`'s `durable-emergency-store` — live sink + fire-and-forget durable log, fail-OPEN on log-infra failure). The observer route (`api/admin/trpc/[trpc]/route.ts`) wires an `escalationSink` into context (the ONLY write port the observer plane carries) behind the existing mandatory `requireAuth` gate. New read-only-typed `escalate.raise` UI: `useRaiseEscalation` hook (the ONE `.mutate(...)` call site in the app), `EscalatePanel` component (friction-only radio set — pause/review/escalate, with NO friction-decreasing control), `/escalate` page, and an Escalate sidebar nav item.
  - **admin-sdk — README (T6):** documents the read-only plane + the escalate-only, rate-limited write, the friction-only enum, the fact-not-decision output, and the fail-OPEN escalation-log posture.

  New tests: friction-only enum (rejects allow/bypass/override/EXECUTE at the wire; each of pause/review/escalate succeeds and records a FACT with no `decision` field), actor gate (UNAUTHORIZED precedence over PRECONDITION_FAILED), feature-detection, per-actor rate-limit (N+1 rejected; per-actor windows isolated), read-not-mutate (NOT_FOUND for unknown hash; record unchanged after escalation), escalate callable on the read-only plane while the 4 authorize/weaken stay unreachable (`admin-sdk/tests/escalate-trpc.test.ts`); pure rate-limiter + in-memory sink unit conformance (`admin-sdk/tests/escalate-rate-limit.test.ts`); the router write-isolation test updated to assert the full router has EXACTLY 5 mutations and the read plane has EXACTLY `escalate.raise` (the 4 authorize/weaken excluded; every query preserved) (`admin-sdk/tests/trpc-router.test.ts`); the Next adapter test updated to confirm the read-only router (now carrying escalate) still prod-throws without `requireAuth` and runs `requireAuth` before `escalate.raise` can reach a resolver (`admin-sdk/tests/next-adapter.test.ts`); the adjudicant route-isolation test updated to assert EXACTLY `escalate.raise` on the mounted router (4 authorize/weaken absent) + the sink is wired; `EscalatePanel` render/submit/success/error tests; and an escalate-surface write-isolation grep (wires only `escalate.raise`, no authorize/weaken token, no friction-decreasing control).

  Invariants preserved: the pure `adjudicate()` path, `intentHash` recipe, and the closed 6-outcome `Decision` algebra are UNTOUCHED. The escalate surface only ADDS friction (§C monotonicity / §D inv.1, inv.2, inv.7: the observer can escalate, never authorize or weaken; it produces facts, not decisions). Per the authoritative human-gate override, the plan's app-wiring (as-written: `apps/console`) re-targets to `apps/adjudicant`; `apps/console` and `apps/adjutant` are left unchanged.

- 3f4bbbc: feat(core): 031 — v3 IntentEnvelope resource-refs (drop-safe hash binding). Add the OPTIONAL `resourceRefs` slot (new `ResourceRefs = Readonly<Record<string,string>>` type) to `IntentEnvelope` / `BuildEnvelopeInput`, threaded through `buildEnvelope`, and bound into the module-private `intentHashInput` pre-image so a present owner ref is tamper-evident (§D #4). CANONICAL-DROP-SAFE — exactly like `actor.attestation`: an envelope without resource-refs (or with the field explicitly `undefined`) omits the key from the canonical pre-image and hashes IDENTICALLY to its post-041 value (the replay-longevity corpus hash `dc624bd0…` is unchanged). `EXPECTED_ENVELOPE_KEYS`/`isIntentEnvelope` admit the new key without requiring it (nine required keys + one optional). No guard consults it in 031 — the authority predicate is plan 034; the kernel decision and determinism are unchanged.

  fix(canonical): add the v3 `envelope-with-resource-refs` cross-impl golden vector plus drop-safety tests; existing no-resource-refs vectors are untouched (the `envelope-hash-recipe` baseline `cd017dd3…` still pins the no-refs sibling).

  feat(admin-sdk): `IntentEnvelopeSchema` gains the optional `resourceRefs` field (new `ResourceRefsSchema = z.record(z.string(), z.string())`) with build-time core↔schema drift guards. Additive — old (no-refs) and new (with-refs) envelopes both round-trip.

  chore(audit-postgres): `legacyV1ToV2` threads stored `resourceRefs` through replay reconstruction; drop-safe for every v1/v2 row (omitted → byte-identical recomputed hash).

  feat(red-team): `ScenarioIntent` gains optional `resourceRefs`, threaded through the runner's `buildEnvelope`; `generateTaintEscalationEnvelopes` emits one v3-with-resource-refs probe per eligible kind asserting a declared owner does NOT weaken the taint short-circuit (still REFUSE).

  Docs: `intent-envelope-v2.schema.json`, `canonical-json-hash.md`, and `canonical-hash-vectors.json` updated to declare/pin the v3 field and its drop-safety.

### Patch Changes

- b77f6b0: feat(core,audit,audit-postgres,admin-sdk): 092 — pluggable `AuditSigner` + verify-on-read. Wire a real cryptographic `signature` over each audit record's `auditHash` (replacing the never-populated keyless stub) and verify records on the cold-store READ path so tampered/forged rows are FLAGGED rather than rendered as authoritative. Signing and verification live entirely in the impure shell AFTER the pure decision (§D: "the kernel decides; the shell signs and persists") — the pure `adjudicate()` is byte-unchanged and never signs. The `signature` stays EXCLUDED from the `auditHash` pre-image, so post-hoc signing never invalidates tamper-evidence; verify-on-read only ADDS friction (§C), never authorizes.
  - **T1 (`core/audit.ts`):** add the `AuditSignature` type, the pluggable `AuditSigner` interface (`{ keyId; sign(auditHash) }`), the browser-safe pure-JS hash-bind signer (`hashBindAuditSigner` / `bindAuditSignature` / `auditSignaturePreimage`, `alg: "sha256-hashbind"`, mirroring `bindCapability`), and the `AUDIT_HASHBIND_ALG` / `AUDIT_SIGNATURE_PREIMAGE_VERSION` constants. `buildAuditRecord` gains an optional `signer` on `BuildAuditInput`: it computes `auditHash` FIRST, then attaches `signer.sign(auditHash)` — a THROWING signer propagates (FAIL-CLOSED, §D inv. 6). `verifyAuditRecord` gains a new `{ verified:false, reason:"invalid_signature", keyId, alg }` outcome layered ON TOP of the four-way union: the hash-bind leg is verified pure-JS in core; an optional `VerifyAuditRecordOptions.verifySignature` hook lets a node caller verify asymmetric (ed25519) signatures. Core stays browser-bundleable: no `node:crypto`, no `Buffer`. An ABSENT signature stays a valid, tamper-evident-only record (the OSS contract).
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** thread `signer` through `AdjudicateAndAuditDeps` and populate `record.signature` at BOTH `buildAuditRecord` call sites — the kill-switch early-return REFUSE AND the main (incl. 011 REWRITE-executed) site. A signer error FAILS CLOSED: it propagates out of `buildAuditRecord` BEFORE `sink.emit`, so no unsigned record is ever emitted when a signer was configured (friction, never bypass). Coexists with 011/013/091/052/033 conditional-spread fields; all wall-clock reads still route through `deps.clock ?? defaultClock`.
  - **T3 (`audit/src/replay-integrity.ts`):** map the new signature verdict — `IntegrityFailure.kind` gains `AUDIT_SIGNATURE_INVALID` (distinct from `AUDIT_HASH_TAMPERED`) so an operator can tell "the bytes were modified" from "the bytes are intact but the signature is not authentic"; the existing tamper/intent-mismatch axes are unchanged.
  - **T4 (`audit-postgres/src/audit-store.ts`):** VERIFY-ON-READ on the cold-store read path. `query` runs `verifyAuditRecord` over every returned row and populates the new `AuditQueryResult.verifications` array (index-aligned with `records`; pure / no-I/O so cost is bounded per row). `getByIntentHash` verifies the single row and attaches the verdict via a non-enumerable Symbol slot (`readVerificationSlot`) so the `AuditStore` contract and serialized shape are unchanged. A forged/tampered row is FLAGGED, never dropped (forensics keep the bytes) and never silently authoritative. Reuses the existing `signature`/`audit_hash` rehydration in `replay.ts` (no migration — the columns already exist).
  - **T5 (`admin-sdk`):** add `AuditRecordVerificationSchema` (mirrors the core verdict union) and an OPTIONAL `verifications` array on `AuditQueryResultSchema`; `createAuditQueryHandler` passes the store's verdicts through UNCHANGED (the InvalidCursorError → BAD_REQUEST mapping is preserved). A store that does not verify on read simply omits the field.
  - **T6 (`apps/console`):** new `withVerifyOnRead` store decorator (idempotent — it fills in verdicts only when the inner store omitted them) wraps the route's audit store so the admin Explorer's `audit.query` response carries per-record tamper/signature status in BOTH Postgres and in-memory modes.

  The closed 6-outcome `Decision` algebra, the guard order, and `intentHashInput` are UNCHANGED. Monotonicity (§C) holds: verify-on-read surfaces tamper/forgery — it never weakens a decision or authorizes EXECUTE.

- e8698b1: feat(core,adapter-core,audit,admin-sdk,pack-payments-pix,pack-incident-response,pack-access-governance): 025 — capabilities-as-budgets (bounded standing pre-auth). Add a human-granted, BOUNDED, STANDING pre-authorization that lets a CLASS of intents satisfy the "ask first" threshold up to a declared limit WITHOUT a per-intent confirmation receipt. The pure kernel only ever SUBSTITUTES EXECUTE for the threshold-style outcome (exactly as the confirmation-receipt override does today) and never weakens any state/taint/auth/business guard; the impure shell burns the budget down per EXECUTE. `intentHashInput`, the pure `adjudicate()` path, and the closed 6-outcome `Decision` algebra are UNCHANGED (§D #2: no new Decision kind, no `confidence`/free metadata). The budget substitution is monotonicity-preserving (§C) and fully replayable (§D #5): omitting the additive `budgetGrant` deps slot keeps records byte-identical to pre-025.
  - **`@adjudicate/core` (`src/audit.ts`, `src/basis-codes.ts`, `src/kernel/adjudicate-and-audit.ts`, `src/explain.ts`):** add the `BudgetGrant` data contract (`{ budgetId, intentKind, limit, windowSeconds }`) and the `budget_satisfied` `SupersessionReason` (T1/T3). Add the `budget` basis category with `BASIS_CODES.budget.SATISFIED` (T1). New optional additive `AdjudicateAndAuditDeps.budgetGrant` slot (T1); when supplied AND `grant.intentKind === envelope.kind` AND the kernel returned `REQUEST_CONFIRMATION`, the kernel substitutes `EXECUTE` with an appended `budget:satisfied` basis and auto-derives a `budget_satisfied` `Supersession` linking back to the original REQUEST_CONFIRMATION row (`token` carries the `budgetId`) — EXACTLY mirroring the `confirmationReceipt` override (T2). REFUSE/REWRITE/ESCALATE/DEFER/EXECUTE pass through UNCHANGED. The branch is the second site (after the confirmation receipt) explicitly allowlisted under the `@adjudicate/monotonic-ceiling` lint as a deterministic §C carve-out (a human-granted bounded pre-auth is a recorded deterministic input, not a risk model lowering a ceiling). The kernel does NOT verify or count the grant — the shell asserts it ONLY after a successful atomic decrement. Explain narrations added for `budget:satisfied` and `supersedes:budget_satisfied`.
  - **`@adjudicate/adapter-core` (`src/persistence.ts`, `src/decisions.ts`, `src/loop.ts`, `src/types.ts`, `src/index.ts`):** add the authoritative single-use-COUNTED `BudgetStore` + `createBudgetStore` (T4) backed by the ATOMIC `ParkRedis.evalIncrCheck` Lua primitive (increment-and-check against `limit`) — a deliberately DISTINCT store from 022's claim-and-burn `BurnStore` (a budget METERS N substitutions; a capability BURNS a single token; a per-token burn cannot express an N-use budget). Concurrent burn-downs over a `limit`-N budget yield AT MOST N grants across replicas (the headline atomicity guarantee), WITHOUT mirroring the non-atomic GET+DEL caveat of `persistence-redis.ts`. A client without `evalIncrCheck` throws at construction (no silent non-atomic fallback — fail-closed §D #6). Add an in-memory `evalIncrCheck` to `createInMemoryDeferStore` (atomic within the single-threaded event loop; window refills on TTL expiry). Add the `runBudgetBurnDown` shell helper (T5) that calls `evalIncrCheck` directly (decrement-then-assert-grant; fail-closed on over-limit / missing-primitive / store error). Wire it into the loop's send path (T5): on a REQUEST_CONFIRMATION for a budget-capable kind, resolve a grant (`AdjudicatedAgentOptions.budget.resolveGrant` — host authority), atomically burn down, and on a successful in-budget decrement RE-adjudicate with `budgetGrant` asserted — yielding a budget-satisfied EXECUTE that supersedes the REQUEST_CONFIRMATION row. **DEFAULT OFF** (option omitted) ⇒ byte-identical to the pre-025 REQUEST_CONFIRMATION path (rollback dial, §7). Authority stays in the single-use-counted counter, never the lossy approval projection.
  - **`@adjudicate/audit` (`src/supersession-chain.ts`):** extend the exhaustive `Record<SupersessionReason, number>` reason-count map + key list with `budget_satisfied` (T6). A budget-satisfied EXECUTE rides the existing EXECUTE-claim ledger plumbing — it claims a key first-writer-wins exactly like any EXECUTE; a second attempt for the same intentHash is REPLAY_SUPPRESSED, so the budget burn is observable in the ledger without weakening first-writer-wins.
  - **`@adjudicate/admin-sdk` (`src/schemas/basis.ts`, `src/schemas/audit.ts`):** add `budget` to `BasisCategorySchema` (keeps the build-time core↔wire drift guard satisfied) and `budget_satisfied` to `SupersessionReasonSchema`, so a budget-satisfied record round-trips through the admin wire schemas (consequence of the new core category/reason).
  - **`@adjudicate/pack-payments-pix` / `pack-incident-response` / `pack-access-governance` (`src/capabilities.ts`, `src/index.ts`):** declare the budget-CAPABLE intent class (T7): `PIX_BUDGET_CAPABLE_INTENTS` (`pix.charge.create`/`pix.charge.refund` — the LLM-proposable money-movers; the TRUSTED-only `pix.charge.confirm` webhook is NOT budget-capable), `INCIDENT_BUDGET_CAPABLE_INTENTS` (`incident.remediation.execute`), `ACCESS_BUDGET_CAPABLE_INTENTS` (`access.request`/`access.revoke`). Each is `satisfies readonly <Kind>[]`, a non-empty subset of the pack's declared intents (asserted in conformance tests), and excludes system-only/escalate kinds. Re-exported from each pack surface so a host wires `budget.resolveGrant` against an operator-authorized subset.

  Tests: kernel substitution + non-flip over all six outcomes + supersession + ledger-claim + confirmation-receipt-wins precedence (`core/tests/kernel/budget-grant.test.ts`); determinism fence (additive-omitted-slot byte-identical auditHash + replayable same-grant byte-identical record) + closed-algebra + property over random kinds (`core/tests/kernel/invariants/budget-substitution.property.test.ts`); atomic at-most-`limit` under CONCURRENT burn-down + window-refill + missing-primitive/store-error fail-closed + loop wiring (in-budget EXECUTE invokes executor, over-limit/no-grant/OFF leaves REQUEST_CONFIRMATION standing) (`adapter-core/tests/budget.test.ts`); in-memory `evalIncrCheck` primitive (`adapter-core/tests/persistence.test.ts`); budget burn recorded in the ledger without weakening first-writer-wins + replay-intact (`audit/tests/ledger.test.ts`); budget-capable declaration per pack (`pack-*/tests/conformance.test.ts`). The substitution is behind an additive deps slot (no slot ⇒ byte-identical legacy behavior); revert = stop asserting grants from the shell and drop the branch.

- 137c533: feat(admin-sdk,adjudicant): 115 — read-only governance views (policy-version history, dashboards, kill-switch read-status) on the write-isolated observer plane.

  The §B/§G Adjudicant (Inspector-General) OBSERVER plane gains its terminal surface: three read-only GOVERNANCE views, all pure `.query` procedures that read recorded snapshots through feature-detected ports — so the plane observes/investigates but can NEVER authorize or weaken a decision (§C / §D-7). This plan adds NO new mutation: the SDK governance views were already present (delivered with the read-only-router seam in 111–114); 115 confirms + pins them and mounts the surface into `apps/adjudicant`.
  - **admin-sdk — governance views are confirmed read-only (T1–T5):** `governance.describePolicy` / `governance.policyManifest` (policy-version history from `ctx.policyDescriptor` / `ctx.policyManifest`), `governance.guardFireStats` / `governance.outcomeDistribution` (dashboards over the read-only `AuditStore`), and `governance.killSwitchTimeline` (kill-switch read-status from `ctx.killSwitchTimeline`) are all `.query` — each omitted port self-fences with `PRECONDITION_FAILED`. They ride the `readOnlyAdminRouter` verbatim via the shared `governanceReadProcedures` object, which structurally EXCLUDES the lone governance mutation (`governance.recordOutcome`). The fail-closed Next mount (`toNextRouteHandler` throws in prod without `requireAuth`) gates them. No code change to the SDK was required (the views/router/context-ports/adapter pre-exist); this is a patch documenting + pinning the contract.
  - **admin-sdk — README (T7):** new "Governance views (read-only, on the observer plane)" section documenting the three views, their backing ports, and their `PRECONDITION_FAILED` runtime feature-detection, plus the kill-switch READ-status-only posture and the "no cryptographic tamper-detection claim" scope note.
  - **adjudicant — governance surface (T6):** the observer route (`api/admin/trpc/[trpc]/route.ts`) now wires the governance READ ports into context behind the existing mandatory `requireAuth` gate — a process-singleton `GuardFireStats` (dashboard) and a `killSwitchTimeline` report computed adopter-side by mapping the OBSERVER's `emergency.history` (`GovernanceEvent`) → `KillSwitchEvent[]` and running the pure `analyzeKillSwitchTimeline` (newest-first history reversed to chronological; `DENY_ALL` → `trip`/`active`, else `clear`/`normal`). The kill-switch view is READ-status only — the data source is the pure `emergencyStore.history(...)` read; the kill-switch WRITE (`emergency.update`) is structurally absent from the read plane and stays on the operator console. New read-only-typed UI: `useGovernance` hooks (`usePolicyDescriptor` / `useGuardFireStats` / `useOutcomeDistribution` / `useKillSwitchTimeline` — all `.query`, `retry:false` so a `PRECONDITION_FAILED` surfaces as a deterministic feature signal), a `GovernancePanel` (policy-version history, dashboards, kill-switch read-status timeline — each section feature-detects its port and renders a "not configured (PRECONDITION_FAILED)" state rather than crashing or fabricating data), a `/governance` page, and a Governance sidebar nav item. The `policyDescriptor` / `policyManifest` ports stay OMITTED in the scaffold (an OBSERVER does not install adopter packs), so the policy-version-history view demonstrates the `PRECONDITION_FAILED` feature-detection path.

  New/updated tests: governance views `.query`-not-`.mutation` on both planes + `PRECONDITION_FAILED` feature-detection (omitted ports) + non-vacuity (wired `guardFireStats` / `store`-backed `outcomeDistribution` serve real reads) + read plane carries ZERO governance mutations while the full router still carries `governance.recordOutcome` (`admin-sdk/tests/governance-views-trpc.test.ts`); kill-switch read-status history newest-first + the read-only plane reads state/history without mutating + `emergency.update` unreachable on the read plane (`admin-sdk/tests/emergency-trpc.test.ts`); the kill-switch view's `history(...)` data source is a pure READ that never engages the WRITE/`update` path (`admin-sdk/tests/emergency-handler.test.ts`); the fail-closed prod mount runs `requireAuth` before a governance read (`killSwitchTimeline`) reaches a resolver (`admin-sdk/tests/next-adapter.test.ts`); the adjudicant route wires the governance READ ports + derives the kill-switch timeline from `emergency.history` as a pure read with `emergency.update` absent (`apps/adjudicant/.../route-isolation.test.ts`); and the `GovernancePanel` page renders all three sections + write-isolation framing + the `PRECONDITION_FAILED` not-configured state (`apps/adjudicant/src/app/governance/page.test.tsx`).

  Invariants preserved: the pure `adjudicate()` path, `intentHash` recipe, and the closed 6-outcome `Decision` algebra are UNTOUCHED — these views never re-decide; they read recorded snapshots (§D-5 replayability). No mutation, schema, or audit-chain change is introduced, so rollback cannot regress the decision hot-path. Per the authoritative human-gate override, the plan's app-wiring (as-written: `apps/console`) re-targets to `apps/adjudicant`; `apps/console` and `apps/adjutant` are left unchanged, and the kill-switch WRITE stays on the operator console (the observer shows READ-status only).

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

## 3.0.0

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 2.2.0

### Minor Changes

- b94372b: Add the policy-manifest builder: `describePack`, `describeInstalledPacks`, `computeManifestDigest`, and `diffPolicyManifests`. The `PolicyManifest` is a JSON-serialisable superset of `describePolicyBundle` that captures, per Pack and per intent kind, the taint floor, the phase-ordered guard chain (with resolved names, structured descriptions, and opt-in source locations), basis codes, DEFER signals, tool bindings, and statically-inferred decision outcomes — plus a stable content `digest` for drift diffing. Powers the rule-provenance tree in the operator console. No `@adjudicate/core` changes (determinism fence untouched).

  `@adjudicate/admin-sdk` gains the matching `PolicyManifestSchema` wire schema (+ `PolicyManifestParsed`) and a `governance.policyManifest` tRPC procedure with an optional `AdminContext.policyManifest` field (feature-detected via `PRECONDITION_FAILED`, mirroring `describePolicy`). admin-sdk carries no `@adjudicate/analyze` dependency — the schema is re-declared permissively per the established pattern.

## 2.1.0

### Minor Changes

- 58655cb: feat(adapter-core): add MemoryStore (in-memory + redis) + `memoryStore`/`enrichContext`/`deriveMemoryWriteback` options — cross-session memory enriches the planner/renderer context UPSTREAM of the envelope; the kernel decision is unchanged (ADR-126).

  feat(admin-sdk): add `memory.bySession` for the console Session Memory panel.

- 1ea3ed4: admin-sdk AI-BOM Explorer surface (ADR-130). New read-only `pack.aiBomList` (returns one `AiBomSummary` per wired Pack — packId@version, model, healthTier/healthScore, conformance pass/passedCount/total, fingerprint, bomDigest, frameworks, generatedAt, `signed`) and `pack.aiBomById` (input `{ packId, packVersion? }` → the full `AiBom`; deterministic latest pick by semver-max with `bomDigest` tiebreak when version omitted). New schemas `AiBomSummarySchema`/`AiBomListResultSchema`/`AiBomByIdQuerySchema` and pinned element schemas `AiBomToolRefSchema`/`AiBomRagRefSchema` (+ inferred types), plus `toAiBomSummary`/`pickLatestAiBom` helpers. `AiBomSchema.tools`/`.rag` element shapes are tightened from permissive records to the pinned refs — additive validation within `bomVersion "1.0"` (the producer already only emits these fields; no wire-format change). New `AdminContext.aiBoms?: ReadonlyArray<AiBomParsed>`; the existing `aiBom?` field and `pack.aiBom` are unchanged, and both new procedures fall back to `[ctx.aiBom]` when only the legacy single BOM is wired. Like `pack.aiBom`, the new procedures require no actor (the BOM is non-sensitive) and never surface a signature value (only `signed: boolean`). No closed-enum widening, no kernel/wire/canonical-hash change. Powers the console `/ai-bom` Explorer page and the public web `/transparency/ai-bom` view.
- 60daeef: feat(conformance): add `generateAiBom` — a pure AI Bill-of-Materials generator (EU AI Act / NIST AI RMF aligned) composing fingerprint + conformance + health + manifest; `bomDigest` excludes generatedAt + signature for reproducibility. New optional manifest fields modelVersion/promptHashes/tools/rag (ADR-127).

  feat(cli): add `adjudicate pack bom <path>`.

  feat(admin-sdk): add `pack.aiBom` for the console AI-BOM panel.

- 5c1460d: feat(approval-engine): add `createRedisApprovalRegistry` (+ `CreateRedisApprovalRegistryOptions`, `ApprovalRedisClient`) — a Redis-backed `ApprovalRegistry` implementing the same `put`/`get`/`list`/`markResolved` interface as the in-memory reference, for restart-durable approval projections. Stores ONLY the display projection (never the authoritative envelope blob — that stays in the single-use ConfirmationStore). `markResolved` is a guarded, idempotent read-modify-write; the residual GET+SET TOCTOU is a display-projection race only (the real single-use guarantee lives in `ConfirmationStore.take()` inside `agent.confirm()`). The adopter injects a minimal `set/get/del/keys` client — no hard dependency on a concrete Redis client. ADR-136.

  feat(admin-sdk): add read-only `approval.history` and `approval.chain` queries (+ `ApprovalHistoryQuery`/`ApprovalHistoryEntry`/`ApprovalHistoryResult` and `ApprovalChainQuery`/`ApprovalChainStepKind`/`ApprovalChainStep`/`ApprovalChainResult` schemas; optional `AdminContext.approvalPort.history`/`.chain`). `approval.history` projects resolved/expired approvals from the registry; `approval.chain` walks the FROZEN `AuditRecord.supersedes` lineage (confirmation_resolved / defer_resumed) into request → resolved → resumed. Both are actor-gated and `PRECONDITION_FAILED` when the optional port members are unwired (`approval.list`/`resolve` unchanged). `resolvedBy`/`actor` are CLAIMED (forgeable header until OIDC); the chain surfaces token PRESENCE only, never the value. ADR-136.

- 2892100: feat(approval-engine): new @adjudicate/approval-engine — reference human-approval orchestration for REQUEST_CONFIRMATION flows with pluggable channels (webhook, console-log) and a replay-safe resume via adapter-core confirm(); ApprovalRegistry projection separate from the single-use ConfirmationStore (ADR-122).

  feat(admin-sdk): add `approval.list` / `approval.resolve` for the console Approvals view.

- 71658f9: Behavioral Drift history surface (ADR-132). `@adjudicate/drift` gains `createDriftHistory({ capacity? })` — a bounded, deterministic snapshot-history accumulator. `record(snapshot, at)` appends a per-dimension TVD + alert-count roll-up of a `DriftSnapshot`, stamped with a CALLER-SUPPLIED `at` timestamp + a monotonic, eviction-stable `seq`; `view()` returns `{ capacity, count, dropped, entries }` (oldest → newest). It is a fixed-capacity ring buffer (default 100), oldest evicted first, with `dropped` exposing eviction so a dashboard never silently loses history. NO wall-clock and NO RNG on any path — the package never reads a clock; timestamps are supplied by the adopter (same clock-free posture as `DriftSnapshot`). New types `DriftHistory`/`DriftHistoryEntry`/`DriftHistoryDimensionEntry`/`DriftHistoryView`/`DriftHistoryOptions`.

  `@adjudicate/admin-sdk` gains the read-only `governance.driftHistory` query (input `{ limit }`, default 100, max 500 → windows the timeline to the last N retained points) returning `DriftHistoryResultSchema` (`{ schemaVersion: 1, capacity, count, dropped, entries }`, each entry `{ at, seq, totalObserved, maxTvd, alertCount, dimensions: { dimension, tvd, alertCount }[] }`). New schemas `DriftHistoryEntrySchema`/`DriftHistoryDimensionEntrySchema`/`DriftHistoryResultSchema`/`DriftHistoryQuerySchema` (+ inferred types) re-declare the `DriftHistoryView` shape as Zod with NO dependency on `@adjudicate/drift` — the same dependency-free posture `BehavioralDriftResultSchema` takes; `DriftDimensionNameSchema` is now also exported. New optional `AdminContext.driftHistory?: { query(input: DriftHistoryQuery): DriftHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `driftDetector`/`governance.behavioralDrift`. No actor required (read-only aggregates). The existing single-point `governance.behavioralDrift` + `BehavioralDriftResultSchema` and `AdminContext.driftDetector` are unchanged. No closed-enum widening (`DriftDimension`/`DriftSignalKind` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/drift` page (Active Drifts + Dimensions + Timeline + a labelled Operational sub-view) and the public web `/transparency/drift` status badge.

- 2ea6156: feat(drift): new @adjudicate/drift package — behavioral/statistical drift detection over the AuditEventBus (total-variation-distance, new-category, proportion-spike) with bounded cardinality and deterministic count-based windows (ADR-119).

  feat(admin-sdk): add `governance.behavioralDrift` returning a drift snapshot for the console Behavioral Drift panel.

- 0726b56: admin-sdk `governance.commandRisk` + `governance.commandRiskEvents` — command-risk aggregation surface (ADR-134, follows ADR-123). New `createCommandRiskStatsHandler` over the existing `AuditStore` folds command-risk dispositions into `(category × disposition)` buckets (max 9), reading both guard channels — `validation.command_blocked`→`refuse`, `validation.command_flag_stripped`/`command_sanitized`→`rewrite`, and `business.rule_satisfied`/`rule:"command_risk_confirm"`→`confirm`. New `createCommandRiskEventsHandler` returns the per-record drill-down (`intentHash`, `at`, `intentKind`, `decisionKind`, `category`, `disposition`) newest-first, with optional `category`/`disposition` filters, a `limit` (default 200, max 500) and a `truncated` flag; it requires an authenticated actor (record-level data). New schemas `CommandRiskQuerySchema`/`CommandRiskResultSchema`/`CommandRiskBucketSchema`/`CommandRiskCategorySchema`/`CommandRiskDispositionSchema` + `CommandRiskEventsQuerySchema`/`CommandRiskEventSchema`/`CommandRiskEventsResultSchema` (+ inferred types). The two enums are **closed** (category mirrors the kernel `CommandRiskCategory` minus `safe`; disposition is one-to-one with the three guard paths) and cannot widen without a governed kernel change. **Redaction by construction:** the guard threads the RAW command string (which may contain live secrets) into the audit detail, but neither handler reads it and no schema has a field that could carry it — the `.output()` Zod gate makes leaking command text or matched rule ids impossible. Powers the console Command Risk page and the public web command-risk transparency view (category distribution only). The guard, basis codes, and kernel are unchanged.
- 7545b17: feat(conformance): add Configuration Integrity Seal — sealPackConfig / verifyConfigSeal pin the introspectable config surface (declarative + guard metadata + probed taint minimums + basis codes) under a signature (ADR-121). Factored shared canonicalJson into its own module.

  feat(adapter-core): config-seal loop gate — verifies once per agent instance before the first adjudication; on mismatch refuses the turn (new `refused` AgentOutcome + `config_seal_violation` trace) and can engage the kill switch.

  feat(core): add `kill.SEAL_MISMATCH` basis code.

  feat(admin-sdk): add `governance.configSealStatus` for the console seal panel.

- fa94fcd: admin-sdk Configuration Integrity surface (ADR-131). New read-only `governance.configSealStatusAll` (returns `{ entries: PackConfigSealEntry[] }` — one entry per installed pack: `packId`, optional `packVersion`, the existing per-pack `ConfigSealReport` verbatim, and a derived structured `violations[]`) and `governance.killSwitchTimeline` (exposes the already-existing pure producer `analyzeKillSwitchTimeline` from `@adjudicate/audit` over tRPC — the analyzer runs adopter-side and the report is threaded as a read). New schemas `PackConfigSealEntrySchema`/`ConfigSealStatusAllResultSchema`, `SealViolationSchema`/`SealViolationKindSchema` (closed enum `digest_mismatch | signature_failed | signature_missing | policy_error`), and `KillSwitchTimelineReportSchema`/`KillSwitchStabilityClassSchema`/`KillSwitchEventSourceSchema` (structural re-declarations of `@adjudicate/audit`'s closed types — admin-sdk carries no dependency on that package), plus inferred types and the reference helper `deriveSealViolations(report)` that maps report fields to structured violations with the `kill.SEAL_MISMATCH` (`"seal_mismatch"`) linkage on digest mismatches. New optional `AdminContext.configSealReports?: ReadonlyArray<PackConfigSealEntryParsed>` and `AdminContext.killSwitchTimeline?: KillSwitchTimelineReportParsed`; both throw PRECONDITION_FAILED when absent (feature-detectable). The existing single-pack `governance.configSealStatus` + `ConfigSealReportSchema` and `AdminContext.configSealStatus` are unchanged. No actor required (read-only aggregates). No closed-enum widening, no kernel/wire/canonical-hash change. Powers the console `/integrity` page (active seals + violations + kill-switch stability timeline) and the public web `/transparency/integrity` badge.
- 464db38: feat(primitives): add `createDataClassificationGuard` (PII/PHI redaction & refusal). REWRITE masks matched payload fields (taint preserved); REFUSE blocks. Runtime sensitivity tier + redacted fields ride in `DecisionBasis.detail`.

  feat(core): widen `GuardDescription` with the additive `data_classification` variant; add `validation.PII_DETECTED/PII_REDACTED/PII_BLOCKED` basis codes (ADR-117).

  feat(analyze): AJD-104 also flags a `data_classification` REWRITE guard with empty `scannedFields`.

  feat(admin-sdk): add `governance.piiClassificationStats` — aggregates data-classification dispositions by (sensitivityLevel × disposition) for the console.

- 9f1e379: admin-sdk `governance.piiEvents` — event-level data-classification drill-down (ADR-129). New `createPiiEventsHandler` over the existing `AuditStore` returns individual PII disposition events (`intentHash`, `at`, `intentKind`, `decisionKind`, `sensitivityLevel`, `disposition`) newest-first, with optional `sensitivityLevel`/`disposition` filters, a `limit` (default 200, max 500) and a `truncated` flag. New schemas `PiiEventsQuerySchema`/`PiiEventSchema`/`PiiEventsResultSchema` (+ inferred types) reuse the existing `SensitivityLevel`/`PiiDisposition`/`DecisionKind` enums (no new/widened enums). The event row carries no redacted values or field paths — redaction by construction. Requires an authenticated actor (record-level data). Powers the console PII Events page and the public web transparency view; the existing aggregate `governance.piiClassificationStats`, the guard, and the kernel are unchanged.
- 1f091ef: feat(analyze): add Tier-3 PolicyCoherenceAnalyzer (AJD-301) — structural coherence checks (phantom/unreachable intent, system-taint contradiction, threshold-conflict note, planner-probe error) via pure pack inspection + planner probing; new `plannerProbes`/`tier3Analyzers` analyze options (ADR-125).

  feat(admin-sdk): add `governance.policyCoherence` for the console Policy Coherence panel.

- 75e85df: Red-team run-history surface (ADR-133). `@adjudicate/red-team` gains three additive, PURE helpers: `digestRedTeamReport(report)` — a deterministic "0x…" CONTENT digest (canonical-JSON sha256 via `@adjudicate/canonical`) over a report's meaningful fields (pack id, per-result name+vector+status sorted, summary counts), EXCLUDING any timestamp, so two identical-policy runs collide to one digest regardless of when they ran; `runRedTeamAcrossPacks(packs, opts)` — runs the full suite (all three vectors) against many packs in input order; and `createInMemoryRedTeamHistoryStore({ capacity? })` — a bounded, deterministic run-history store. `record(report, at)` appends one immutable `RedTeamRunRecord = { digest, at, packId, summary }`, stamped with a CALLER-SUPPLIED `at`, IDEMPOTENT on `(packId, digest)` (re-recording the same content is a no-op), with a per-pack FIFO ring (default capacity 500); `view(query?)` returns `{ runs, trend }` — runs newest-first per pack (optionally filtered by `packId` / windowed by `limit`) plus a chronological `RedTeamTrendPoint[]` (`at, packId, total, defended, escaped, errors`). NO wall-clock and NO RNG on any path — digests are timing-excluded, timestamps are caller-supplied (same clock-free posture as the existing `runRedTeam`/`generateAllVectors`). New types `RedTeamRunRecord`/`RedTeamTrendPoint`/`RedTeamHistoryView`/`RedTeamHistoryQuery`/`RedTeamHistoryStore`/`RedTeamHistoryOptions`. New `@adjudicate/canonical` dependency for the digest.

  `@adjudicate/admin-sdk` gains the read-only `governance.redTeamHistory` query (input `RedTeamHistoryQuerySchema` `{ packId?, limit? }`, `limit` capped at 500 → windows to the last N runs per pack) returning `RedTeamHistoryResultSchema` (`{ runs: RedTeamRunRecord[], trend: RedTeamTrendPoint[] }`). New schemas `RedTeamRunRecordSchema` (`{ digest: /^0x[0-9a-f]+$/, at: datetime, packId, summary }`, reusing the frozen `RedTeamSummarySchema`), `RedTeamTrendPointSchema`, `RedTeamHistoryResultSchema`, `RedTeamHistoryQuerySchema` (+ inferred types) re-declare the `RedTeamHistoryView` shape as Zod with NO dependency on `@adjudicate/red-team` — the same dependency-free posture `RedTeamReportSchema` (ADR-118) takes. New optional `AdminContext.redTeamHistory?: { view(input): RedTeamHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `redTeamReport`/`governance.redTeam`. No actor required (read-only aggregates). The existing single-shot `governance.redTeam` + `RedTeamReportSchema` and `AdminContext.redTeamReport` are unchanged. No closed-enum widening (`AttackVector`/`RedTeamStatus` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/red-team` page (Attack categories + Pass/fail + Trend) and the public web `/transparency/red-team` clean/regressed defenses badge.

- b642424: feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

  feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

  feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.

- 1e0058b: feat(primitives): add `createTokenBudgetGuard` — pure guard that REFUSE/DEFERs on per-session/per-tenant token budgets, reading the counter from adopter state S (ADR-120).

  feat(adapter-core): `AssistantTurn.usage` + `onTokenUsage` hook surface provider token usage per turn (the adopter folds it into state S).

  feat(anthropic,openai): map provider token usage onto `AssistantTurn.usage`.

  feat(admin-sdk): add `governance.tokenBudget` for the console Token Budget panel.

- 6b291be: Token Governance surface (ADR-135, follows ADR-120). `@adjudicate/adapter-core` gains a token-usage TELEMETRY store: the `TokenUsageStore` interface + `createInMemoryTokenUsageStore({ sessionBudget?, perTenantBudget?, perSessionBudget?, perTenantBudgets?, maxSessions?, maxEvents?, capacity? })`, mirroring the existing `createInMemoryMemoryStore`/`createInMemoryConfirmationStore` (Map-backed ref impl, opportunistic LRU bound, fixed-capacity event ring). Fed by the adapter loop's `onTokenUsage` hook via `record(sample)`, it accumulates per-session AND per-tenant cumulative consumption against configured caps and appends a bounded `TokenExhaustionEvent` when a counter CROSSES its cap (once per crossing, not per over-budget sample); reads via `sessions()` / `tenants()` / `exhaustionEvents()` / `totalConsumed()`. New types `TokenUsageSample`, `TokenBudgetConfig`, `SessionConsumption`, `TenantConsumption`, `TokenExhaustionEvent`, and the filter types. **The store is strictly OUTSIDE the determinism boundary — it is TELEMETRY and NEVER a kernel input.** Enforcement stays in `createTokenBudgetGuard` (input is adopter state S, not this store). NO wall-clock on any recorded value (timestamps are caller-supplied — `at` is used verbatim; the only `Date.now()` is the same LRU sweep the memory store already does) and NO RNG (event ids are a monotonic `evt:<n>` sequence, not `randomUUID`), so the store is reproducible across runs/replays. Session counters are LRU-bounded (default 10_000) and events ring-bounded (default 10_000) so unbounded session-id churn cannot grow memory — and the per-tenant aggregate is the backstop for session-churn budget evasion (it aggregates across all of a tenant's sessions regardless of churn). Redis is a noted follow-up (the in-memory store + interface ship now).

  `@adjudicate/admin-sdk` gains the read-only `governance.tokenBudgetByTenant` query (input `TokenBudgetTenantQuerySchema` `{ tenantId?, since?, eventLimit≤500 }`) returning `TokenBudgetByTenantResultSchema` (`{ tenants[], exhaustionEvents[], totalConsumed }`); throws PRECONDITION_FAILED when `ctx.tokenBudget.queryByTenant` is absent (feature-detectable), mirroring `governance.tokenBudget`. New schemas `TokenScopeSchema` (CLOSED `session`|`tenant`), `TokenBudgetTenantSchema`, `TokenExhaustionEventSchema`, `TokenBudgetTenantQuerySchema`, `TokenBudgetByTenantResultSchema` (+ inferred types) re-declare the store's read-model as Zod with NO dependency on `@adjudicate/adapter-core`. `TokenBudgetResultSchema` gains ADDITIVE OPTIONAL `tenants?`/`exhaustionEvents?` fields — the existing session-only shape and `governance.tokenBudget` stay byte-compatible. `AdminContext.tokenBudget` widens additively with an optional `queryByTenant` (`query` kept for back-compat; both optional so single-method adopters still typecheck). `ActorSchema` gains an ADDITIVE OPTIONAL `tenantId` and `extractActor` reads `x-adjudicate-actor-tenant` — the minimal multi-tenant dimension that realizes the pre-existing `AuditQuerySchema.tenantScope` convention; single-tenant adopters omit it. No kernel change, no closed KERNEL-enum widening (Decision-6/Taint/IntentActor/BasisCategory unchanged; the only new enum is admin-sdk-local and closed), no canonical-hash change. `TokenExhaustionEvent` is a telemetry read-model — NOT an `AuditRecord` field and NOT a `GovernanceEvent` taxonomy entry. Powers the console `/tokens` Token Governance section (tenant budgets, session budgets, exhaustion timeline) and the public web `/transparency/tokens` aggregate-only, id-free, banded burn-down.

### Patch Changes

- 570db36: feat(core): AuditRecord v5 adds optional `metadata` (EXCLUDED from auditHash) + `attachAuditMetadata` + an `adjudicateAndAudit({ metadataProvider })` seam (ADR-124).

  feat(observability): hallucination scoring — `createHallucinationMetadataProvider` + `bucketHallucinationScore` + `adjudicate.hallucination.score`/`.bucket` semconv attributes.

  fix(admin-sdk,audit-postgres): accept AuditRecord v5 (schema + row mapping).

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

## 2.0.0

### Minor Changes

- 9e65871: Sibling packages to `@adjudicate/core@1.1.0` for the audit-2026-05-24 F2
  release.

  **`@adjudicate/audit`** — `REASON_KEYS` and `emptyReasonCounts()` extended
  to include `"lgpd_scrub"`. Without this version bump, consumers pinning
  `^1.0.0` would receive `audit@1.0.1` whose `reasonCounts[r]++` against the
  new reason yields `undefined++` = `NaN`, corrupting downstream operator
  dashboards.

  **`@adjudicate/admin-sdk`** — `SupersessionReasonSchema` Zod enum extended
  to include `"lgpd_scrub"`. Without this version bump, consumers pinning
  `^1.0.0` would receive `admin-sdk@1.0.0` whose schema rejects the new
  literal with `"Invalid enum value"`, 500-ing every admin tRPC route that
  wraps audit queries.

  Both packages remain backwards-compatible at the runtime layer (new
  literal is purely additive to the union). See `RELEASE-1.1.0.md` for the
  coordinated release sequence.

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

## 1.0.0

### Minor Changes

- Remove `AuditPlanSnapshotSchema.forbiddenConcepts` from the wire schema. The corresponding field is removed in `@adjudicate/core`.

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
