# Long-horizon architecture audit

> **Status.** Forward-looking. Identifies pressure points, semver-
> fragility zones, and trust-model limitations the framework should be
> aware of over the v1 line and beyond. **NOT** a feature wishlist —
> nothing here is scheduled work; this is the durable list of things
> the next architectural reviewer should re-evaluate before changing.
>
> Companion to [`V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md)
> (what's frozen now), [`EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md)
> (how to evolve), and [`POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md)
> (where we're heading).
>
> The framework's goal is multi-year stability. This document is the
> "things we know are not perfect but are not breaking — yet" register.

---

## 1. Methodology

We classify each pressure point against four axes:

| Axis | Question |
|---|---|
| **Imminence**   | When does this start mattering? (now / next MAJOR / multi-MAJOR / never) |
| **Reversibility** | Can we walk back if we mis-evolve here? (free / coordinated / breaking) |
| **Coupling**    | How many surfaces does the right answer touch? (local / package / cross-pkg / wire) |
| **Risk class**  | What property of the framework is at stake? (replay / audit / trust / determinism / ecosystem / maintenance) |

Items are listed in roughly descending Imminence × Risk weight.

---

## 2. Conceptual-debt register

### 2.1 `verifyParkedHash: "warn"` default

- **Imminence**: next MINOR.
- **Reversibility**: coordinated (changeset pre-built; flip is MINOR).
- **Coupling**: local (`@adjudicate/runtime`).
- **Risk class**: trust.

The `warn` default keeps the legacy-blob escape hatch open: tampered
blobs still fail-closed, but blobs missing verification fields resume
silently. The freeze matrix records this as an evidence-gated flip to
`strict` once an adopter confirms no legacy blobs remain in production.
**Action when triggered:** evaluate adopter reports, flip default, ship
changeset, mark §5 of freeze matrix as resolved.

### 2.2 Kill-switch v2 default `pollMs = 1000`

- **Imminence**: by evidence.
- **Reversibility**: free (option value).
- **Coupling**: local.
- **Risk class**: trust + latency.

The v2 pub/sub path delivers sub-100ms in lab; the polling fallback
holds the convergence guarantee at `pollMs * 2`. Adopter latency
profiles may justify lowering `pollMs` to 500 if pub/sub miss-rate is
above 5%. **Action**: hold default; revisit when at least one adopter
publishes a real-world latency report (per `V0.7-AUDIT-REPORT.md`).

### 2.3 L2 primitives still `experimental`

- **Imminence**: next two MINOR cycles.
- **Reversibility**: coordinated (each primitive is one PR to promote).
- **Coupling**: package (`@adjudicate/primitives` + analyzer + freeze
  matrix).
- **Risk class**: ecosystem.

`createConfirmGuard`, `createEscalateGuard`, `createIdempotencyGuard`,
`createRewriteGuard` ship `experimental`. They have one Pack consumer
each. The promotion criteria are in `EXTENSION_POLICY.md` §4 —
specifically, "stable shape across two MINORs" plus "one external
adopter in production." **Action**: track external Pack adoption and
promote individually as evidence lands.

### 2.4 `BASIS_CODES.deadline.EXCEEDED` legacy duplicate

- **Imminence**: scheduled removal in v3.0.
- **Reversibility**: coordinated (codemod required).
- **Coupling**: local (`@adjudicate/core`).
- **Risk class**: maintenance.

The duplicate kernel-internal alias exists for back-compat. Removal
target documented in `deprecations.md`. **Action**: ensure a codemod
ships in the MAJOR before the alias deletion.

### 2.5 Audit-postgres migration tooling stays additive-only

- **Imminence**: ongoing.
- **Reversibility**: breaking (every published audit row depends on
  the schema's append-only history).
- **Coupling**: cross-pkg (audit-postgres + admin-sdk + replay).
- **Risk class**: replay + audit.

Future audit-record fields require a new SQL migration. Removal of a
column is MAJOR and requires a full backfill plan. **Action**: keep
migrations forward-only; document every column addition in
`deprecations.md` so adopters' migration runners can plan.

---

## 3. Extension-pressure points

Surfaces that adopters will ask us to widen first. Each one needs an
ADR before evolving.

### 3.1 `ProviderBridge<H>` widening

- **Pressure**: new providers (Vercel AI, Bedrock, Gemini) may want
  to surface streaming or vision-specific shapes through the bridge.
- **Constraint**: the bridge is three methods (`emptyHistory`,
  `appendUserMessage`, `send`, `appendToolResults`). Widening would
  break vendor neutrality.
- **Right answer**: per-provider shape lives inside the opaque history
  `H`. Streaming is the loop's concern, not the bridge's.

### 3.2 `Decision` widening

- **Pressure**: requests for `Decision.confidence`,
  `Decision.metadata`, `Decision.attribution`.
- **Constraint**: closed Decision algebra. Six outcomes, no field-
  level bag.
- **Right answer**: surface as envelope metadata excluded from
  `intentHash`, or as a Pack-author sink alongside `LearningSink`.

### 3.3 `AuditRecord` widening

- **Pressure**: requests for free-form structured metadata, vendor-
  specific spans, audit-side bridges to SIEMs.
- **Constraint**: additive-only across minor versions; wire-equivalent
  across runtimes (per `MULTIRUNTIME_CONFORMANCE.md`).
- **Right answer**: add a typed, optional field at the next MINOR
  (with a schema migration in audit-postgres + a freeze-matrix row +
  updated Zod schemas in admin-sdk). Free-form metadata bags are
  rejected — they would defeat the canonical hash.

### 3.4 `PolicyBundle` widening

- **Pressure**: domain-specific evaluation phases beyond
  `state | taint | auth | business`.
- **Constraint**: guard evaluation order is load-bearing.
- **Right answer**: compose new phases as `business` guards; the
  `firstMatch` combinator covers ordering inside a phase. A genuinely
  new phase is a MAJOR.

### 3.5 Refusal-message localization

- **Pressure**: adopter-supplied locales beyond English + pt-BR.
- **Constraint**: closed `RefusalKind` enum; closed refusal-code
  catalogue per Pack.
- **Right answer**: ship adopter-controlled locale tables (`RefusalMessages`
  injection point exists). Framework adds a package per major locale
  only when a real adopter requests it.

---

## 4. Semver-fragility zones

Surfaces where a careless change would force a MAJOR with multi-
ecosystem coordination.

### 4.1 Canonical-JSON hash recipe

- **Fragility**: changing string escape rules, key sort order, or
  numeric formatting breaks every multi-runtime implementation.
- **Guardrail**: golden vectors at `docs/specs/canonical-hash-vectors.json`
  exercised by `tests/cross-runtime-hash-vectors.test.ts`. A
  PR that fails any vector is blocked.

### 4.2 `IntentEnvelope v2` JSON Schema

- **Fragility**: any required-field add breaks every consumer's audit
  rows.
- **Guardrail**: schema at `docs/specs/intent-envelope-v2.schema.json`;
  freeze matrix row §1.1; replay-equivalence test in
  `cross-runtime-hash-vectors.test.ts`.

### 4.3 Guard evaluation order

- **Fragility**: reordering `state | taint | auth | business` changes
  the Decision adopters' Packs produce; would mass-invalidate audit
  history.
- **Guardrail**: invariant tests in
  `packages/core/tests/kernel/invariants/`. Reorder requires a MAJOR
  with replay shims per `SEMVER_GOVERNANCE.md`.

### 4.4 `RedisLedgerClient` interface

- **Fragility**: every audit + ledger + kill-switch + event-bus
  feature reuses this minimal Redis surface. Widening it forces every
  adopter's Redis mock to track the change.
- **Guardrail**: the freeze matrix tags it `frozen`; widening goes
  through ADR per §3 of `EXTENSION_POLICY.md`.

### 4.5 `SEMCONV.*` attribute names

- **Fragility**: dashboards, alerts, and SIEM rules built on top of
  the attribute names break on rename.
- **Guardrail**: `semconv.ts` JSDoc + freeze matrix §19; rename is
  MAJOR with a deprecation-calendar entry minimum two MAJORs out.

---

## 5. Replay-storage growth concerns

### 5.1 Per-tenant audit volume

- **Imminence**: depends on adopter scale; not a framework concern
  until an adopter reports throttling.
- **Reversibility**: ecosystem-side decision (partitioning, archival).
- **Coupling**: audit-postgres + adopter ops.
- **Risk class**: maintenance + audit.

The reference Postgres sink partitions monthly (`partitionMonthOf`).
Adopters running multi-tenant deployments may need finer partitioning
or per-tenant shards. The framework's role: keep the row schema
additive so adopters can split out.

### 5.2 Hash-key cardinality on the ledger

- **Imminence**: not yet observed.
- **Reversibility**: free (the ledger is adopter-supplied storage).
- **Coupling**: local.
- **Risk class**: replay.

`intentHash` is 64-char hex. The Redis ledger uses it as a key; at
billions of records that becomes the dominant memory consumer. The
framework's role: document this as an adopter-side concern; the v1
contract does not change.

### 5.3 Long-tail replay over years-old records

- **Imminence**: ongoing.
- **Reversibility**: coordinated (replay shims live in core +
  audit-postgres).
- **Coupling**: cross-pkg.
- **Risk class**: replay + audit.

`AuditRecord` is readable across `v1 | v2 | v3 | v4`. As versions
accumulate, the kernel's loader complexity grows linearly. The
framework's role: keep the schema additive and the version-branching
shims in core (not duplicated across consumers).

---

## 6. Trust-model limitations

### 6.1 Pack signing roots are adopter-controlled

- **Property**: there is no framework-issued CA, no shared trust root.
- **Implication**: adopters who ingest Packs from multiple authors
  must distribute multiple public keys. The framework does not
  provide a trust bundle.
- **Right answer**: keep it adopter-controlled (`ECOSYSTEM_HEALTH_MODEL.md`
  §6). Optional pluggable trust-bundle helper if adopter demand
  emerges.

### 6.2 Pack fingerprint covers declarative surface only

- **Property**: `computePackFingerprint` hashes `(id, version,
  contract, intents, signals, basisCodes)` — not function bodies.
- **Implication**: two Packs with the same fingerprint may implement
  the same declared intents *differently*. `runConformance` is the
  behavioural check.
- **Right answer**: keep fingerprint declarative; behavioural pinning
  belongs in conformance + replay vectors.

### 6.3 Audit-record signature is opt-in

- **Property**: `AuditRecord.signature` is a seam; the framework does
  not sign by default.
- **Implication**: an unsigned audit row passes `verifyAuditRecord`
  modulo the hash. Tamper detection still works; non-repudiation
  requires adopter wiring.
- **Right answer**: keep the seam; document adopter wiring patterns
  in the operator guide.

---

## 7. Observability scaling risks

### 7.1 Audit-event-bus throughput at scale

- **Pressure**: hundreds of WebSocket consumers per process.
- **Guardrail**: `createRedisAuditEventBus` + `bridgeAuditSinkToBus`;
  the bus is best-effort, durable sink is unchanged.
- **Watch for**: subscriber-leak patterns; reconnect-storm scenarios.

### 7.2 SEMCONV attribute cardinality

- **Pressure**: adopter-defined `adjudicate.intent.kind` cardinality
  can explode if a Pack invents intents at runtime.
- **Guardrail**: the analyzer + manifest validator constrain `intents`
  to a declared static list.
- **Watch for**: adopters opting out of the analyzer in CI; that loses
  the cardinality constraint.

### 7.3 Metrics-sink fan-out cost

- **Pressure**: every adopter's MetricsSink runs synchronously on the
  hot path of `adjudicateAndAudit`.
- **Guardrail**: `Exporter.export` is documented as never-throwing;
  adopters who buffer asynchronously are responsible for their own
  backpressure.
- **Watch for**: slow sinks that block the hot path. The reference
  OTLP wrapper buffers internally; custom sinks that don't must.

---

## 8. Ecosystem-coupling risks

### 8.1 Implicit kernel-version coupling via Pack `peerDependencies`

- **Pressure**: Packs pin `@adjudicate/core` semver ranges in
  `peerDependencies`. A loosely-pinned Pack may install with a kernel
  it's never been tested against.
- **Guardrail**: `validatePackManifest` requires the peer range to
  match `adjudicate.kernelMinVersion`. CI gates on this.
- **Watch for**: adopters bypassing manifest validation at install.

### 8.2 Cross-Pack basis-code collisions

- **Pressure**: two Packs declaring the same code on `Pack.basisCodes`
  (e.g., `business:rule_violated`). Aggregated dashboards lose Pack
  separation.
- **Guardrail**: `SEMCONV.PACK_ID` carries the Pack identifier on
  every emission. Dashboards must aggregate `(pack_id, basis_code)`.
- **Watch for**: dashboards built before this convention solidifies.

### 8.3 Adapter-core / provider-package fan-out

- **Pressure**: adding the third, fourth, fifth provider package.
  Each new adapter is a < 200-line PR per `AI_CONTEXT.md`.
- **Guardrail**: ADR-113 documents the extraction; `loop.ts` carries
  no SDK imports; `tests/loop.test.ts` covers history-opacity.
- **Watch for**: provider packages that drag SDK-specific shape into
  the bridge.

---

## 9. Pack-ecosystem abuse risks

### 9.1 Malicious Pack uploaded to npm

- **Pressure**: a third party publishes a Pack under a name that
  looks like an official one.
- **Guardrail**: there is no framework-namespace lockout; adopters
  verify signatures (`verifyPackTrust` with `require_signature`).
- **Watch for**: adopters running `policy: "none"` in production.
  Documentation should make `require_fingerprint` the recommended CI
  gate.

### 9.2 Pack version downgrade attack

- **Pressure**: an adopter accidentally installs an older Pack version
  whose behaviour replay-diverges from the current one.
- **Guardrail**: lockfile + `classifyReplayDrift` over the version
  range; manifest's `kernelMinVersion` prevents installing on an
  incompatible kernel.
- **Watch for**: adopters not running replay-drift in CI on Pack
  bumps.

### 9.3 Fingerprint-collision spoofing

- **Pressure**: a malicious author publishes a Pack whose declared
  fingerprint matches a legitimate Pack's.
- **Guardrail**: SHA-256 collision resistance + adopter-side
  signature check.
- **Watch for**: adopters who pin the fingerprint without pinning the
  signature.

---

## 10. Permanently frozen invariants

For completeness, the invariants this audit will *not* re-evaluate
within the v1 line — they are load-bearing:

1. Closed `Decision` algebra (6 kinds).
2. Closed `Taint` lattice (3 levels).
3. Closed `RefusalKind` enum (6 categories).
4. Closed `BasisCategory` set (11 categories).
5. Guard evaluation order (`state → taint → auth → business → default`).
6. Fail-closed default (throwing guard → SECURITY REFUSE).
7. Determinism guarantee on `adjudicate()` (no clock, no RNG, no I/O).
8. `intentHash` recipe (RFC 8785 JCS over the v2 subset).
9. `auditHash` recipe (canonical JSON over the record minus
   `auditHash + signature`).
10. `AuditRecord` schema additivity across minor versions.
11. Pack isolation (no cross-Pack mutation surface).
12. Adopter-controlled clocks, ledgers, sinks (kernel takes them via
    `deps`).

Any change to any of these is a MAJOR coordinated with multi-runtime
co-release per `SEMVER_GOVERNANCE.md`.

---

## 11. Re-audit cadence

This document is re-evaluated:

- At every MAJOR cut. Each pressure point reviewed; resolved items
  removed; new items added based on the prior MAJOR's operational
  experience.
- After any operational incident that touched a load-bearing
  invariant. The incident's root cause feeds back into the conceptual-
  debt register.
- When a new pressure point is identified by an ADR. ADRs landing in
  `docs/architecture/adr/` should reference this document if they
  resolve or aggravate a listed item.

This audit is *not* a roadmap. The roadmap lives in
`POST_V1_STRATEGY.md`. This document's job is to ensure roadmap items
do not silently weaken the substrate.
