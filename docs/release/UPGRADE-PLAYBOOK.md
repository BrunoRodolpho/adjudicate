# Upgrade Playbook — `v0.5 → v0.6 → v0.7 → v1.0-RC`

> Authoritative migration guidance for adopters moving between pre-v1
> milestones. Companion to [`semver.md`](./semver.md) and
> [`deprecations.md`](./deprecations.md); concretely lists what
> changes, what doesn't, and which tools cover each transition.

The framework's load-bearing rule: any audit row produced at version
`vX.Y.Z` must classify as `IDENTICAL` or `BASIS_ONLY` when replayed at
any later version (per `@adjudicate/core/replay-classify`). Every
upgrade path documented here is validated against this rule by the
chaos-replay test suite at `packages/audit/tests/chaos-replay.test.ts`.

---

## §1 — `v0.5 → v0.6`

### Breaking-tier changes (none)

v0.6 is the **adapter-core extraction**. Provider adapters (`@adjudicate/anthropic`)
become thin shims over the new `@adjudicate/adapter-core`. Adopters who use
the high-level adapter export (`createAdjudicatedAgent`) see no change —
the re-export path is preserved.

### Additive surface

- `@adjudicate/adapter-core` (new package) — provider-neutral loop, bridge,
  decision translator, persistence shims (memory), error taxonomy. ADR-113.
- `@adjudicate/openai` (new package) — reference OpenAI integration; same
  shape as Anthropic adapter.
- `@adjudicate/analyze` gains Tier 2 AST analyzer `AJD-201` (REWRITE scope
  vs declared `mutatesPayloadFields`). Opt-in via `analyzePolicy({ sourceFiles })`.
- `@adjudicate/conformance` ships `validatePackManifest` and
  `crossCheckPackVsManifest` primitives.

### Migration steps

1. `pnpm up "@adjudicate/*"` — every dependency moves to v0.6 in lockstep.
2. Optionally adopt the OpenAI adapter — see `packages/openai/README.md`.
3. If using direct Anthropic-error imports, swap to the new aliases:
   ```diff
   - import { AnthropicAdapterError } from "@adjudicate/anthropic";
   + import { AdapterError } from "@adjudicate/adapter-core";
   ```
   The legacy names remain as deprecation-target aliases through the v1
   line; codemod ships in v1.1.

### Tools

- Tier 1 + Tier 2 analyzer: `adjudicate analyze --pack <path> --strict`
- Conformance harness: `runConformance(pack)` from `@adjudicate/conformance`

---

## §2 — `v0.6 → v0.7`

### Breaking-tier changes (none)

v0.7 is the **operational hardening + ecosystem trust** cut. All additions
are opt-in primitives. No kernel API change, no wire-format change, no
invariant relaxation.

### Additive surface

- `@adjudicate/audit`:
  - `startDistributedKillSwitchPubSub` (kill-switch v2; ADR-114)
  - `createInMemoryAuditEventBus`, `createRedisAuditEventBus`,
    `bridgeAuditSinkToBus`
  - `replayWithIntegrity`, `isReplayIntegrityClean`, `explainReplayReport`
- `@adjudicate/conformance`:
  - `computePackFingerprint`, `signPackFingerprint`, `verifyPackSignature`,
    `verifyPackTrust` (ADR-115)
- `@adjudicate/adapter-core`:
  - `createRedisConfirmationStore` (restart-durable token storage)
  - `noopTraceSink`, `createInMemoryTraceSink`, `TraceSink` lifecycle hooks
- `@adjudicate/observability`: 8 new `SEMCONV` keys for adapter/provider/pause/kill-switch lifecycle.
- `@adjudicate/cli`: `adjudicate pack verify` command.

### Wire compatibility

- AuditRecord schema is unchanged (still v4). `replayWithIntegrity` adds
  per-record tamper verification but does not change record shape.
- Cross-runtime golden vectors extracted to
  `docs/specs/canonical-hash-vectors.json`. Existing canonical-JSON
  implementations remain compatible.

### Migration steps

1. `pnpm up "@adjudicate/*"` — lockstep again.
2. Production deployments running the kill-switch poller (v1) can wire
   the pub/sub variant alongside the existing poller. The new helper is
   a SUPERSET — `startDistributedKillSwitchPubSub` accepts the same
   options as v1 plus pub/sub configuration.
3. Production deployments using REQUEST_CONFIRMATION should consider
   migrating to `createRedisConfirmationStore` for restart durability;
   the in-memory store remains valid for single-replica deployments.
4. CI gates can adopt `adjudicate pack verify --expect <hash>` immediately;
   the hash is committed to your repo and tracked across releases.

### Tools

- `adjudicate pack verify` — install-time Pack trust
- `replayWithIntegrity` — verification-time tamper detection
- Chaos test suites: `chaos-kill-switch.test.ts`, `chaos-replay.test.ts`

---

## §3 — `v0.7 → v1.0-RC`

### Breaking-tier changes (none)

The v1.0-RC cut adds **discipline, not features**. Every public surface
identified in `V1_FREEZE_MATRIX.md` is either `frozen`, `experimental`,
or `evidence-gated`. Nothing is removed, renamed, or narrowed.

### Additive surface

