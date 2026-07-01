# @adjudicate/runtime

## 0.3.3

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0

## 0.3.2

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0

## 0.3.1

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0

## 0.3.0

### Minor Changes

- e81b801: feat(core): 023 — resource-binding verifier (`verifyResourceBinding`, `ResourceBindingPolicy`, `ResourceBindingResult`, `DEFAULT_RESOURCE_BINDING_POLICY`) in `envelope.ts`. Re-derives the envelope's `intentHash` via the UNTOUCHED `intentHashInput` recipe (`deriveIntentHash`) and constant-time-compares it against the carried hash with `timingSafeHexEqual` — the executor must honor ONLY the kernel-bound (signed) payload. A `payload` / `resourceRefs` (031) swapped AFTER the kernel decision re-derives a DIFFERENT hash and fail-closes (anti-IDOR / anti-resource-swap; invariants #1, #4, #6). The `intentHashInput`/`buildEnvelope`/`deriveIntentHash` bodies are BYTE-IDENTICAL (additive-only file change), so every existing envelope hash, golden vector, and replay corpus is unchanged (invariant #5). No `node:crypto`, no `Buffer` — core stays browser-bundleable (pure-JS canonical fence). The passive `AuditRecord.signature` slot stays PASSIVE — 023 is a hash fence only; the AuditSigner is plan 092. The bound envelope inputs are already recorded on the AuditRecord for replay.

  feat(adapter-core): 023 — enforce the resource binding at the executor seam (`runExecute`, `decisions.ts`) before `invokeIntent`, threaded via a new `resourceBindingPolicy` option (default `"strict"`). The check SUBSUMES the 011/T4 forged-REWRITE re-verify AND EXTENDS the same fence to the EXECUTE payload, so a post-decision resource-swap can never reach the executor (invariant #1). Coexists with 012 (reads serve via `invokeRead`, never reach this gate) and 013 (the kernel crossing that produced the Decision already emitted the required AuditRecord) — none weakened. `"warn"` still fail-closes a mismatch (friction never decreases, §C); `"off"` is the documented rollback dial restoring the exact pre-023 seam. Re-exports `verifyResourceBinding` from the barrel so the seam pins ONE recipe. The `AdopterExecutor.invokeIntent` contract now documents that it receives only the kernel-bound payload.

  feat(runtime): 023 — re-export `verifyResourceBinding` / `ResourceBindingPolicy` and a T4 cross-drift note pinning that the resource-binding pre-image equals the parked-envelope verifier's pre-image (`verifyParkedEnvelopeHash`) — the SAME canonical recipe + comparator, so the executor-seam binding and the resume-time park check cannot disagree (no drift; invariants #4/#5).

  feat(adjutant): 023 — `assertResourceBound` fence at the orchestrator's direct `invokeIntent` seam (it has no `runExecute`): re-derive + constant-time-compare the envelope's `intentHash` before the side effect in both `handle` (EXECUTE) and `resolve` (confirmation EXECUTE), so a swapped/forged proposal envelope fail-closes before the executor (anti-IDOR).

  feat(pack-\*): 023 — document the bound-payload contract on the three shipped packs' `capabilities.ts` (pix / incident-response / access-governance): an LLM-proposable intent reaches the adopter's executor ONLY through a binding-enforced seam, so the executor honors only the exact kernel-adjudicated `payload` / `resourceRefs`.

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

- 86abd1a: feat(core): 051 — deterministic cumulative/velocity (rate-limit) guard family + fail-closed rate-limit rollback seam. Per index §C/§D the multi-horizon limit guard is a PURE business-layer predicate: it reads the IMMUTABLE aggregate/limit snapshot that 052 INJECTS into the one kernel decision (read-only `state`/deps) and, on breach, can only RAISE friction (REFUSE/ESCALATE/DEFER) — it never lowers a ceiling, never authorizes EXECUTE. 052 OWNS the aggregate-counting substrate (the `GuardFireStats` delta-write + the additive Postgres upsert + migration-006 PK arbiter); 051 CONSUMES it READ-ONLY and adds the velocity/cumulative GUARD family that reads the coalesced counts, plus hardens the load-bearing rate-limit rollback so a non-EXECUTE decision never poisons a legitimate user's counter.
  - **T1 (`core/kernel/rate-limit.ts`):** new `createCumulativeVelocityGuard(...)` — a synchronous, PURE multi-horizon guard. It reads the injected `AggregateSnapshot` (the 052 `windows` map keyed by an opaque `(resource, horizon)` string) via `resolveSnapshot`, projects this decision's contribution (`resolveIncrement`, default 1, clamped to ≥0 so a malformed resolver can never fabricate headroom), and FIRES when any configured horizon's `committed + increment > max` (the cap value itself is ALLOWED — strict greater-than, identical to `checkRateLimit`'s `count > max`). Deterministic precedence: horizons are evaluated in DECLARED array order (not snapshot key order), so the first-breaching window is replay-stable. Default `onExceeded` ⇒ REFUSE `cumulative_limit_exceeded`, basis `business/RULE_VIOLATED` (monotonicity §C). NO clock/RNG/IO/env — re-running it over the recorded snapshot reproduces a byte-identical decision (invariant #5). New exported types `VelocityHorizon`, `VelocityBreach`, `CumulativeVelocityGuardOptions`. The pre-existing `checkRateLimit`/`createRateLimitGuard` single-window semantics (`exceeded = count > args.max`, idempotent `rollback` closure, decrement-failure → `recordSinkFailure({ sink: "rate-limit" })`, OPTIONAL `decrement` no-op) are pinned unchanged.
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** harden the rollback `finally` seam — `deps.rateLimitRollback` runs for EVERY non-EXECUTE decision EVEN WHEN `sink.emit` throws (the throw path rethrows in `catch` after the `finally` fires; the success path returns normally). The guard reads `decision.kind !== 'EXECUTE' && deps.rateLimitRollback && !rewriteExecuted`, preserving the 011/T2 carve-out (a validated REWRITE that re-adjudicated to EXECUTE ran its bytes, so it does NOT roll back; a REWRITE that failed re-adjudication collapsed to REFUSE and rolls back like any non-EXECUTE). COEXISTS with the 013 kill-switch early-return rollback (its own try/finally), the 091 version-binding, the 033/052 snapshot recording, and the 011 REWRITE/ledger-release error path. §C/#6: a store/IO error on the write path aborts EXECUTE (the error propagates; the caller never receives a clean result hiding a failed audit write) and never fails OPEN.
  - **T3–T5 (read-only consumers, 052/053-owned substrate UNCHANGED):** 051 consumes 052's `core/kernel/guard-stats.ts` delta-write (`count:1`, anti-double-count — assert-6-not-9 regression kept) and `queryAsync` (store-direct, no memory union), the `audit-postgres/src/guard-stats-store.ts` additive `ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` + migration-006 PK arbiter, and re-affirms the `runtime/src/defer-park.ts` `INCR→EXPIRE→check→DECR` TOCTOU note + `evalIncrCheck` Lua seam as the canonical over-commit reference plan 053 inherits. None of those files are edited by 051.

  `intentHashInput`/`EXPECTED_ENVELOPE_KEYS`, the closed 6-outcome `Decision` algebra, and the pure `adjudicate()` decision path are UNCHANGED (purity/determinism/replay preserved; the aggregate snapshot rides injected state, never a hashed envelope field — invariant #4). New tests: the cumulative/velocity guard's boundary enforcement (under/at/over the cap), multi-horizon declared-order precedence, increment clamping, monotonicity (never EXECUTE), and replay-over-recorded-snapshot in `rate-limit.test.ts`; the guard wired end-to-end through `adjudicateAndAudit` (over-limit→REFUSE+rollback, under-limit→EXECUTE+no-rollback, exact boundary, and FAIL-CLOSED rollback-on-sink-throw for both over- and under-limit decisions) in `adjudicate-and-audit.test.ts`; and the exported guard surface locked in `api-surface.test.ts`. The live-PG additive-upsert integration gate (`pnpm -F @adjudicate/audit-postgres integration`) is the T4 durable exercise; it requires `PG_TEST_URL`/`DATABASE_URL` and is environment-gated.

- 41a295e: fix(runtime): H2 — `verifyParkedEnvelopeHash` (`defer-resume.ts`) re-derived the parked-envelope `intentHash` over `{version,kind,payload,nonce,actor,taint,origin}` while OMITTING `resourceRefs` — even though `buildEnvelope`/`deriveIntentHash` (`@adjudicate/core` `intentHashInput`) BIND `resourceRefs` (031) into the hash. So a resource-bound DEFER resume (the canonical pack-payments-pix charge-awaiting-webhook flow) re-derived a DIFFERENT hash → `{verified:false, reason:"tampered"}` → `park_blob_tampered` under the default strict policy, REFUSING a legitimate resume. Fix: pass `resourceRefs: e.resourceRefs` UNCONDITIONALLY into the verifier's `sha256Canonical({...})` — it is canonical-drop-safe, so a no-resource-refs blob (`undefined`) is omitted by `canonicalize` and its derived hash stays BYTE-IDENTICAL (NO golden-vector / replay-corpus regression; `@adjudicate/core` canonical encoder unchanged). Adds `readonly resourceRefs?: ResourceRefs` to `ParkedEnvelope.envelope` and `ParkDeferredIntentArgs.envelope`. Corrects the false comments in `defer-resume.ts` and `index.ts` that claimed the two recipes were already "the SAME … cannot disagree". Still fail-closed and §C-monotonic: a genuine tamper (changed payload / resourceRefs vs stored hash) still re-derives a mismatch and refuses.

  fix(adapter-core): H2 — forward `resourceRefs: ctx.envelope.resourceRefs` from the DEFER park caller (`decisions.ts` `runDeferDecision`) into `parkDeferredIntent`, so a resource-bound parked blob carries the field the resume-side verifier now re-derives over. Unconditional and drop-safe — a no-resource-refs envelope parks it as `undefined` (omitted), unchanged behavior.

- 6e18f2c: docs(security,architecture): 121 — fix the docs-that-lie so the prose contracts match the as-built kernel (REWRITE, R2/policyVersion, E3/DEFER resume, the dangling §9.5 anchors, the stale ADR index).

  Six documentation passages asserted behaviors the code does not (or no longer) implements, plus two dangling cross-references and one stale ADR-index range. This is a documentation-correctness pass over existing files — NO kernel, executor, or audit code is touched, and every constitutional invariant (§C monotonicity, §D kernel-purity, the closed 6-outcome Decision algebra, the `state→taint→auth→business→default` guard order, the `intentHash` recipe) is preserved by construction. The §5 gates run the unchanged test suites to confirm the rewritten references no longer contradict a green tree.
  - **REWRITE (T1, `AI_CONTEXT.md`).** The flow-diagram line read "REWRITE → re-adjudicate the sanitized envelope". As-built today (plan 011 landed): the kernel re-runs the FULL guard order on the rewritten envelope (a single bounded second pass, intentHash re-derived fail-closed) and only flows the rewritten bytes to the executor on a second-pass EXECUTE; otherwise the second-pass decision stands and the rewrite never executes. Line rewritten to that two-stage truth (grounded in `packages/core/src/kernel/adjudicate-and-audit.ts` step 2b and `packages/adapter-core/src/decisions.ts`). Pinned by `adapter-core/tests/decisions.test.ts` (REWRITE → executor runs the rewritten bytes) — left UNCHANGED.
  - **R2 / pack drift at replay (T2, `docs/security/threat-model.md`).** R2, the cross-cutting replay-determinism note, and the mitigation matrix asserted `policyVersion` as an unconditional replay join key. As-built today (plan 091 landed): `buildAuditRecord` and BOTH `adjudicateAndAudit` call sites (kill-switch + main) thread `policyVersion` / `kernelVersion` onto the record ONLY when the host supplies `deps.policyVersion` / `deps.kernelVersion` (`packages/core/src/audit.ts` emits each field only when defined). Rewritten to state the binding is host-conditional, not unconditional; matrix status changed from "Mitigated" to "Mitigated when host supplies `policyVersion`".
  - **E3 / resume taint floor (T3, `docs/security/threat-model.md`).** E3 claimed a blanket "resume cannot upgrade effective taint without going through `canPropose()`". FALSE as a blanket: the DEFER `resume()` path builds a FRESH envelope with `actor.principal:"system"` / `taint:"TRUSTED"` (`packages/adapter-core/src/loop.ts`), an INTENTIONAL elevation, while the CONFIRMATION `confirm()` path and the approval-engine `resolve()` path (which routes into `confirm()`, `packages/approval-engine/src/engine.ts`) DO preserve the original taint. Rewritten to scope the guarantee to the taint-preserving paths and document the DEFER elevation explicitly (with the runtime `defer-resume.ts` constructing no envelope, and SoD controls tracked under ADR-143). Pinned by `adapter-core/tests/resume.test.ts` (resume yields `principal==='system'`, `taint==='TRUSTED'`, differing `intentHash`) — left UNCHANGED.
  - **Dangling `§9.5` anchors (T4/T5, `docs/security/threat-model.md` + `docs/security/security-review-checklist.md`).** Both cited a non-existent `docs/concepts.md §9.5`; the guard-ordering closed-enum invariant actually lives under `## 9` at the stable heading "Invariant to preserve through any refactor" (the `GuardPhase` closed enum). Both references re-pointed to bare §9 + the stable heading text (per §7 risk mitigation, not a numbered subsection). `grep -rn "§9.5" docs/` now returns zero.
  - **Stale ADR-index range (T6, `docs/architecture/decisions.md`).** The index line claimed the directory runs `ADR-101..ADR-136`; it actually runs `ADR-101..ADR-143` (highest `ADR-143-approval-engine-governance.md`). Range corrected; the §4 representative-ADR table (through ADR-116) is NOT a lie and was left untouched.

- 7832b4c: docs(architecture,security): 122 — ADR scaffold + index, Status backfill, ADR-144, SECURITY.md reconciliation.

  Documentation-only Layer-12 plan that finishes the doc-truth pass plan 121 began. NO kernel, executor, or audit code path is touched; every constitutional invariant (closed 6-outcome Decision algebra, `state→taint→auth→business→default` guard order, §C monotonicity, fail-closed default, kernel purity, the ADR-104 `intentHash` recipe) is preserved by construction. The §5 gates run the unchanged suites that PIN the documented behavior (`decisions.test.ts`, `resume.test.ts`, `guard-order.test.ts`) so the prose cannot silently outlive the code it describes.
  - **ADR scaffold (T6, `docs/architecture/adr/README.md`).** The directory previously had no template / README / index (grep `template|readme|0000|index` returned zero). Added a README carrying the purpose, numbering rules, the canonical `ADR-143` header template (`# ADR-NNN — <title>` + `Status`/`Date`/`Scope`/`Supersedes`/`Related` bullets + `## Context`/`## Decision`/`## Why this shape`), the constitutional-invariant guardrails an ADR may not contradict, and the authoritative full index (ADR-101..ADR-144, all Accepted).
  - **Status-line backfill (T6).** Normalized the 9 ADRs whose `Status` deviated from the de-facto `ADR-143` bullet shape — ADR-105..ADR-112 (were `**Status**: Accepted (date)`) and ADR-116 (was a `## Status` heading) — to the canonical `- **Status:** … / - **Date:** … / - **Related:** …` block, preserving each ADR's existing status value, date, supersedes, and related links verbatim (the M1/M2/M3 execution notes folded into the Date bullet; ADR-116 carried no explicit date so it states the v1.0-RC milestone honestly).
  - **ADR-144 (T6, new, `docs/architecture/adr/ADR-144-doc-truth-reconciliation.md`).** New Accepted ADR recording the documentation-as-truth reconciliation discipline that plans 121/122 established: docs follow code, anchored to `file:line` citations, gated by the suites that pin the documented behavior; the six concrete drifts that were corrected (REWRITE re-adjudication, R2/`policyVersion` host-conditional binding, E3/DEFER-resume taint elevation, the dangling §9.5 anchors, the stale ADR range, the missing scaffold) are catalogued with their code anchors. Prose-only; preserves all invariants.
  - **ADR index range (T5, `docs/architecture/decisions.md`).** The §4 authoritative-range line, corrected by 121 to ADR-101..ADR-143, is advanced to ADR-101..ADR-144 (new highest `ADR-144-doc-truth-reconciliation.md`); a pointer to `adr/README.md` and rows for ADR-143/ADR-144 added to the representative table. The "ADR-101..ADR-136" stale range remains absent.
  - **SECURITY.md reconciliation (T6).** The coarse "In scope" list is reconciled with the as-built threat model: added the monotonicity/fail-closed ceiling, the taint-short-circuit guard order, the `auditHash` chain + host-conditional `policyVersion`/`kernelVersion` binding (matching threat-model R2), and the authority-guard IDOR caveat (real closure needs a host-injected authenticated principal), with pointers to `docs/security/threat-model.md`, `decisions.md §5`, and the ADR index. No overstated guarantee.

- 79f47fe: feat(audit-postgres): 053 — durable, transactional reservation store with a single-statement over-commit guard, so a multi-horizon cumulative/velocity cap can be decremented (claimed) under concurrency WITHOUT over-commit. Per index §B/§D the reservation read/write is store IO that lives ONLY in the impure shell AFTER the pure kernel decision — it never enters `adjudicate()`. The reservation EXTENDS the durable additive guard-stats upsert template (NOT the ephemeral park `INCR→EXPIRE→check→DECR` counter, which has a documented TOCTOU over-commit race); over-cap fails CLOSED (§C monotonicity: a decrement may only RAISE friction, never silently over-commit) and a store/IO error on the write path aborts EXECUTE (§D-#6, it propagates rather than failing open). The pure kernel is UNTOUCHED; the rollback + EXECUTE-race-dedup seams are REUSED, not forked.
  - **`@adjudicate/audit-postgres` (`src/guard-stats-store.ts`) — the reservation store (T1/T2):** add `RESERVE_GUARD_STAT_SQL` and `createPostgresReservationStore`. The SQL extends the additive `ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id) DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count` template (same migration-006 PK arbiter — NO new migration) with TWO cap gates so over-commit fails closed in ONE statement: a fresh-key `SELECT $delta WHERE $delta <= $cap` source gate AND a conflict-path `WHERE table.count + EXCLUDED.count <= $cap` predicate on the `DO UPDATE`. An over-cap claim affects ZERO rows (`rowCount === 0` ⇒ REFUSE); a positive count ⇒ the units were reserved atomically. There is NO read-modify-write window — concurrent over-cap claims cannot both win (one updates/inserts, the other's `WHERE` matches zero rows). `reserve` also refuses a non-positive / non-finite delta LOCALLY (it would fabricate headroom, §C) and coerces the no-pack case to the 052 `''` PK sentinel (a NULL would 23502 or split the additive arbiter). `$delta`/`$cap` are cast to `bigint` so Postgres deduces a single consistent parameter type. The `ON CONFLICT` arbiter MUST be a real `UNIQUE`/`PK` exercised against a live DB (the migration-006 `42P10` lesson) — proven by the §6 integration test, not just an asserted SQL string.
  - **`@adjudicate/audit-postgres` (`src/pg-types.ts`, `src/index.ts`) — aligned row types + barrel (T2):** add `coerceBigIntCount` (string | number | bigint → safe-integer `number`, loud on precision loss) and route the shared `audit_guard_stats.count BIGINT` read-back through it from the guard-stats reader, so the reservation store and the guard-stats counter agree on the column shape. Surface `RESERVE_GUARD_STAT_SQL`, `createPostgresReservationStore`, `ReservationKey`, `ReservationOutcome`, `ReservationWriter`, and `CreatePostgresReservationStoreDeps` through the package barrel.
  - **`@adjudicate/runtime` (`src/defer-park.ts`) — durable-vs-ephemeral documentation (T6):** update the over-commit-race doc block to record that 053 DELIVERED the durable answer on the additive `ON CONFLICT` template (`RESERVE_GUARD_STAT_SQL`), contrasting it with this module's EPHEMERAL `INCR→EXPIRE→check→DECR` (Lua-`evalIncrCheck`-seamed) park counter; copying the park sequence into the durable reservation would re-introduce the over-commit race against the authoritative limit — 053 deliberately did not.
  - **`@adjudicate/core` — rollback + dedup wiring REUSED, not forked (T3/T4; tests only):** the `RateLimitResult.rollback` idempotent closure (`kernel/rate-limit.ts`), the `:616-631` non-EXECUTE rollback `finally` and the SET-NX EXECUTE-race dedup (`kernel/adjudicate-and-audit.ts`) are the existing 051/092 seams a refused reservation rides — no source change. Added `rate-limit.test.ts` assertions: a `decrement` FAILURE routes to `recordSinkFailure({ sink: "rate-limit" })` WITHOUT throwing, and that path stays idempotent. The pure kernel (`kernel/adjudicate.ts`) is byte-unchanged (replay-determinism + `test:invariants` green; ZERO `Date.now|Math.random|new Date|process.env` hits).
  - **`@adjudicate/audit` — ledger contract kept intact (T5; tests only):** `ledger.ts` / `ledger-redis.ts` (best-effort `DEL` release, 14-day default TTL) are unchanged so reservation claims do not orphan. Added `ledger.test.ts` assertions: `recordExecution` is first-writer-wins (`'acquired'` then `'exists'` for the same intentHash), `release` (when the client exposes `del`) clears an orphaned key so a retry re-acquires (namespaced key), and `release` is ABSENT when the client cannot DEL (the kernel takes its orphan-telemetry branch).

  §6 live-DB concurrency test (`audit-postgres/tests/integration.test.ts`, gated by `pnpm -F @adjudicate/audit-postgres integration`): exercises `RESERVE_GUARD_STAT_SQL` against the real migration-006 PK arbiter (no `42P10`), proving two concurrent over-cap decrements do not over-commit (one wins, one refuses), 200 concurrent single-unit claims converge on EXACTLY the cap, the fresh-key over-cap first claim inserts zero rows, and distinct packIds key independent caps. Validated against a live Postgres (docker `ibatexas` stack, migrations 001–010 applied): 18/18 integration tests pass.

  Rollback: `RateLimitStore.decrement` and `Ledger.release` are OPTIONAL and the change is additive + worktree-isolated on `feat/merged-053-reservation-store`; dropping the wiring degrades rollback to a no-op without changing the pure decision. Revert the branch to restore prior behavior.

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

## 0.2.2

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 0.2.1

### Patch Changes

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
