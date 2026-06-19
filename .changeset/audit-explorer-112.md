---
"@adjudicate/admin-sdk": minor
"@adjudicate/audit-postgres": patch
"@adjudicate/adjudicant": minor
---

feat(admin-sdk,audit-postgres,adjudicant): 112 — Audit Explorer (integrity-on-read + tenantScope on by-hash) on the write-isolated Adjudicant observer plane.

Delivers the Audit Explorer surface of the §B/§G Inspector-General (OBSERVER) plane: a read-only browse / inspect / integrity / chain-verify view over the append-only audit chain. Per the authoritative human-gate override the explorer UI mounts into the NEW `apps/adjudicant` app (NOT `apps/console`); the substantive SDK/audit work is app-agnostic and implemented per the plan.

- **admin-sdk — tenantScope threading on the by-hash read seam (T2):** `audit.byHash`'s input gains an optional `tenantScope`, threaded through to `ctx.store.getByIntentHash(intentHash, tenantScope)` per the `AuditStore` contract. This closes the 111-residual `audit.byHash` cross-tenant isolation defect: the SDK previously called `getByIntentHash(intentHash)` with ONE argument, so the contract's host-enforced tenant-isolation slot was UNREACHABLE from the wire even for a tenant-aware host store. Single-tenant reference stores ignore it; a multi-tenant store MUST NOT return a cross-tenant record.
- **admin-sdk — integrity-on-read for the explorer DTO (T4):** new `audit.byHashVerified` `.query` returns the record ALONGSIDE its `verifyAuditRecord` verdict (the pure browser-safe verifier: auditHash + envelope-intentHash re-derivation + hash-bind signature). A tampered / forged record is STILL returned (forensics need the bytes) but carries `verified:false`, so the explorer renders a deny-by-default tamper badge rather than presenting it as authoritative (§C: a read only ADDS friction). It is additive — the existing `audit.byHash` is untouched (the console gateway keeps its bare-record shape), and NO mutation is added (the read-only explorer plane stays at zero mutations; the full router stays at 4).
- **audit-postgres — by-hash read accepts/ignores tenantScope (T3):** `createPostgresAuditStore`'s `getByIntentHash` gains the contract's optional `tenantScope` second arg. This single-tenant reference cold-store ignores it (no tenant column) and does NOT widen the query (no `$2`, no tenant predicate); the arg keeps the signature contract-compatible so the SDK seam never silently drops the scope. `InvalidCursorError → BAD_REQUEST` duck-typing is untouched.
- **adjudicant — Audit Explorer surface (T5/T6 re-targeted):** a new `/audit` route + `AuditExplorer` (six-outcome decision-filtered browse, per-row `IntegrityBadge`, `ChainVerifyStatus`), a `useAuditRecord` hook over `audit.byHashVerified`, and a by-hash inspect panel. All pure READS on the read-only tRPC client (typed against `ReadOnlyAdminRouter`): the only procedures reachable are `.query`. LIVE single-record replay (`replay.run`, a mutation) is intentionally ABSENT on this OBSERVER plane — it is an OPERATOR action on the console.

T1 (the `replayWithIntegrity` `AUDIT_HASH_TAMPERED` double-count/mislabel fix) and its isolated forged-envelope test already landed in 111 — verified NO-OP here, not re-applied.

Invariants preserved: the pure `adjudicate()` path, the `intentHash` recipe, and the closed 6-outcome `Decision` algebra are UNTOUCHED. No mutation/write surface is added to the read-only explorer plane; integrity-on-read and chain-verify only surface verdicts the pure verifiers already produce (§C/§D — the observer can only add friction, never weaken or authorize).
