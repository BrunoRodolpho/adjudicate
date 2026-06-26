# @adjudicate/console

## 0.1.7

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/adapter-core@0.4.1
  - @adjudicate/admin-sdk@5.0.0
  - @adjudicate/analyze@0.4.3
  - @adjudicate/approval-engine@0.3.1
  - @adjudicate/audit@5.0.0
  - @adjudicate/audit-postgres@5.0.0
  - @adjudicate/conformance@4.0.0
  - @adjudicate/drift@0.2.3
  - @adjudicate/observability@4.0.0
  - @adjudicate/pack-access-governance@0.3.1
  - @adjudicate/pack-deployments-approval@0.4.1
  - @adjudicate/pack-identity-kyc@0.3.1
  - @adjudicate/pack-incident-response@0.3.1
  - @adjudicate/pack-payments-pix@0.3.1
  - @adjudicate/red-team@0.3.1

## 0.1.6

### Patch Changes

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

- b77f6b0: feat(core,audit,audit-postgres,admin-sdk): 092 — pluggable `AuditSigner` + verify-on-read. Wire a real cryptographic `signature` over each audit record's `auditHash` (replacing the never-populated keyless stub) and verify records on the cold-store READ path so tampered/forged rows are FLAGGED rather than rendered as authoritative. Signing and verification live entirely in the impure shell AFTER the pure decision (§D: "the kernel decides; the shell signs and persists") — the pure `adjudicate()` is byte-unchanged and never signs. The `signature` stays EXCLUDED from the `auditHash` pre-image, so post-hoc signing never invalidates tamper-evidence; verify-on-read only ADDS friction (§C), never authorizes.
  - **T1 (`core/audit.ts`):** add the `AuditSignature` type, the pluggable `AuditSigner` interface (`{ keyId; sign(auditHash) }`), the browser-safe pure-JS hash-bind signer (`hashBindAuditSigner` / `bindAuditSignature` / `auditSignaturePreimage`, `alg: "sha256-hashbind"`, mirroring `bindCapability`), and the `AUDIT_HASHBIND_ALG` / `AUDIT_SIGNATURE_PREIMAGE_VERSION` constants. `buildAuditRecord` gains an optional `signer` on `BuildAuditInput`: it computes `auditHash` FIRST, then attaches `signer.sign(auditHash)` — a THROWING signer propagates (FAIL-CLOSED, §D inv. 6). `verifyAuditRecord` gains a new `{ verified:false, reason:"invalid_signature", keyId, alg }` outcome layered ON TOP of the four-way union: the hash-bind leg is verified pure-JS in core; an optional `VerifyAuditRecordOptions.verifySignature` hook lets a node caller verify asymmetric (ed25519) signatures. Core stays browser-bundleable: no `node:crypto`, no `Buffer`. An ABSENT signature stays a valid, tamper-evident-only record (the OSS contract).
  - **T2 (`core/kernel/adjudicate-and-audit.ts`):** thread `signer` through `AdjudicateAndAuditDeps` and populate `record.signature` at BOTH `buildAuditRecord` call sites — the kill-switch early-return REFUSE AND the main (incl. 011 REWRITE-executed) site. A signer error FAILS CLOSED: it propagates out of `buildAuditRecord` BEFORE `sink.emit`, so no unsigned record is ever emitted when a signer was configured (friction, never bypass). Coexists with 011/013/091/052/033 conditional-spread fields; all wall-clock reads still route through `deps.clock ?? defaultClock`.
  - **T3 (`audit/src/replay-integrity.ts`):** map the new signature verdict — `IntegrityFailure.kind` gains `AUDIT_SIGNATURE_INVALID` (distinct from `AUDIT_HASH_TAMPERED`) so an operator can tell "the bytes were modified" from "the bytes are intact but the signature is not authentic"; the existing tamper/intent-mismatch axes are unchanged.
  - **T4 (`audit-postgres/src/audit-store.ts`):** VERIFY-ON-READ on the cold-store read path. `query` runs `verifyAuditRecord` over every returned row and populates the new `AuditQueryResult.verifications` array (index-aligned with `records`; pure / no-I/O so cost is bounded per row). `getByIntentHash` verifies the single row and attaches the verdict via a non-enumerable Symbol slot (`readVerificationSlot`) so the `AuditStore` contract and serialized shape are unchanged. A forged/tampered row is FLAGGED, never dropped (forensics keep the bytes) and never silently authoritative. Reuses the existing `signature`/`audit_hash` rehydration in `replay.ts` (no migration — the columns already exist).
  - **T5 (`admin-sdk`):** add `AuditRecordVerificationSchema` (mirrors the core verdict union) and an OPTIONAL `verifications` array on `AuditQueryResultSchema`; `createAuditQueryHandler` passes the store's verdicts through UNCHANGED (the InvalidCursorError → BAD_REQUEST mapping is preserved). A store that does not verify on read simply omits the field.
  - **T6 (`apps/console`):** new `withVerifyOnRead` store decorator (idempotent — it fills in verdicts only when the inner store omitted them) wraps the route's audit store so the admin Explorer's `audit.query` response carries per-record tamper/signature status in BOTH Postgres and in-memory modes.

  The closed 6-outcome `Decision` algebra, the guard order, and `intentHashInput` are UNCHANGED. Monotonicity (§C) holds: verify-on-read surfaces tamper/forgery — it never weakens a decision or authorizes EXECUTE.

