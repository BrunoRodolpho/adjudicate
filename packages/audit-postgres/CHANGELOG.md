# @adjudicate/audit-postgres

## 4.0.0

### Patch Changes

- 6a73485: feat(core,audit): 052 — aggregate/limit snapshot INJECTION into the kernel decision + RECORDING into the audit record (replayable, §D-5), and the durable, coalesced aggregate-counting SUBSTRATE the multi-horizon limit guards (051) and the transactional reservation store (053) consume read-only. Per index §B/§D the aggregate/limit snapshot is an IMMUTABLE INJECTED SNAPSHOT, never a decision layer: it rides into the one kernel decision via injected `state`/deps (the impure shell computes it from the counting substrate; the kernel never refetches/mutates/timestamps it) and is recorded into the audit record so re-running the PURE kernel over the recorded snapshot reproduces the decision BIT-IDENTICALLY (invariant #5). 052 OWNS the substrate as its single owner; 051/053 CONSUME it read-only.
  - **T1 (`core/envelope.ts`):** add `AggregateSnapshot` (`{ windows: Record<string, number>; at }` — the per-(resource, horizon) committed-aggregate view + the shell-sampled sample time) and the RECORDED `RecordedAggregateSnapshot` (`{ snapshot, snapshotHash }`), co-located with `RecordedAuthoritySnapshot`. INJECTED STATE, NOT an envelope field: NOT in `intentHashInput` and NOT in `EXPECTED_ENVELOPE_KEYS` (the `intentHashInput`/`buildEnvelope`/`deriveIntentHash` bodies are BYTE-IDENTICAL — additive-only file change — so every envelope hash, golden vector, and replay corpus is unchanged; invariant #4/#5).
  - **T2 (`core/decision.ts`, `core/audit.ts`, `core/kernel/adjudicate-and-audit.ts`):** `recordAggregateSnapshot(snapshot)` content-addresses the injected snapshot (`hashAggregateSnapshot` over `@adjudicate/canonical`'s `sha256SnapshotCanonical`, RFC 8785 / JCS — NO forked canonicalizer); `aggregateSnapshotFromRecorded(recorded)` returns the SAME immutable snapshot on REPLAY after a FAIL-CLOSED integrity re-derive (throws when `snapshotHash` no longer matches its `snapshot` — tampered/drifted; invariant #6). New `AuditRecord.aggregateSnapshot` + `BuildAuditInput.aggregateSnapshot`, conditionally spread into the `auditHash` pre-image (like 033's `authoritySnapshot` and 091's `policyVersion`/`kernelVersion`) so the recorded snapshot is tamper-evident; records that injected none stay byte-identical (hash-stable). The wrapper threads a new read-only `AdjudicateAndAuditDeps.aggregateSnapshot` onto BOTH `buildAuditRecord` call sites (main/REWRITE-executed AND kill-switch early-return); it COEXISTS with the 011 REWRITE re-adjudication, 013 kill-switch, 091 version-binding, and 033 authority-snapshot recording as another conditional-spread recorded field — all wall-clock reads still route through `deps.clock ?? defaultClock`.
  - **T3 (`core/kernel/guard-stats.ts`):** document `GuardFireStats` as the SINGLE-OWNER counting substrate. It already coalesces same-`(guardName|guardPhase|decisionKind|day|packId)` buckets and writes the per-call DELTA (`count:1`) to the store, NOT the merged running total (writing merged produces triangular `N(N+1)/2` over-counts), and `queryAsync` reads the store DIRECTLY (no memory union → no double-count). 051's velocity guards and 053's reservation CONSUME this read-only via `queryAsync`; they MUST NOT re-implement the counter or write a non-additive path.
  - **T4 (`audit-postgres/src/guard-stats-store.ts`):** the durable additive contract — `UPSERT_GUARD_STAT_SQL` stays `ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id) DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count` (atomic single-statement accumulate, NOT read-modify-write). FIX: the no-pack case now writes the empty-string sentinel `''`, NOT `null` — a NULL `pack_id` would (a) violate the implicit NOT NULL of a PK column (Postgres 23502) and (b), being treated as DISTINCT in PK/unique arbiters, defeat the `ON CONFLICT` so the upsert duplicates rows instead of coalescing (the over-count failure).
  - **T5 (`audit-postgres/migrations/006-add-guard-fire-stats.sql`):** EDIT the EXISTING migration's PK arbiter (no duplicate file): `pack_id` is now `TEXT NOT NULL DEFAULT ''` so the 5-column `PRIMARY KEY (guard_name, guard_phase, decision_kind, day, pack_id)` is the real, deterministic conflict target the additive `ON CONFLICT` depends on — making counting atomic/coalescing with no silent 42P10/23502.
  - **T6 (`audit/src/ledger.ts`):** document that the recorded aggregate snapshot persists on the durable, replayable governance record (`AuditRecord.aggregateSnapshot`, bound into `auditHash`), carried VERBATIM by this package's `replay.ts`/`replay-integrity.ts` (which take `AuditRecord[]` as-is); the hot-path Execution Ledger remains dedup-only.
  - **T7 (`runtime/src/defer-park.ts`):** align the over-commit-race reasoning — the EPHEMERAL Redis park counter's `INCR→EXPIRE→check→DECR` TOCTOU race (closed by the `evalIncrCheck` Lua seam) is a DIFFERENT atomicity mechanism from the DURABLE additive Postgres upsert; 053's reservation store MUST extend the durable additive template, NOT the ephemeral park sequence.

  The pure `adjudicate()` decision path, the closed 6-outcome `Decision` algebra, and `intentHashInput` are UNCHANGED (purity/determinism/replay preserved; counting + persisting stay in the impure shell, §D #5). 052 ships INJECTION + RECORDING + replayability + the counting substrate only; the velocity/limit guards that read it are 051 and the reservation store is 053. Monotonicity (§C) is preserved: an aggregate/limit signal may only RAISE friction, never authorize EXECUTE.

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

- b77f6b0: feat(core,audit,audit-postgres,admin-sdk): 092 — pluggable `AuditSigner` + verify-on-read. Wire a real cryptographic `signature` over each audit record's `auditHash` (replacing the never-populated keyless stub) and verify records on the cold-store READ path so tampered/forged rows are FLAGGED rather than rendered as authoritative. Signing and verification live entirely in the impure shell AFTER the pure decision (§D: "the kernel decides; the shell signs and persists") — the pure `adjudicate()` is byte-unchanged and never signs. The `signature` stays EXCLUDED from the `auditHash` pre-image, so post-hoc signing never invalidates tamper-evidence; verify-on-read only ADDS friction (§C), never authorizes.
  - **T1 (`core/audit.ts`):** add the `AuditSignature` type, the pluggable `AuditSigner` interface (`{ keyId; sign(auditHash) }`), the browser-safe pure-JS hash-bind signer (`hashBindAuditSigner` / `bindAuditSignature` / `auditSignaturePreimage`, `alg: "sha256-hashbind"`, mirroring `bindCapability`), and the `AUDIT_HASHBIND_ALG` / `AUDIT_SIGNATURE_PREIMAGE_VERSION` constants. `buildAuditRecord` gains an optional `signer` on `BuildAuditInput`: it computes `auditHash` FIRST, then attaches `signer.sign(auditHash)` — a THROWING signer propagates (FAIL-CLOSED, §D inv. 6). `verifyAuditRecord` gains a new `{ verified:false, reason:"invalid_signature", keyId, alg }` outcome layered ON TOP of the four-way union: the hash-bind leg is verified pure-JS in core; an optional `VerifyAuditRecordOptions.verifySignature` hook lets a node caller verify asymmetric (ed25519) signatures. Core stays browser-bundleable: no `node:crypto`, no `Buffer`. An ABSENT signature stays a valid, tamper-evident-only record (the OSS contract).
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** thread `signer` through `AdjudicateAndAuditDeps` and populate `record.signature` at BOTH `buildAuditRecord` call sites — the kill-switch early-return REFUSE AND the main (incl. 011 REWRITE-executed) site. A signer error FAILS CLOSED: it propagates out of `buildAuditRecord` BEFORE `sink.emit`, so no unsigned record is ever emitted when a signer was configured (friction, never bypass). Coexists with 011/013/091/052/033 conditional-spread fields; all wall-clock reads still route through `deps.clock ?? defaultClock`.
  - **T3 (`audit/src/replay-integrity.ts`):** map the new signature verdict — `IntegrityFailure.kind` gains `AUDIT_SIGNATURE_INVALID` (distinct from `AUDIT_HASH_TAMPERED`) so an operator can tell "the bytes were modified" from "the bytes are intact but the signature is not authentic"; the existing tamper/intent-mismatch axes are unchanged.
  - **T4 (`audit-postgres/src/audit-store.ts`):** VERIFY-ON-READ on the cold-store read path. `query` runs `verifyAuditRecord` over every returned row and populates the new `AuditQueryResult.verifications` array (index-aligned with `records`; pure / no-I/O so cost is bounded per row). `getByIntentHash` verifies the single row and attaches the verdict via a non-enumerable Symbol slot (`readVerificationSlot`) so the `AuditStore` contract and serialized shape are unchanged. A forged/tampered row is FLAGGED, never dropped (forensics keep the bytes) and never silently authoritative. Reuses the existing `signature`/`audit_hash` rehydration in `replay.ts` (no migration — the columns already exist).
  - **T5 (`admin-sdk`):** add `AuditRecordVerificationSchema` (mirrors the core verdict union) and an OPTIONAL `verifications` array on `AuditQueryResultSchema`; `createAuditQueryHandler` passes the store's verdicts through UNCHANGED (the InvalidCursorError → BAD_REQUEST mapping is preserved). A store that does not verify on read simply omits the field.
  - **T6 (`apps/console`):** new `withVerifyOnRead` store decorator (idempotent — it fills in verdicts only when the inner store omitted them) wraps the route's audit store so the admin Explorer's `audit.query` response carries per-record tamper/signature status in BOTH Postgres and in-memory modes.

  The closed 6-outcome `Decision` algebra, the guard order, and `intentHashInput` are UNCHANGED. Monotonicity (§C) holds: verify-on-read surfaces tamper/forgery — it never weakens a decision or authorizes EXECUTE.

- 014e8fe: feat(core): 033 — authority-snapshot INJECTION into the kernel decision + RECORDING into the audit record (replayable, §D-5). Per index §B/§D the authority-graph snapshot is an IMMUTABLE INJECTED SNAPSHOT, never a decision layer: it rides into the one kernel decision via injected `state` (because `Guard<K,P,S>` is `(envelope, state)` — the kernel never passes identity) and is recorded into the audit record so re-running the pure kernel over the recorded snapshot reproduces the decision BIT-IDENTICALLY (invariant #5).
  - **T1 (`envelope.ts`):** add the RECORDED `RecordedAuthoritySnapshot` type `{ graph, snapshotHash }` (the injected `AuthorityGraph` + its `hashAuthorityGraph` content-address), co-located with `AuthorityGraph`/`IntentActor`. It is INJECTED STATE, NOT an envelope field: it is NOT in `intentHashInput` and NOT in `EXPECTED_ENVELOPE_KEYS` (both byte-identical to their post-031 value — invariant #4 untouched, every envelope hash unchanged).
  - **T2 (`install.ts`):** thread the snapshot through `installPack` — the documented injection seam (no existing guard injection, no signature check). New optional `InstallPackOptions.authoritySnapshot?: AuthorityGraph`; when supplied, `installPack` content-addresses it (`recordAuthoritySnapshot`) and exposes the RECORDED snapshot on `InstalledPack.authoritySnapshot`. NO authority guard is wired (that is 034); the pack's `authGuards` are untouched.
  - **T3 (`pack-conformance.ts`):** record the injected snapshot by REUSING the `withBasisAudit`/`wrapBundle` idempotent, non-blocking discipline — `recordAuthoritySnapshotOnPack` stamps the recorded snapshot onto a NEW pack object under a `Symbol.for` tag (non-enumerable, never a hashed byte), `readRecordedAuthoritySnapshot` reads it back. Idempotent on an equal snapshot; mutates no guard/policy/Decision. The audit record itself carries it: `AuditRecord.authoritySnapshot` + `BuildAuditInput.authoritySnapshot`, conditionally spread into the `auditHash` pre-image (like 091's `policyVersion`/`kernelVersion`) so the recorded snapshot is tamper-evident and records that injected none stay byte-identical (hash-stable).
  - **T4 (`canonical`):** the recorded snapshot rides 032's `canonicalSnapshot`/`sha256SnapshotCanonical` (RFC 8785 / JCS, NFC, fail-on-non-finite) — NO forked canonicalizer — so it replays bit-identically. Golden-vector tests pin the recorded `{ graph, snapshotHash }` surface.
  - **T5 (`decision.ts`):** `recordAuthoritySnapshot(graph)` builds the recorded snapshot; `authorityGraphStoreFromRecorded(recorded)` re-derives the read-only store from the RECORDED snapshot on REPLAY (so the pure resolver re-runs over byte-identical edges → byte-identical `OwnershipFact` → byte-identical Decision) and FAILS CLOSED (throws) when the recorded `snapshotHash` no longer matches its `graph` (tampered/drifted recorded snapshot — invariant #6). The closed 6-outcome `Decision` algebra is UNTOUCHED (no 7th outcome, no field — invariant #2).

  feat(admin-sdk): 033 — surface the recorded authority snapshot on the audit-envelope schema. Add `AuthorityRelationshipSchema`/`AuthorityPermitsSchema`/`AuthorityEdgeSchema`/`AuthorityGraphSchema`/`RecordedAuthoritySnapshotSchema` (mirroring the core types, with bidirectional build-time drift guards) and the OPTIONAL `authoritySnapshot` field on `AuditRecordSchema`, so recorded decisions expose the injected snapshot for replay/inspection. The `_recordCoreToSchema` drift guard enforces that the schema tracks `AuditRecord`.

  fix(audit-postgres): 033 — `recordedAuthoritySnapshotFromRow` degrade-safe legacy read. The record-level recorded snapshot is 033-new; OLDER audit rows lack it. The tolerant reader returns the recorded snapshot when a structurally-valid one is present and `undefined` otherwise (unreadable JSON, absent, or malformed) — NEVER throws — so legacy rows reconstruct an `AuditRecord` with NO `authoritySnapshot` key (byte-identical, hash-stable, no false-positive tamper on verify). Mirrors the drop-safe `resourceRefs` posture in `legacyV1ToV2`.

  033 ships the INJECTION + RECORDING + replayability only. It does NOT wire the authority guard (034) and does NOT add AC-007 (035). REUSES 032's `AuthorityGraph`/`createAuthorityGraphStore`/`resolveOwnership`/`hashAuthorityGraph`/`canonicalSnapshot` — nothing re-implemented.

- 86abd1a: feat(core): 051 — deterministic cumulative/velocity (rate-limit) guard family + fail-closed rate-limit rollback seam. Per index §C/§D the multi-horizon limit guard is a PURE business-layer predicate: it reads the IMMUTABLE aggregate/limit snapshot that 052 INJECTS into the one kernel decision (read-only `state`/deps) and, on breach, can only RAISE friction (REFUSE/ESCALATE/DEFER) — it never lowers a ceiling, never authorizes EXECUTE. 052 OWNS the aggregate-counting substrate (the `GuardFireStats` delta-write + the additive Postgres upsert + migration-006 PK arbiter); 051 CONSUMES it READ-ONLY and adds the velocity/cumulative GUARD family that reads the coalesced counts, plus hardens the load-bearing rate-limit rollback so a non-EXECUTE decision never poisons a legitimate user's counter.
  - **T1 (`core/kernel/rate-limit.ts`):** new `createCumulativeVelocityGuard(...)` — a synchronous, PURE multi-horizon guard. It reads the injected `AggregateSnapshot` (the 052 `windows` map keyed by an opaque `(resource, horizon)` string) via `resolveSnapshot`, projects this decision's contribution (`resolveIncrement`, default 1, clamped to ≥0 so a malformed resolver can never fabricate headroom), and FIRES when any configured horizon's `committed + increment > max` (the cap value itself is ALLOWED — strict greater-than, identical to `checkRateLimit`'s `count > max`). Deterministic precedence: horizons are evaluated in DECLARED array order (not snapshot key order), so the first-breaching window is replay-stable. Default `onExceeded` ⇒ REFUSE `cumulative_limit_exceeded`, basis `business/RULE_VIOLATED` (monotonicity §C). NO clock/RNG/IO/env — re-running it over the recorded snapshot reproduces a byte-identical decision (invariant #5). New exported types `VelocityHorizon`, `VelocityBreach`, `CumulativeVelocityGuardOptions`. The pre-existing `checkRateLimit`/`createRateLimitGuard` single-window semantics (`exceeded = count > args.max`, idempotent `rollback` closure, decrement-failure → `recordSinkFailure({ sink: "rate-limit" })`, OPTIONAL `decrement` no-op) are pinned unchanged.
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** harden the rollback `finally` seam — `deps.rateLimitRollback` runs for EVERY non-EXECUTE decision EVEN WHEN `sink.emit` throws (the throw path rethrows in `catch` after the `finally` fires; the success path returns normally). The guard reads `decision.kind !== 'EXECUTE' && deps.rateLimitRollback && !rewriteExecuted`, preserving the 011/T2 carve-out (a validated REWRITE that re-adjudicated to EXECUTE ran its bytes, so it does NOT roll back; a REWRITE that failed re-adjudication collapsed to REFUSE and rolls back like any non-EXECUTE). COEXISTS with the 013 kill-switch early-return rollback (its own try/finally), the 091 version-binding, the 033/052 snapshot recording, and the 011 REWRITE/ledger-release error path. §C/#6: a store/IO error on the write path aborts EXECUTE (the error propagates; the caller never receives a clean result hiding a failed audit write) and never fails OPEN.
  - **T3–T5 (read-only consumers, 052/053-owned substrate UNCHANGED):** 051 consumes 052's `core/kernel/guard-stats.ts` delta-write (`count:1`, anti-double-count — assert-6-not-9 regression kept) and `queryAsync` (store-direct, no memory union), the `audit-postgres/src/guard-stats-store.ts` additive `ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` + migration-006 PK arbiter, and re-affirms the `runtime/src/defer-park.ts` `INCR→EXPIRE→check→DECR` TOCTOU note + `evalIncrCheck` Lua seam as the canonical over-commit reference plan 053 inherits. None of those files are edited by 051.

  `intentHashInput`/`EXPECTED_ENVELOPE_KEYS`, the closed 6-outcome `Decision` algebra, and the pure `adjudicate()` decision path are UNCHANGED (purity/determinism/replay preserved; the aggregate snapshot rides injected state, never a hashed envelope field — invariant #4). New tests: the cumulative/velocity guard's boundary enforcement (under/at/over the cap), multi-horizon declared-order precedence, increment clamping, monotonicity (never EXECUTE), and replay-over-recorded-snapshot in `rate-limit.test.ts`; the guard wired end-to-end through `adjudicateAndAudit` (over-limit→REFUSE+rollback, under-limit→EXECUTE+no-rollback, exact boundary, and FAIL-CLOSED rollback-on-sink-throw for both over- and under-limit decisions) in `adjudicate-and-audit.test.ts`; and the exported guard surface locked in `api-surface.test.ts`. The live-PG additive-upsert integration gate (`pnpm -F @adjudicate/audit-postgres integration`) is the T4 durable exercise; it requires `PG_TEST_URL`/`DATABASE_URL` and is environment-gated.

- 9ca6e7c: fix(audit-postgres): H5 — reject NON-INTEGER reservation deltas locally (close a fail-OPEN headroom-fabrication hole). `createPostgresReservationStore().reserve()` gated its delta with `!Number.isFinite(delta) || delta <= 0`, which let a FRACTIONAL delta in `(0,0.5]` through: it is finite and positive, so it reached the writer and was cast to `$6::bigint` in `RESERVE_GUARD_STAT_SQL`, where Postgres rounds `0.5 → 0`. The resulting ZERO-unit `INSERT` lands and returns `rowCount === 1`, so `reserve()` reported `{ reserved: true }` for a claim that reserved NO units — a phantom success that fabricates cap headroom (§C: friction must never silently decrease; the reservation over-commit guard must fail CLOSED). The gate is now `!Number.isInteger(delta) || delta <= 0`, which subsumes the finite check (`NaN`/`±Infinity` are non-integers) and refuses every fractional delta as `{ reserved: false, reason: "invalid_delta" }` LOCALLY, before any DB round-trip — no zero-unit write is ever attempted. This is the only change: the SQL, the affected-row over-commit verdict, the `''` pack-id sentinel, the error-propagation path, the pure `adjudicate()` kernel, the closed 6-outcome `Decision` algebra, the guard order, and `intentHashInput` are all UNCHANGED (this is impure-shell store IO, §D). The 053 verdict-mapping unit test now also exercises fractional deltas (`0.5`/`0.1`/`1.5`/`2.5`) and asserts they are refused as `invalid_delta` with NO writer call.
- 79f47fe: feat(audit-postgres): 053 — durable, transactional reservation store with a single-statement over-commit guard, so a multi-horizon cumulative/velocity cap can be decremented (claimed) under concurrency WITHOUT over-commit. Per index §B/§D the reservation read/write is store IO that lives ONLY in the impure shell AFTER the pure kernel decision — it never enters `adjudicate()`. The reservation EXTENDS the durable additive guard-stats upsert template (NOT the ephemeral park `INCR→EXPIRE→check→DECR` counter, which has a documented TOCTOU over-commit race); over-cap fails CLOSED (§C monotonicity: a decrement may only RAISE friction, never silently over-commit) and a store/IO error on the write path aborts EXECUTE (§D-#6, it propagates rather than failing open). The pure kernel is UNTOUCHED; the rollback + EXECUTE-race-dedup seams are REUSED, not forked.
  - **`@adjudicate/audit-postgres` (`src/guard-stats-store.ts`) — the reservation store (T1/T2):** add `RESERVE_GUARD_STAT_SQL` and `createPostgresReservationStore`. The SQL extends the additive `ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id) DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count` template (same migration-006 PK arbiter — NO new migration) with TWO cap gates so over-commit fails closed in ONE statement: a fresh-key `SELECT $delta WHERE $delta <= $cap` source gate AND a conflict-path `WHERE table.count + EXCLUDED.count <= $cap` predicate on the `DO UPDATE`. An over-cap claim affects ZERO rows (`rowCount === 0` ⇒ REFUSE); a positive count ⇒ the units were reserved atomically. There is NO read-modify-write window — concurrent over-cap claims cannot both win (one updates/inserts, the other's `WHERE` matches zero rows). `reserve` also refuses a non-positive / non-finite delta LOCALLY (it would fabricate headroom, §C) and coerces the no-pack case to the 052 `''` PK sentinel (a NULL would 23502 or split the additive arbiter). `$delta`/`$cap` are cast to `bigint` so Postgres deduces a single consistent parameter type. The `ON CONFLICT` arbiter MUST be a real `UNIQUE`/`PK` exercised against a live DB (the migration-006 `42P10` lesson) — proven by the §6 integration test, not just an asserted SQL string.
  - **`@adjudicate/audit-postgres` (`src/pg-types.ts`, `src/index.ts`) — aligned row types + barrel (T2):** add `coerceBigIntCount` (string | number | bigint → safe-integer `number`, loud on precision loss) and route the shared `audit_guard_stats.count BIGINT` read-back through it from the guard-stats reader, so the reservation store and the guard-stats counter agree on the column shape. Surface `RESERVE_GUARD_STAT_SQL`, `createPostgresReservationStore`, `ReservationKey`, `ReservationOutcome`, `ReservationWriter`, and `CreatePostgresReservationStoreDeps` through the package barrel.
  - **`@adjudicate/runtime` (`src/defer-park.ts`) — durable-vs-ephemeral documentation (T6):** update the over-commit-race doc block to record that 053 DELIVERED the durable answer on the additive `ON CONFLICT` template (`RESERVE_GUARD_STAT_SQL`), contrasting it with this module's EPHEMERAL `INCR→EXPIRE→check→DECR` (Lua-`evalIncrCheck`-seamed) park counter; copying the park sequence into the durable reservation would re-introduce the over-commit race against the authoritative limit — 053 deliberately did not.
  - **`@adjudicate/core` — rollback + dedup wiring REUSED, not forked (T3/T4; tests only):** the `RateLimitResult.rollback` idempotent closure (`kernel/rate-limit.ts`), the `:616-631` non-EXECUTE rollback `finally` and the SET-NX EXECUTE-race dedup (`kernel/adjudicate-and-audit.ts`) are the existing 051/092 seams a refused reservation rides — no source change. Added `rate-limit.test.ts` assertions: a `decrement` FAILURE routes to `recordSinkFailure({ sink: "rate-limit" })` WITHOUT throwing, and that path stays idempotent. The pure kernel (`kernel/adjudicate.ts`) is byte-unchanged (replay-determinism + `test:invariants` green; ZERO `Date.now|Math.random|new Date|process.env` hits).
  - **`@adjudicate/audit` — ledger contract kept intact (T5; tests only):** `ledger.ts` / `ledger-redis.ts` (best-effort `DEL` release, 14-day default TTL) are unchanged so reservation claims do not orphan. Added `ledger.test.ts` assertions: `recordExecution` is first-writer-wins (`'acquired'` then `'exists'` for the same intentHash), `release` (when the client exposes `del`) clears an orphaned key so a retry re-acquires (namespaced key), and `release` is ABSENT when the client cannot DEL (the kernel takes its orphan-telemetry branch).

  §6 live-DB concurrency test (`audit-postgres/tests/integration.test.ts`, gated by `pnpm -F @adjudicate/audit-postgres integration`): exercises `RESERVE_GUARD_STAT_SQL` against the real migration-006 PK arbiter (no `42P10`), proving two concurrent over-cap decrements do not over-commit (one wins, one refuses), 200 concurrent single-unit claims converge on EXACTLY the cap, the fresh-key over-cap first claim inserts zero rows, and distinct packIds key independent caps. Validated against a live Postgres (docker `ibatexas` stack, migrations 001–010 applied): 18/18 integration tests pass.

  Rollback: `RateLimitStore.decrement` and `Ledger.release` are OPTIONAL and the change is additive + worktree-isolated on `feat/merged-053-reservation-store`; dropping the wiring degrades rollback to a no-op without changing the pure decision. Revert the branch to restore prior behavior.

- 3f4bbbc: feat(core): 031 — v3 IntentEnvelope resource-refs (drop-safe hash binding). Add the OPTIONAL `resourceRefs` slot (new `ResourceRefs = Readonly<Record<string,string>>` type) to `IntentEnvelope` / `BuildEnvelopeInput`, threaded through `buildEnvelope`, and bound into the module-private `intentHashInput` pre-image so a present owner ref is tamper-evident (§D #4). CANONICAL-DROP-SAFE — exactly like `actor.attestation`: an envelope without resource-refs (or with the field explicitly `undefined`) omits the key from the canonical pre-image and hashes IDENTICALLY to its post-041 value (the replay-longevity corpus hash `dc624bd0…` is unchanged). `EXPECTED_ENVELOPE_KEYS`/`isIntentEnvelope` admit the new key without requiring it (nine required keys + one optional). No guard consults it in 031 — the authority predicate is plan 034; the kernel decision and determinism are unchanged.

  fix(canonical): add the v3 `envelope-with-resource-refs` cross-impl golden vector plus drop-safety tests; existing no-resource-refs vectors are untouched (the `envelope-hash-recipe` baseline `cd017dd3…` still pins the no-refs sibling).

  feat(admin-sdk): `IntentEnvelopeSchema` gains the optional `resourceRefs` field (new `ResourceRefsSchema = z.record(z.string(), z.string())`) with build-time core↔schema drift guards. Additive — old (no-refs) and new (with-refs) envelopes both round-trip.

  chore(audit-postgres): `legacyV1ToV2` threads stored `resourceRefs` through replay reconstruction; drop-safe for every v1/v2 row (omitted → byte-identical recomputed hash).

  feat(red-team): `ScenarioIntent` gains optional `resourceRefs`, threaded through the runner's `buildEnvelope`; `generateTaintEscalationEnvelopes` emits one v3-with-resource-refs probe per eligible kind asserting a declared owner does NOT weaken the taint short-circuit (still REFUSE).

  Docs: `intent-envelope-v2.schema.json`, `canonical-json-hash.md`, and `canonical-hash-vectors.json` updated to declare/pin the v3 field and its drop-safety.

- Updated dependencies [58cad7a]
- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [9928601]
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
- Updated dependencies [5f37c7c]
- Updated dependencies [cb8d608]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [137c533]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
  - @adjudicate/admin-sdk@4.0.0
  - @adjudicate/audit@4.0.0
  - @adjudicate/core@1.5.0

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
