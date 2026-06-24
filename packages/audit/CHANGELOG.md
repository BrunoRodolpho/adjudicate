# @adjudicate/audit

## 4.0.0

### Minor Changes

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

### Patch Changes

- 58cad7a: feat(admin-sdk,audit,adjudicant): 111 — write-isolated read-only audit-chain access plane + the new Adjudicant (Inspector-General) observer app, and fix the `replayWithIntegrity` envelope-tamper double-count.

  The §B/§G Adjudicant plane is OBSERVE / INVESTIGATE / ESCALATE — never authorize or weaken. This plan stands up that plane on a **router-level write-isolation seam** and ships it as a genuinely NEW third app (separation of powers: `apps/console` = OPERATOR [kill-switch WRITE / replay / recordOutcome], `apps/adjutant` = APPROVER [`approval.resolve` re-adjudicates → can reach EXECUTE], `apps/adjudicant` = OBSERVER, structurally incapable of authorizing or weakening a decision).
  - **admin-sdk — read-only router (T1):** new `readOnlyAdminRouter` = `adminRouter` MINUS every mutation procedure. The READ procedures of the four mutation-bearing namespaces are extracted into shared objects (`emergencyReadProcedures`, `governanceReadProcedures`, `approvalReadProcedures`) that BOTH the full router and the read-only twins spread — a single source of truth, so reads can never drift between the two planes. The full router adds the four mutations (`emergency.update`, `replay.run`, `governance.recordOutcome`, `approval.resolve`) ONLY to itself; the read-only plane exposes ZERO mutations (`replay` becomes an empty namespace; the others keep all their reads). The invariant pinned is "the read plane has no mutations", NOT a mutation count. New exports: `readOnlyAdminRouter`, `ReadOnlyAdminRouter` (type), `createReadOnlyAdminCaller`. The seam is ROUTER-level, not context-level (passing `actor:null` would also break record-level reads — an invalid seam).
  - **admin-sdk — Next adapter (T2):** `NextAdapterOptions.router` widened to `AdminRouter | ReadOnlyAdminRouter` (both share the identical `AdminContext`), so a host can mount either plane through the same `toNextRouteHandler`. The construction-throw mitigation is UNCHANGED — `toNextRouteHandler` still throws "requireAuth is REQUIRED in production" when `requireAuth` is absent in prod, so no Adjudicant app can mount in prod without an explicit auth gate.
  - **admin-sdk — kill-switch write self-isolation (T3):** the lone `emergency.update` mutation, its `NORMAL|DENY_ALL` enum (no allow-all/bypass status), and its wire-level `confirmationPhrase === newStatus` `.refine` are unchanged and remain on the FULL router only — the read-only plane shows kill-switch READ-status (`emergency.state` / `emergency.history`) but cannot toggle it.
  - **audit — `replayWithIntegrity` double-count fix (T4):** gate the `AUDIT_HASH_TAMPERED` push on `auditVerification.reason === "tampered"` ONLY. `verifyAuditRecord` checks envelope intent FIRST and returns `{verified:false, reason:"envelope_intent_mismatch"}` early — that axis is ALREADY captured as `INTENT_HASH_MISMATCH` by the standalone `deriveIntentHash` check, so a forged-envelope / consistent-auditHash record no longer yields a spurious, mislabeled SECOND failure. `total` is unaffected; only the duplicate is removed. (No change needed in `core/src/audit.ts` — `verifyAuditRecord`'s envelope-first ordering is correct; the defect was solely the integrity-harness branch.)

  New tests: read-only-plane write-isolation (full router has exactly the 4 known mutations; read plane has ZERO; every mutation excluded; every query preserved; the four mutations reject NOT_FOUND at runtime on the read-only caller while reads still serve) in `admin-sdk/tests/trpc-router.test.ts`; the isolated "envelope forged, auditHash consistent → EXACTLY ONE INTENT_HASH_MISMATCH, NO spurious AUDIT_HASH_TAMPERED" case in `audit/tests/replay-integrity.test.ts`; the new app's Overview render + the route write-isolation guard (route mounts `readOnlyAdminRouter`, executable code wires no mutation, mandatory `requireAuth`, mounted router has ZERO mutations) in `apps/adjudicant/`.

  Invariants preserved: the pure `adjudicate()` path, `intentHashInput`, and the closed 6-outcome `Decision` algebra are UNTOUCHED. The read-only plane and the integrity-harness fix only REMOVE friction-decreasing surface / a spurious failure (§C monotonicity: the observer can only escalate, never weaken). Per the authoritative human-gate override, the plan's read-plane app-wiring re-targets to the NEW `apps/adjudicant`; `apps/console` and `apps/adjutant` are left otherwise unchanged (no write surface moved).

- 6a73485: feat(core,audit): 052 — aggregate/limit snapshot INJECTION into the kernel decision + RECORDING into the audit record (replayable, §D-5), and the durable, coalesced aggregate-counting SUBSTRATE the multi-horizon limit guards (051) and the transactional reservation store (053) consume read-only. Per index §B/§D the aggregate/limit snapshot is an IMMUTABLE INJECTED SNAPSHOT, never a decision layer: it rides into the one kernel decision via injected `state`/deps (the impure shell computes it from the counting substrate; the kernel never refetches/mutates/timestamps it) and is recorded into the audit record so re-running the PURE kernel over the recorded snapshot reproduces the decision BIT-IDENTICALLY (invariant #5). 052 OWNS the substrate as its single owner; 051/053 CONSUME it read-only.
  - **T1 (`core/envelope.ts`):** add `AggregateSnapshot` (`{ windows: Record<string, number>; at }` — the per-(resource, horizon) committed-aggregate view + the shell-sampled sample time) and the RECORDED `RecordedAggregateSnapshot` (`{ snapshot, snapshotHash }`), co-located with `RecordedAuthoritySnapshot`. INJECTED STATE, NOT an envelope field: NOT in `intentHashInput` and NOT in `EXPECTED_ENVELOPE_KEYS` (the `intentHashInput`/`buildEnvelope`/`deriveIntentHash` bodies are BYTE-IDENTICAL — additive-only file change — so every envelope hash, golden vector, and replay corpus is unchanged; invariant #4/#5).
  - **T2 (`core/decision.ts`, `core/audit.ts`, `core/kernel/adjudicate-and-audit.ts`):** `recordAggregateSnapshot(snapshot)` content-addresses the injected snapshot (`hashAggregateSnapshot` over `@adjudicate/canonical`'s `sha256SnapshotCanonical`, RFC 8785 / JCS — NO forked canonicalizer); `aggregateSnapshotFromRecorded(recorded)` returns the SAME immutable snapshot on REPLAY after a FAIL-CLOSED integrity re-derive (throws when `snapshotHash` no longer matches its `snapshot` — tampered/drifted; invariant #6). New `AuditRecord.aggregateSnapshot` + `BuildAuditInput.aggregateSnapshot`, conditionally spread into the `auditHash` pre-image (like 033's `authoritySnapshot` and 091's `policyVersion`/`kernelVersion`) so the recorded snapshot is tamper-evident; records that injected none stay byte-identical (hash-stable). The wrapper threads a new read-only `AdjudicateAndAuditDeps.aggregateSnapshot` onto BOTH `buildAuditRecord` call sites (main/REWRITE-executed AND kill-switch early-return); it COEXISTS with the 011 REWRITE re-adjudication, 013 kill-switch, 091 version-binding, and 033 authority-snapshot recording as another conditional-spread recorded field — all wall-clock reads still route through `deps.clock ?? defaultClock`.
  - **T3 (`core/kernel/guard-stats.ts`):** document `GuardFireStats` as the SINGLE-OWNER counting substrate. It already coalesces same-`(guardName|guardPhase|decisionKind|day|packId)` buckets and writes the per-call DELTA (`count:1`) to the store, NOT the merged running total (writing merged produces triangular `N(N+1)/2` over-counts), and `queryAsync` reads the store DIRECTLY (no memory union → no double-count). 051's velocity guards and 053's reservation CONSUME this read-only via `queryAsync`; they MUST NOT re-implement the counter or write a non-additive path.
  - **T4 (`audit-postgres/src/guard-stats-store.ts`):** the durable additive contract — `UPSERT_GUARD_STAT_SQL` stays `ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id) DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count` (atomic single-statement accumulate, NOT read-modify-write). FIX: the no-pack case now writes the empty-string sentinel `''`, NOT `null` — a NULL `pack_id` would (a) violate the implicit NOT NULL of a PK column (Postgres 23502) and (b), being treated as DISTINCT in PK/unique arbiters, defeat the `ON CONFLICT` so the upsert duplicates rows instead of coalescing (the over-count failure).
  - **T5 (`audit-postgres/migrations/006-add-guard-fire-stats.sql`):** EDIT the EXISTING migration's PK arbiter (no duplicate file): `pack_id` is now `TEXT NOT NULL DEFAULT ''` so the 5-column `PRIMARY KEY (guard_name, guard_phase, decision_kind, day, pack_id)` is the real, deterministic conflict target the additive `ON CONFLICT` depends on — making counting atomic/coalescing with no silent 42P10/23502.
  - **T6 (`audit/src/ledger.ts`):** document that the recorded aggregate snapshot persists on the durable, replayable governance record (`AuditRecord.aggregateSnapshot`, bound into `auditHash`), carried VERBATIM by this package's `replay.ts`/`replay-integrity.ts` (which take `AuditRecord[]` as-is); the hot-path Execution Ledger remains dedup-only.
  - **T7 (`runtime/src/defer-park.ts`):** align the over-commit-race reasoning — the EPHEMERAL Redis park counter's `INCR→EXPIRE→check→DECR` TOCTOU race (closed by the `evalIncrCheck` Lua seam) is a DIFFERENT atomicity mechanism from the DURABLE additive Postgres upsert; 053's reservation store MUST extend the durable additive template, NOT the ephemeral park sequence.

  The pure `adjudicate()` decision path, the closed 6-outcome `Decision` algebra, and `intentHashInput` are UNCHANGED (purity/determinism/replay preserved; counting + persisting stay in the impure shell, §D #5). 052 ships INJECTION + RECORDING + replayability + the counting substrate only; the velocity/limit guards that read it are 051 and the reservation store is 053. Monotonicity (§C) is preserved: an aggregate/limit signal may only RAISE friction, never authorize EXECUTE.

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

- 86abd1a: feat(core): 051 — deterministic cumulative/velocity (rate-limit) guard family + fail-closed rate-limit rollback seam. Per index §C/§D the multi-horizon limit guard is a PURE business-layer predicate: it reads the IMMUTABLE aggregate/limit snapshot that 052 INJECTS into the one kernel decision (read-only `state`/deps) and, on breach, can only RAISE friction (REFUSE/ESCALATE/DEFER) — it never lowers a ceiling, never authorizes EXECUTE. 052 OWNS the aggregate-counting substrate (the `GuardFireStats` delta-write + the additive Postgres upsert + migration-006 PK arbiter); 051 CONSUMES it READ-ONLY and adds the velocity/cumulative GUARD family that reads the coalesced counts, plus hardens the load-bearing rate-limit rollback so a non-EXECUTE decision never poisons a legitimate user's counter.
  - **T1 (`core/kernel/rate-limit.ts`):** new `createCumulativeVelocityGuard(...)` — a synchronous, PURE multi-horizon guard. It reads the injected `AggregateSnapshot` (the 052 `windows` map keyed by an opaque `(resource, horizon)` string) via `resolveSnapshot`, projects this decision's contribution (`resolveIncrement`, default 1, clamped to ≥0 so a malformed resolver can never fabricate headroom), and FIRES when any configured horizon's `committed + increment > max` (the cap value itself is ALLOWED — strict greater-than, identical to `checkRateLimit`'s `count > max`). Deterministic precedence: horizons are evaluated in DECLARED array order (not snapshot key order), so the first-breaching window is replay-stable. Default `onExceeded` ⇒ REFUSE `cumulative_limit_exceeded`, basis `business/RULE_VIOLATED` (monotonicity §C). NO clock/RNG/IO/env — re-running it over the recorded snapshot reproduces a byte-identical decision (invariant #5). New exported types `VelocityHorizon`, `VelocityBreach`, `CumulativeVelocityGuardOptions`. The pre-existing `checkRateLimit`/`createRateLimitGuard` single-window semantics (`exceeded = count > args.max`, idempotent `rollback` closure, decrement-failure → `recordSinkFailure({ sink: "rate-limit" })`, OPTIONAL `decrement` no-op) are pinned unchanged.
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** harden the rollback `finally` seam — `deps.rateLimitRollback` runs for EVERY non-EXECUTE decision EVEN WHEN `sink.emit` throws (the throw path rethrows in `catch` after the `finally` fires; the success path returns normally). The guard reads `decision.kind !== 'EXECUTE' && deps.rateLimitRollback && !rewriteExecuted`, preserving the 011/T2 carve-out (a validated REWRITE that re-adjudicated to EXECUTE ran its bytes, so it does NOT roll back; a REWRITE that failed re-adjudication collapsed to REFUSE and rolls back like any non-EXECUTE). COEXISTS with the 013 kill-switch early-return rollback (its own try/finally), the 091 version-binding, the 033/052 snapshot recording, and the 011 REWRITE/ledger-release error path. §C/#6: a store/IO error on the write path aborts EXECUTE (the error propagates; the caller never receives a clean result hiding a failed audit write) and never fails OPEN.
  - **T3–T5 (read-only consumers, 052/053-owned substrate UNCHANGED):** 051 consumes 052's `core/kernel/guard-stats.ts` delta-write (`count:1`, anti-double-count — assert-6-not-9 regression kept) and `queryAsync` (store-direct, no memory union), the `audit-postgres/src/guard-stats-store.ts` additive `ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` + migration-006 PK arbiter, and re-affirms the `runtime/src/defer-park.ts` `INCR→EXPIRE→check→DECR` TOCTOU note + `evalIncrCheck` Lua seam as the canonical over-commit reference plan 053 inherits. None of those files are edited by 051.

  `intentHashInput`/`EXPECTED_ENVELOPE_KEYS`, the closed 6-outcome `Decision` algebra, and the pure `adjudicate()` decision path are UNCHANGED (purity/determinism/replay preserved; the aggregate snapshot rides injected state, never a hashed envelope field — invariant #4). New tests: the cumulative/velocity guard's boundary enforcement (under/at/over the cap), multi-horizon declared-order precedence, increment clamping, monotonicity (never EXECUTE), and replay-over-recorded-snapshot in `rate-limit.test.ts`; the guard wired end-to-end through `adjudicateAndAudit` (over-limit→REFUSE+rollback, under-limit→EXECUTE+no-rollback, exact boundary, and FAIL-CLOSED rollback-on-sink-throw for both over- and under-limit decisions) in `adjudicate-and-audit.test.ts`; and the exported guard surface locked in `api-surface.test.ts`. The live-PG additive-upsert integration gate (`pnpm -F @adjudicate/audit-postgres integration`) is the T4 durable exercise; it requires `PG_TEST_URL`/`DATABASE_URL` and is environment-gated.

- 79f47fe: feat(audit-postgres): 053 — durable, transactional reservation store with a single-statement over-commit guard, so a multi-horizon cumulative/velocity cap can be decremented (claimed) under concurrency WITHOUT over-commit. Per index §B/§D the reservation read/write is store IO that lives ONLY in the impure shell AFTER the pure kernel decision — it never enters `adjudicate()`. The reservation EXTENDS the durable additive guard-stats upsert template (NOT the ephemeral park `INCR→EXPIRE→check→DECR` counter, which has a documented TOCTOU over-commit race); over-cap fails CLOSED (§C monotonicity: a decrement may only RAISE friction, never silently over-commit) and a store/IO error on the write path aborts EXECUTE (§D-#6, it propagates rather than failing open). The pure kernel is UNTOUCHED; the rollback + EXECUTE-race-dedup seams are REUSED, not forked.
  - **`@adjudicate/audit-postgres` (`src/guard-stats-store.ts`) — the reservation store (T1/T2):** add `RESERVE_GUARD_STAT_SQL` and `createPostgresReservationStore`. The SQL extends the additive `ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id) DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count` template (same migration-006 PK arbiter — NO new migration) with TWO cap gates so over-commit fails closed in ONE statement: a fresh-key `SELECT $delta WHERE $delta <= $cap` source gate AND a conflict-path `WHERE table.count + EXCLUDED.count <= $cap` predicate on the `DO UPDATE`. An over-cap claim affects ZERO rows (`rowCount === 0` ⇒ REFUSE); a positive count ⇒ the units were reserved atomically. There is NO read-modify-write window — concurrent over-cap claims cannot both win (one updates/inserts, the other's `WHERE` matches zero rows). `reserve` also refuses a non-positive / non-finite delta LOCALLY (it would fabricate headroom, §C) and coerces the no-pack case to the 052 `''` PK sentinel (a NULL would 23502 or split the additive arbiter). `$delta`/`$cap` are cast to `bigint` so Postgres deduces a single consistent parameter type. The `ON CONFLICT` arbiter MUST be a real `UNIQUE`/`PK` exercised against a live DB (the migration-006 `42P10` lesson) — proven by the §6 integration test, not just an asserted SQL string.
  - **`@adjudicate/audit-postgres` (`src/pg-types.ts`, `src/index.ts`) — aligned row types + barrel (T2):** add `coerceBigIntCount` (string | number | bigint → safe-integer `number`, loud on precision loss) and route the shared `audit_guard_stats.count BIGINT` read-back through it from the guard-stats reader, so the reservation store and the guard-stats counter agree on the column shape. Surface `RESERVE_GUARD_STAT_SQL`, `createPostgresReservationStore`, `ReservationKey`, `ReservationOutcome`, `ReservationWriter`, and `CreatePostgresReservationStoreDeps` through the package barrel.
  - **`@adjudicate/runtime` (`src/defer-park.ts`) — durable-vs-ephemeral documentation (T6):** update the over-commit-race doc block to record that 053 DELIVERED the durable answer on the additive `ON CONFLICT` template (`RESERVE_GUARD_STAT_SQL`), contrasting it with this module's EPHEMERAL `INCR→EXPIRE→check→DECR` (Lua-`evalIncrCheck`-seamed) park counter; copying the park sequence into the durable reservation would re-introduce the over-commit race against the authoritative limit — 053 deliberately did not.
  - **`@adjudicate/core` — rollback + dedup wiring REUSED, not forked (T3/T4; tests only):** the `RateLimitResult.rollback` idempotent closure (`kernel/rate-limit.ts`), the `:616-631` non-EXECUTE rollback `finally` and the SET-NX EXECUTE-race dedup (`kernel/adjudicate-and-audit.ts`) are the existing 051/092 seams a refused reservation rides — no source change. Added `rate-limit.test.ts` assertions: a `decrement` FAILURE routes to `recordSinkFailure({ sink: "rate-limit" })` WITHOUT throwing, and that path stays idempotent. The pure kernel (`kernel/adjudicate.ts`) is byte-unchanged (replay-determinism + `test:invariants` green; ZERO `Date.now|Math.random|new Date|process.env` hits).
  - **`@adjudicate/audit` — ledger contract kept intact (T5; tests only):** `ledger.ts` / `ledger-redis.ts` (best-effort `DEL` release, 14-day default TTL) are unchanged so reservation claims do not orphan. Added `ledger.test.ts` assertions: `recordExecution` is first-writer-wins (`'acquired'` then `'exists'` for the same intentHash), `release` (when the client exposes `del`) clears an orphaned key so a retry re-acquires (namespaced key), and `release` is ABSENT when the client cannot DEL (the kernel takes its orphan-telemetry branch).

  §6 live-DB concurrency test (`audit-postgres/tests/integration.test.ts`, gated by `pnpm -F @adjudicate/audit-postgres integration`): exercises `RESERVE_GUARD_STAT_SQL` against the real migration-006 PK arbiter (no `42P10`), proving two concurrent over-cap decrements do not over-commit (one wins, one refuses), 200 concurrent single-unit claims converge on EXACTLY the cap, the fresh-key over-cap first claim inserts zero rows, and distinct packIds key independent caps. Validated against a live Postgres (docker `ibatexas` stack, migrations 001–010 applied): 18/18 integration tests pass.

  Rollback: `RateLimitStore.decrement` and `Ledger.release` are OPTIONAL and the change is additive + worktree-isolated on `feat/merged-053-reservation-store`; dropping the wiring degrades rollback to a no-op without changing the pure decision. Revert the branch to restore prior behavior.

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
  - @adjudicate/core@1.5.0

## 3.0.0

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/admin-sdk@3.0.0

## 2.0.1

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
- Updated dependencies [464db38]
- Updated dependencies [9f1e379]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/admin-sdk@3.0.0
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

- Updated dependencies [9e65871]
- Updated dependencies [e9fc3ad]
- Updated dependencies [36e7e76]
- Updated dependencies [36e7e76]
  - @adjudicate/admin-sdk@2.0.0
  - @adjudicate/core@1.2.0

## 1.0.0

### Major Changes

- 663b572: Audit-sink defaults flip to fail-closed, with durable spill and half-open NATS breaker. Resolves audit-completeness gaps (#23, #24, #25, #28, #43) — moves "audit reconstructability" from configuration property to enforced default.

  **Breaking** — adopters who relied on `multiSink`'s pre-T3 fail-open semantics rename to `multiSinkLossy`. Within the `0.1.0-experimental` semver window this is permitted; the upside is governance-grade audit out of the box.
  - **CHANGED: `multiSink` is now strict** (alias for `multiSinkStrict`). Awaits all sinks via `Promise.allSettled`, throws `AuditSinkError` if any sink rejected. Was: fail-open, swallowed all rejections. The strict semantics is the right default for the framework's "every decision is reconstructable" claim. `multiSinkStrict` remains as a named alias for adopters who already chose strict explicitly.
  - **NEW: `multiSinkLossy(...)`** — explicit fail-open fan-out. The pre-T3 `multiSink` behaviour. Use only when you have explicitly accepted that audit completeness is not load-bearing for the call site (definitely not financial, regulated, or kernel-enforced intent paths).
  - **NEW: sink-of-sinks observability** — `multiSink`/`multiSinkStrict`/`multiSinkLossy` call `recordSinkFailure({ subject: "multiSink[i]", errorClass, ... })` for each rejection synchronously, so a metrics breadcrumb is always recorded even when the throw is swallowed upstream by a lossy fan-out.
  - **NEW: `persistentBufferedSink({ inner, storage, capacity, onOverflow })`** — durable replay queue. In-memory queue up to `capacity`; capacity-driven evictions spill to `PersistentSpillStorage`; on inner recovery, the spill drains FIFO before in-memory. Records survive process restart. Pair with `multiSink` (strict) for governance-grade audit.
  - **NEW: `PersistentSpillStorage` interface** with `append`/`readAll`/`ack`. Adopter-supplied (filesystem JSONL, SQLite, S3 — deployment-specific). Reference `createInMemorySpillStorage()` ships for tests and lightweight adopters.
  - **CHANGED: `persistentBufferedSink.onOverflow` is REQUIRED** — silent loss is the failure mode this sink prevents. The original `bufferedSink` keeps `onOverflow` optional for back-compat.
  - **CHANGED: `NatsSink` half-open close** — after the `failureThreshold` trip, the breaker transitions to `open`. The next emit attempt becomes `half-open`: success → `closed` (counter resets); failure → `open` again with `NatsSinkError` thrown immediately. Pre-T3 reset the counter to 0 after trip, leaving a 9-failure blind spot under sustained outage. Now every emit during a sustained outage is loud.
  - **NEW: 7 unit tests** (`persistent-buffered-sink.test.ts`) covering FIFO drain, capacity eviction, restart recovery, and the 100-record acceptance scenario.
  - **NEW: 2 unit tests** (`sink-burst-failure.test.ts`) for the half-open state transitions.
  - **NEW: 3 unit tests** (`sink.test.ts`) for the new strict default + `multiSinkLossy` parity + sink-of-sinks observability.
  - ADR-102 documents the fail-closed-default rationale.

  **Migration:**
  - `multiSink(natsSink, postgresSink)` previously fail-open → still works but **now throws** on inner failure. Action: either (a) accept the new strict semantic (recommended) or (b) rename to `multiSinkLossy` to preserve the old behaviour.
  - Adopters using `multiSinkStrict` explicitly: no migration needed.
  - Adopters using `bufferedSink`: no migration needed; for governance-grade audit, switch to `persistentBufferedSink` with a real `PersistentSpillStorage` implementation.
  - `NatsSink` adopters: behaviour change is invisible during normal operation. During sustained outages, every emit now throws `NatsSinkError` (pre-T3, only every 10th).

### Minor Changes

- 663b572: Coordination integrity — atomic park, rate-limit rollback, defer-resume cycle cap, ledger race fix. Resolves #35, #36, #37, #38 (partial), #41, top-priority E + I.

  The framework's coordination primitives had three gaps. The kernel's load-bearing claim ("the same intent cannot side-effect twice") sat behind first-writer-wins on the ledger key, which two parallel `adjudicate()` callers could both pass before either recorded the SET-NX. The defer-resume cycle had no global cap on resume-park-resume oscillation. Rate-limit counters incremented on every request — including REFUSEd ones — letting hostile traffic exhaust legitimate users' budgets.
  - **NEW: `RateLimitResult.rollback()`** — return a rollback handle from `checkRateLimit`. When the kernel returns a non-EXECUTE Decision, the executor invokes `rollback` to decrement the counter. Idempotent (safe to call once or skip). No-op when the store does not implement `decrement`.
  - **NEW: `RateLimitStore.decrement?(key)`** — optional method on the store contract. `createInMemoryRateLimitStore` implements it (clamps to zero). Adopter Redis stores wire `DECR`.
  - **NEW: `AdjudicateAndAuditDeps.rateLimitRollback?: () => Promise<void>`** — when supplied, fires after sink emission iff the Decision was non-EXECUTE. Adopters compose with `checkRateLimit().rollback`.
  - **NEW: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** (T1 carryover, surfaced here too) — `adjudicateAndAudit` uses the tag to flip a racing EXECUTE to `ledger_replay_suppressed` when SET-NX collides, closing #37 (parallel callers cannot both side-effect).
  - **NEW: `DEFAULT_MAX_RESUME_CYCLES = 3`** + `ResumeDeferredIntentArgs.maxResumeCycles` — per-`intentHash` resume cycle counter prevents DEFER → resume → DEFER oscillation under a misbehaving signal source. Returns `{ resumed: false, reason: "cycle_cap_exceeded" }` past the cap. Set to `0` to disable; back-compat skip when `redis.incr` is not wired.
  - **NEW: `DeferRedis.incr?` and `DeferRedis.expire?`** — optional Redis methods used by the cycle cap. Old adopters whose client lacks `incr` see no behavioural change (cap silently disabled).
  - **NEW: `ParkRedis.evalIncrCheck?(counterKey, ttlSeconds, max)`** — optional atomic Lua-eval increment-and-check. When wired, `parkDeferredIntent` uses it instead of the INCR-then-check sequence, eliminating the small race window at quota − 1. Adopters whose Redis client exposes `eval` can supply this; the framework falls back to the non-atomic sequence (the existing behaviour) when omitted.
  - **CHANGED: `parkDeferredIntent` EXPIRE refresh.** The pre-T5 implementation set the counter TTL via `EXPIRE NX` — once, on first park. Now the TTL refreshes on every park (no NX flag), so the counter outlives the latest envelope, not the first one's. Resolves #36.
  - **NEW: `taintRank(taint)`** exported from `@adjudicate/core` — used internally by `withBasisAudit` REWRITE-taint regression check (T4 carryover).
  - **NEW: 3 unit tests** (`rate-limit.test.ts`) for `RateLimitResult.rollback` (decrement, idempotency, store-without-decrement no-op).
  - **NEW: 4 unit tests** (`defer-resume-cycle-cap.test.ts`) for default cap, custom cap, disabled cap, back-compat skip.

  **Migration:**
  - Adopters using `checkRateLimit`: `result.rollback` is additive — call it on non-EXECUTE outcomes to fix #41. Old call sites that ignore it continue to work (counter stays advanced).
  - Adopters using `parkDeferredIntent`: counter TTL behaviour changes — refreshes on every park. Implementations whose Redis `expire` rejects calls without the NX flag must accept the new signature (`expire(key, seconds, mode?)` — second arg now optional).
  - Adopters using `resumeDeferredIntent`: no migration needed; the cycle cap is opt-in via wiring `redis.incr`.

- 663b572: Distributed kill switch via polled Redis + IBX_KERNEL_ENFORCE typo guard. Resolves #15, #17, #40, top-priority C.

  The kernel's `setKillSwitch` writes a module-level singleton — a single process can revoke its own authority but nothing propagates across replicas. Multi-replica deployments had no path to halt the fleet without redeploying. T7 ships an opt-in distributed primitive that keeps the kernel's `adjudicate()` strictly synchronous (no async-everywhere) by polling a Redis key into the runtime context's in-process kill-switch.

  Independently, `IBX_KERNEL_ENFORCE`/`IBX_KERNEL_SHADOW` accepted any comma-separated string. A typo like `IBX_KERNEL_ENFORCE=order.confrim` silently left `order.confirm` on the legacy path — exactly the cutover hazard the staged rollout exists to prevent.
  - **NEW: `startDistributedKillSwitch({ redis, key, pollMs?, context?, logger? })`** in `@adjudicate/audit` — polls a Redis key on a `pollMs` cadence (default 1000ms). When the key carries `{active: boolean, reason: string}`, the value flows into `RuntimeContext.killSwitch.set(...)`. Within `pollMs * 2` of a remote write, every replica's `adjudicate()` returns `kill_switch_active`.
  - **NEW: handle methods `trip(reason)` / `clear()` / `stop()`** — convenience wrappers around `redis SET` plus a poller-stop. `stop()` is idempotent and synchronous post-call (timer cleared).
  - **NEW: poll error observability** — Redis GET errors and malformed payloads emit `recordSinkFailure({ subject: "distributed-kill-switch", errorClass: "redis_get" | "redis_payload" })`, plus an optional structured `logger.warn` callback.
  - **NEW: `validateEnforceConfig(knownIntents, env?, warn?)`** in `@adjudicate/core/kernel` — call once at boot. Compares every token in `IBX_KERNEL_SHADOW`/`IBX_KERNEL_ENFORCE` against the known-intent set (typically the union of every installed Pack's `intents`). Unknown tokens emit a `console.warn` plus `recordSinkFailure({ errorClass: "enforce_config_typo" })`. Returns `{ unknownShadow, unknownEnforce }` for further inspection. Wildcard `*` is honoured.
  - **NEW: 8 unit tests** (`distributed-kill-switch.test.ts`) covering apply-on-poll, key-absent no-op, transition handling, trip/clear convenience, redis-error and malformed-payload observability, stop semantics, optional logger.
  - **NEW: 5 unit tests** (`enforce-config.test.ts`) for `validateEnforceConfig` — clean config, shadow typos, enforce typos, wildcard, both-typos.

  **Migration:** opt-in throughout. Existing single-process deployments continue to work via the module-level kill switch; multi-replica deployments call `startDistributedKillSwitch()` at boot. ENFORCE typo detection is a new boot-time check; adopters with `IBX_KERNEL_ENFORCE=*` or no env var continue without change.

- 663b572: Kernel-side audit emission, ledger consult, metrics + learning unification via `adjudicateAndAudit`.

  The pure deterministic `adjudicate(envelope, state, policy) → Decision` was the only kernel entry point — production callers had to bolt on metrics, learning, and audit emission themselves, leaving the framework's "every decision is reconstructable" claim resting on adopter discipline. The new sibling closes that gap by composing the four side-effecting concerns at one call site.
  - **NEW: `adjudicateAndAudit(envelope, state, policy, deps)`** — async wrapper around the sync kernel. Consults the optional Execution Ledger (short-circuiting to a `ledger_replay_suppressed` REFUSE on a cache hit), runs the pure kernel, calls `recordDecision`/`recordRefusal`/`recordOutcome`, builds the `AuditRecord`, and emits it through the supplied `AuditSink`. Returns `{ decision, record, ledgerHit }`. Sink failures propagate; learning-sink failures are absorbed (telemetry never blocks).
  - **NEW: EXECUTE-race fix.** After `adjudicate()` returns EXECUTE, `adjudicateAndAudit` calls `ledger.recordExecution()` and flips the Decision to REPLAY_SUPPRESSED if the SET-NX returned `"exists"`. Two parallel callers can no longer both side-effect for the same `intentHash`.
  - **CHANGED: `Ledger.recordExecution` returns `Promise<"acquired" | "exists">`** instead of `Promise<void>`. Existing callers that ignored the void return type continue to work; the kernel uses the tag for the race fix above.
  - **MOVED: `Ledger`, `LedgerHit`, `LedgerRecordInput`, `LedgerRecordOutcome`, `AuditSink`** interfaces relocated to `@adjudicate/core` so the kernel can depend on them without inverting the package dependency. `@adjudicate/audit` re-exports them — adopter import paths are unchanged.
  - **NEW: `noopAuditSink()`** — no-op sink for entry points that need a sink-shaped value when audit is intentionally unwired (`adjudicateAndLearn` continues to work this way).
  - **NEW: kernel refusal code `ledger_replay_suppressed`** added to `KERNEL_REFUSAL_CODES` so `withBasisAudit` does not flag it as Pack drift.
  - **NEW: 14 unit tests** (`tests/kernel/adjudicate-and-audit.test.ts`) covering EXECUTE/REFUSE Decision passthrough, ledger hit short-circuit, ledger race, sink-strict propagation, learning-sink absorption, plan snapshot.
  - **NEW: 1 property test** (`tests/kernel/invariants/audit-emission.property.test.ts`, 1 000 runs) — every `adjudicateAndAudit` call emits exactly one AuditRecord whose decision matches the returned Decision.
  - ADR-101 documents the sync/async split rationale.

  **Migration:** `adjudicate()` is unchanged — replay/property tests/legacy callers continue to use it. Production paths should migrate to `adjudicateAndAudit({ sink, ledger? })`. `adjudicateAndLearn` is preserved (no behavior change).

- 663b572: Replay harness now classifies basis drift, not just `decision.kind` divergence.

  Before: `replay()` reported `report.matched === report.total` whenever every record's stored `decision.kind` matched the re-adjudicated kind. A Pack patch that renamed a refusal code, changed a basis category, or added a new pass-basis without changing the kind passed replay silently — exactly the governance-drift signal the framework's strongest claim depends on detecting.
  - **NEW: `ReplayMismatchKind` union** — `"DECISION_KIND" | "BASIS_DRIFT" | "REFUSAL_CODE_DRIFT"`. Reports route to different runbook severities.
  - **CHANGED: `ReplayMismatch` shape** gains `kind` and an optional `basisDelta: { missing, extra }` carrying the symmetric difference of the flat-set comparison. The previous `{ intentHash, expected, actual }` fields are preserved.
  - **Comparison rule (in this priority order):**
    1. Different `decision.kind` → `DECISION_KIND` mismatch.
    2. Same kind, different flat-set of `category:code` basis strings → `BASIS_DRIFT`.
    3. Both REFUSE, same kind + basis flat-set, different `refusal.code` → `REFUSAL_CODE_DRIFT`.
    4. Otherwise matched.
  - **Flat-set semantics:** order is ignored; `basis.detail` is ignored. Matches the `Postgres.intent_audit.decision_basis` shape (text[] of `category:code`).
  - **NEW: `classify(intentHash, expected, actual)`** — pure helper exported alongside `replay()` so adopters can write cross-record audits without re-implementing the rule.
  - **NEW: 11 unit tests** (`packages/audit/tests/replay.test.ts`) — basis order tolerance, basis.detail tolerance, missing-and-extra delta, BASIS_DRIFT precedence over REFUSAL_CODE_DRIFT, plus the acceptance test from the plan (5-record corpus with one swapped refusal code).
  - **NEW: 1 property test** (`packages/core/tests/kernel/invariants/replay-determinism.property.test.ts`, 5 000 runs) — replaying the same policy against any (taint × default × guard × payload) tuple produces a Decision that matches the stored one. The classifier rule is duplicated inline in the property test to avoid a package-graph cycle (audit → core).

  **Migration:** consumers that destructured `mismatches[i].expected/actual` continue to work. Consumers that switched on `mismatches[i].kind` get a richer signal: BASIS_DRIFT and REFUSAL_CODE_DRIFT are now distinguishable, and the `basisDelta.missing/extra` arrays surface the exact codes that drifted.

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
  - @adjudicate/admin-sdk@1.0.0