- Updated dependencies [58cad7a]
- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [9928601]
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
- Updated dependencies [5310f7d]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [5f37c7c]
- Updated dependencies [cb8d608]
- Updated dependencies [41a295e]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [137c533]
- Updated dependencies [5dfa0e5]
- Updated dependencies [21a7895]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [94560c7]
- Updated dependencies [9ca6e7c]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [b78860b]
- Updated dependencies [53a0780]
- Updated dependencies [f7fa8d5]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [eab3701]
- Updated dependencies [3f4bbbc]
- Updated dependencies [94ddc76]
  - @adjudicate/admin-sdk@4.0.0
  - @adjudicate/audit@4.0.0
  - @adjudicate/core@1.5.0
  - @adjudicate/audit-postgres@4.0.0
  - @adjudicate/conformance@3.0.0
  - @adjudicate/red-team@0.3.0
  - @adjudicate/adapter-core@0.4.0
  - @adjudicate/pack-payments-pix@0.3.0
  - @adjudicate/pack-incident-response@0.3.0
  - @adjudicate/pack-access-governance@0.3.0
  - @adjudicate/approval-engine@0.3.0
  - @adjudicate/pack-identity-kyc@0.3.0
  - @adjudicate/pack-deployments-approval@0.4.0
  - @adjudicate/analyze@0.4.2
  - @adjudicate/drift@0.2.2
  - @adjudicate/observability@3.0.0

## 0.1.5

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/adapter-core@0.3.2
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/analyze@0.4.1
  - @adjudicate/approval-engine@0.2.2
  - @adjudicate/audit@3.0.0
  - @adjudicate/audit-postgres@3.0.0
  - @adjudicate/conformance@2.0.0
  - @adjudicate/drift@0.2.1
  - @adjudicate/observability@2.0.0
  - @adjudicate/pack-access-governance@0.2.1
  - @adjudicate/pack-deployments-approval@0.3.1
  - @adjudicate/pack-identity-kyc@0.2.2
  - @adjudicate/pack-incident-response@0.2.1
  - @adjudicate/pack-payments-pix@0.2.2
  - @adjudicate/red-team@0.2.1

## 0.1.4

### Patch Changes

- Updated dependencies [22d1de5]
  - @adjudicate/observability@1.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [b94372b]
  - @adjudicate/analyze@0.4.0
  - @adjudicate/admin-sdk@2.2.0
  - @adjudicate/audit@3.0.0
  - @adjudicate/audit-postgres@3.0.0
  - @adjudicate/pack-identity-kyc@0.2.1
  - @adjudicate/adapter-core@0.3.1
  - @adjudicate/approval-engine@0.2.1

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
- Updated dependencies [2ca4532]
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [9f1e379]
- Updated dependencies [1f091ef]
- Updated dependencies [75e85df]
- Updated dependencies [b642424]
- Updated dependencies [804af8f]
- Updated dependencies [1e0058b]
- Updated dependencies [6b291be]
  - @adjudicate/adapter-core@0.3.0
  - @adjudicate/admin-sdk@3.0.0
  - @adjudicate/conformance@2.0.0
  - @adjudicate/approval-engine@0.2.0
  - @adjudicate/audit-postgres@3.0.0
  - @adjudicate/core@1.3.0
  - @adjudicate/pack-deployments-approval@0.3.0
  - @adjudicate/drift@0.2.0
  - @adjudicate/observability@2.0.0
  - @adjudicate/pack-incident-response@0.1.0
  - @adjudicate/pack-access-governance@0.1.0
  - @adjudicate/red-team@0.2.0
  - @adjudicate/analyze@0.3.0
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
  - @adjudicate/audit-postgres@2.0.0
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
  - @adjudicate/audit-postgres@1.0.0
  - @adjudicate/pack-deployments-approval@0.1.0