- `docs/release/V1_FREEZE_MATRIX.md` — every public symbol classified.
- `docs/release/V1_CERTIFICATION_REPORT.md` — invariant + operational scores.
- `docs/security/V1-SECURITY-AUDIT.md` — STRIDE-aligned audit.
- `docs/perf/scale-baselines.json` — machine-readable scale evidence.
- `scripts/check-versions.ts` — pre-publish version consistency check.
- `scripts/check-freeze-matrix.ts` — advisory surface-vs-matrix consistency check.
- `scripts/rc-checks.ts` — composite RC pipeline driver.
- `bench/src/scale/*` — production-scale simulation harnesses.
- `.github/workflows/release-candidate.yml` — RC pipeline.
- `packages/core/tests/api-surface.test.ts` — frozen-surface presence test.

### Wire compatibility

- AuditRecord schema unchanged (v4).
- IntentEnvelope schema unchanged (v2).
- Canonical-JSON hash recipe unchanged.
- `BASIS_CODES` unchanged.

### Migration steps

For adopters: **none**. The RC is a discipline cut; existing code keeps
running. The published packages stay at their current versions until the
v1.0 changeset is cut. Run `pnpm rc:check` locally to validate your fork.

### Tools

- `pnpm rc:check` — composite RC pipeline driver
- `pnpm rc:scale` — re-generate the scale baselines artifact
- `pnpm rc:audit` — pnpm advisory audit gate

---

## §4 — Replay compatibility

Each AuditRecord version is loadable by every later kernel. The
`AuditRecordVersion` union (`1 | 2 | 3 | 4`) is widened additively;
readers branch on `record.version` to access fields beyond v1.

| From | Loader / shim | Notes |
|---|---|---|
| v1 → v2+ | `legacyV1ToV2(row)` in `@adjudicate/audit-postgres` | Synthesizes a v2 envelope from the row's `createdAt` as nonce. v1 `intent_hash` and the recomputed v2 hash will NOT match — kernel `Decision` re-runs against the synthesized envelope for drift detection only. |
| v2 → v3+ | none required | `supersedes`, `kernelIdentity` are optional fields; v2 readers ignore them. |
| v3 → v4+ | none required | `policyVersion`, `kernelVersion`, `auditHash`, `signature` are optional fields; v3 readers ignore them. `replayWithIntegrity` against a v3 record returns `verified: null, reason: "missing_hash"` and counts it in `preV4Records`. |

The replay matrix is covered by:

- `packages/audit-postgres/tests/replay.test.ts` — v1/v2/v3/v4 row → record reconstruction.
- `packages/audit/tests/chaos-replay.test.ts` — 100 corrupted envelopes through replay; integrity failures surface deterministically.
- `packages/core/tests/cross-runtime-hash-vectors.test.ts` — non-Node runtimes self-verify against `docs/specs/canonical-hash-vectors.json`.

---

## §5 — Persisted state compatibility

| Surface | Versioning | Compat story |
|---|---|---|
| Parked envelope blob (`@adjudicate/runtime`) | Tamper-verified at resume via `verifyParkedEnvelopeHash`. Default mode `"warn"` accepts legacy blobs without verification fields; pre-v1.0 `"strict"` flip is evidence-gated (see V1 freeze matrix §26). | Adopters with parked envelopes from v0.5 era: continue running `"warn"`; flip to `"strict"` after a quiet rolling deploy that confirms no legacy blobs remain. |
| Confirmation tokens (`@adjudicate/adapter-core/persistence-redis`) | Token wire format includes `auditHash` of the originating record; resumes that fail hash check refuse. | Compatible across all v0.7+ kernel versions. |
| Postgres audit schema | Forward-only migrations (`001-…` → `008-…`). New columns are NULLABLE-additive. | Run migrations in lockstep with package upgrade. Migration 008 (`add-v4-fields.sql`) lands the v4 column set. |
| Redis ledger keys | SET-NX + TTL contract; key format `ledger:nonce:<intentHash>` stable across versions. | No migration. |
| Kill-switch Redis key | JSON `{active, reason}` payload; v1 poller and v2 pub/sub reader agree on the schema. | No migration. |

---

## §6 — Codemod inventory

| Codemod | From | To | Removal target | Tool |
|---|---|---|---|---|
| `nameGuardToWithMetadata` | `nameGuard(name, guard)` | `withMetadata(guard, { name })` | v2.0 | `adjudicate-migrate name-guard-to-with-metadata` |

Codemods are idempotent: re-running against already-migrated source is
a no-op. Adopters who skip a window can chain codemods from the runner:

```bash
pnpm adjudicate-migrate name-guard-to-with-metadata --src ./src
```

Future codemods register in `@adjudicate/migrate/runner.ts` and ship in
the same MINOR as the deprecation marker (per `deprecations.md`).

---

## §7 — Post-v1.0 outlook

Once v1.0 ships:

- The 24-month deprecation horizon starts (per `semver.md`).
- Deprecation-target symbols (`nameGuard`, `AnthropicAdapterError`,
  `BASIS_CODES.kernel.DEADLINE_EXCEEDED` alias) survive at least two
  consecutive MAJORs before removal.
- Wire-format changes ship only with their JSON Schema and golden
  vectors at the same commit. Cross-runtime parity is the gate.
- Codemods ship alongside each `@deprecated` marker.

The `v0.x → v1.0` window is the last opportunity for adopters to land on
the framework before the freeze. The next breaking opportunity is v2.0,
which is at minimum 12 months away by `semver.md`'s release cadence.
