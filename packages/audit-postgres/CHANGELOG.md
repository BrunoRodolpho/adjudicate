# @adjudicate/audit-postgres

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
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
- Updated dependencies [663b572]
  - @adjudicate/audit@1.0.0
  - @adjudicate/core@1.0.0
