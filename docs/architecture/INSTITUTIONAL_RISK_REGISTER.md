# Institutional risk register

> **Status.** Normative for the post-v1 stewardship phase. Catalogues the
> non-architectural risks that govern the framework's survivability over
> a 5–10 year horizon: knowledge concentration, hidden invariants,
> infrastructure assumptions, release-process fragility, and ecosystem
> trust dependencies.
>
> Companion to [`LONG_HORIZON_AUDIT.md`](./LONG_HORIZON_AUDIT.md) (which
> tracks *architectural* pressure points), [`MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md)
> (onboarding), and [`OPERATIONAL_ASSUMPTIONS.md`](../ops/OPERATIONAL_ASSUMPTIONS.md)
> (what the runtime presupposes about its environment).
>
> The greatest risk post-v1 is no longer technical failure. It is
> *institutional entropy* — maintainers turn over, providers evolve,
> ecosystems shift, and the implicit knowledge that holds the system
> together decays. This document is the inventory of that entropy
> surface.

---

## 1. How to read this register

Each entry has four annotations:

| Axis | Question |
|---|---|
| **Bus factor** | How many people understand this? (1 / few / many / encoded) |
| **Decay rate** | How fast does the knowledge or assumption rot? (slow / medium / fast) |
| **Blast radius** | What breaks if this is forgotten or shifts? (local / package / wire / replay / ecosystem) |
| **Mitigation** | What encoded artefact preserves intent? (file or test path) |

A risk is *mitigated* when the encoded artefact would catch or surface
the drift before it lands in production. A risk is *open* when the only
defence is the current maintainer's memory.

---

## 2. Knowledge-concentration risks

### 2.1 Why the guard order is `kill → schema → state → taint → auth → business → default`

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: replay + security.
- **Mitigation**:
  [`packages/core/tests/kernel/invariants/guard-order.test.ts`](../../packages/core/tests/kernel/invariants/guard-order.test.ts)
  + [`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md) §3.

The ADR-104 reorder ("auth after taint") is non-obvious — a maintainer
restoring an earlier order will not see an immediate test failure
unless they hit the `untrusted-never-executes.property.test.ts` path.
The structural enforcement in `AC-005` blocks the wrong order at Pack
boundaries, but the kernel boundary is invariant-pinned. **Preserve by
reading the invariant tests before refactoring kernel ordering.**

### 2.2 Why `createdAt` is excluded from `intentHash`

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: replay + dedup.
- **Mitigation**:
  [`packages/core/tests/kernel/invariants/v2-hash-stability.property.test.ts`](../../packages/core/tests/kernel/invariants/v2-hash-stability.property.test.ts)
  + [`docs/specs/canonical-json-hash.md`](../specs/canonical-json-hash.md) §"Hash input subset".

Including `createdAt` would make the same logical envelope hash
differently at two timestamps, breaking the ledger dedup contract that
absorbs retries. The nonce carries the idempotency burden instead.
**Any proposal to "add timestamp back" is a wire-format MAJOR and a
silent break of every existing Pack.**

### 2.3 Why the kernel takes no clock and no RNG

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: replay.
- **Mitigation**:
  [`packages/core/tests/kernel/invariants/replay-determinism.property.test.ts`](../../packages/core/tests/kernel/invariants/replay-determinism.property.test.ts)
  + ESLint rule `AJD-104` (no `Date.now()` / `Math.random()` inside `adjudicate.ts`).

Determinism is the property that lets a 10-year-old audit record
re-adjudicate to the same Decision. Any maintainer adding `Date.now()`
for "convenience" silently disqualifies the framework from its core
promise. **The ESLint rule is the second line of defence; the property
test is the first.**

### 2.4 The `Decision` algebra is closed at six values

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: wire + ecosystem.
- **Mitigation**:
  [`packages/conformance/src/checks/`](../../packages/conformance/src/checks/)
  + ADR-104 §"Forbidden extensions".

Six values: `EXECUTE`, `REFUSE`, `DEFER`, `ESCALATE`,
`REQUEST_CONFIRMATION`, `REWRITE`. Adding a seventh is a coordinated
MAJOR across every runtime, every Pack, every audit-record reader.
"Adding a `metadata` bag" is the most common temptation and the most
damaging — it converts a closed enum into an open one and erodes the
property analyzers can guarantee. **The rejection rationale is
ADR-104 §"closed algebra doctrine"; cite it when declining the
proposal.**

### 2.5 Why `BASIS_CODES.deadline.EXCEEDED` is still listed

- **Bus factor**: encoded.
- **Decay rate**: medium.
- **Blast radius**: basis vocabulary (replay BASIS_ONLY zone).
- **Mitigation**: [`docs/release/deprecations.md`](../release/deprecations.md) +
  scheduled removal at v3.0.

It is a legacy duplicate. A maintainer scanning the basis vocabulary
will reasonably propose its removal. Doing so before the deprecation
calendar elapses breaks replay over pre-v0.5 records that wrote it.
**Removal is calendar-gated; do not advance without an explicit
ADR.**

### 2.6 Pack policy fall-through convention is `REFUSE`

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: security across every Pack.
- **Mitigation**:
  [`packages/conformance/src/checks/`](../../packages/conformance/src/checks/)
  (AC-006: `allowDefaultExecute` opt-in required).

A Pack omitting `policy.default` falls through to `REFUSE`. AC-006
fails a Pack that flips this to `EXECUTE` without explicit opt-in.
**A maintainer "simplifying" the conformance check would erode the
zero-trust posture of every adopter.**

### 2.7 The `auditHash` is over the record *minus* `auditHash` and `signature`

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: integrity verification.
- **Mitigation**:
  [`packages/core/tests/audit-record-v4.test.ts`](../../packages/core/tests/audit-record-v4.test.ts)
  + ADR-111.

The hash-input subset is implicit in the canonicalisation step. A
naïve refactor that hashes the *whole* record creates a chicken-and-egg
dependency and breaks every v4 record ever written. **Touch with
extreme care; pin behaviour with a golden vector before editing.**

---

## 3. Infrastructure-assumption risks

### 3.1 `@noble/hashes` is the SHA-256 ground truth

- **Bus factor**: encoded.
- **Decay rate**: medium.
- **Blast radius**: replay (every intentHash, every auditHash).
- **Mitigation**:
  [`packages/core/tests/hash-golden-vectors.test.ts`](../../packages/core/tests/hash-golden-vectors.test.ts)
  + [`docs/specs/canonical-hash-vectors.json`](../specs/canonical-hash-vectors.json).

`@noble/hashes` was chosen for browser/Node parity (replacing
`node:crypto.createHash`). It is sole-maintainer (paulmillr) and
small-surface. A SemVer-breaking upgrade is possible. **Mitigation
path:** golden vectors are the contract; if a future major
re-implements but stays byte-identical, the upgrade is mechanical. If
output drifts, fork and pin. The vector file is the universal arbiter.

### 3.2 Redis as audit ledger + kill-switch transport

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: package (`@adjudicate/audit`).
- **Mitigation**: in-memory shims + the polling-fallback discipline in
  ADR-114 + the `KillSwitchTransport` interface seam.

The framework does not require Redis. The Redis adapters are
*reference implementations* of `Ledger`, `EmergencyStore`,
`KillSwitchTransport`, and `AuditEventBus`. An adopter switching to a
different KV store implements the same interfaces.
[`ECOSYSTEM_ANTI_FRAGILITY.md`](./ECOSYSTEM_ANTI_FRAGILITY.md) §3
documents the fallback strategy. **The risk surfaces only if a future
maintainer hard-codes a Redis-specific call inside the kernel.**

### 3.3 Postgres as durable audit sink

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: package (`@adjudicate/audit-postgres`).
- **Mitigation**: the `AuditSink` interface + the 8-step
  forward-only migration discipline in `audit-postgres/migrations/`.

Same shape as 3.2: the Postgres sink is a *reference* sink. The
load-bearing rule is that *every* `AuditSink` honours the additive
schema discipline. A maintainer "modernising" by replacing this with
a non-additive ORM model breaks the v1/v2/v3/v4 coexistence contract.

### 3.4 Node ≥ 20 + `globalThis.crypto.randomUUID`

- **Bus factor**: encoded.
- **Decay rate**: medium.
- **Blast radius**: local (adapter loop, emergency store).
- **Mitigation**:
  [`packages/adapter-core/src/loop.ts`](../../packages/adapter-core/src/loop.ts)
  has a `Math.random()`-based fallback **for browser**, but the
  fallback is non-cryptographic. **Production paths must keep
  `globalThis.crypto` available.** Node ≥ 20 guarantees this.

If Node deprecates `globalThis.crypto`, migrate to `node:crypto.webcrypto`
shim — single-file change. **Do not relax the fallback in the loop.**

### 3.5 RFC 8785 / JCS canonicalisation primitives

- **Bus factor**: encoded.
- **Decay rate**: very slow (RFC is normative; ECMAScript JSON spec is
  stable since ES2015).
- **Blast radius**: replay (universe-wide).
- **Mitigation**: [`docs/specs/canonical-json-hash.md`](../specs/canonical-json-hash.md)
  + golden vectors + Python cross-runtime checker in spec §"Cross-runtime
  consumers".

Three load-bearing properties: (a) UTF-16 code-unit sort (NOT
locale-aware); (b) `undefined` omission for object properties; (c) ES2015
number-stringification semantics. Each is independently catchable by a
golden vector. **An accidental `localeCompare()` substitution would
break every hash silently. Catch with the property test, not by
re-reading the code.**

### 3.6 GitHub + npm + Sigstore release substrate

- **Bus factor**: 2–3 maintainers.
- **Decay rate**: medium.
- **Blast radius**: release pipeline.
- **Mitigation**: see [`ECOSYSTEM_ANTI_FRAGILITY.md`](./ECOSYSTEM_ANTI_FRAGILITY.md) §5.

The framework can publish from any registry that honours the npm
metadata schema; the Sigstore attestation is *additive*, not required
for replay or audit. If Sigstore disappears, attestations stop landing,
but releases continue. If GitHub disappears, the release workflow must
be reconstituted in another CI provider — the build itself is portable
(`pnpm` + `tsc` + `vitest`; no GitHub-specific build artefacts).

---

## 4. Release-process fragility risks

### 4.1 `scripts/rc-checks.ts` is the release gate

- **Bus factor**: encoded.
- **Decay rate**: medium.
- **Blast radius**: release pipeline.
- **Mitigation**: the gate set is six checks; each maps to a
  documented invariant.

A maintainer "simplifying" the gate set without an ADR weakens the
release discipline. **Removing a gate requires an ADR; adding one
requires the same.**

### 4.2 Changesets bot account dependency

- **Bus factor**: 1–2 (whoever holds the npm and GitHub credentials).
- **Decay rate**: fast (account credentials rotate).
- **Blast radius**: release continuity.
- **Mitigation**: documented in
  [`MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md) §"Release secrets
  rotation".

Concrete risk: if the maintainer holding the NPM token and the
GitHub-account ownership departs without handover, the project cannot
ship. **Mitigation discipline: token rotation is on a 6-month cadence;
recovery procedure is in [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
§"Lost release credentials".**

### 4.3 Lockfile drift

- **Bus factor**: encoded.
- **Decay rate**: medium.
- **Blast radius**: build determinism.
- **Mitigation**: `pnpm-lock.yaml` is committed; `engines.node` and
  `packageManager` are pinned in `package.json`.

A maintainer running `pnpm install --no-frozen-lockfile` in CI quietly
admits future-self into a different dependency graph. **CI uses
`--frozen-lockfile`; do not relax this.**

---

## 5. Test-folklore risks

### 5.1 Magic timestamps in fixtures

- **Bus factor**: encoded but obscure.
- **Decay rate**: medium.
- **Blast radius**: test stability.
- **Mitigation**: timestamps in fixtures are ISO-8601 UTC strings (no
  timezone-relative).

Example: `"2026-04-21T10:32:08Z"` in
`packages/core/tests/explain-extensions.test.ts`. A maintainer
"refactoring tests to use `new Date()`" reintroduces clock-dependency
in deterministic tests. **All fixture timestamps must be hardcoded
UTC literals.**

### 5.2 Golden hashes in `hash-golden-vectors.test.ts`

- **Bus factor**: encoded.
- **Decay rate**: very slow.
- **Blast radius**: catastrophic if rewritten.
- **Mitigation**: comments in the file say "do NOT mutate the existing
  constants — add new vectors for the new version".

A maintainer "updating expected hashes to match the new output" is
exactly the failure mode this test prevents. **Hashes that change are
a regression, not a refactor.**

### 5.3 Partition-month format `"YYYY-MM"`

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: audit-postgres only.
- **Mitigation**: the format is documented in migration `001-create-intent-audit.sql`.

Changing this format would make pre-change rows unqueryable by the
post-change index. **Append a new column; do not mutate the existing
one.**

---

## 6. Ecosystem-trust risks

### 6.1 Pack signing assumes adopter-managed keys

- **Bus factor**: documented.
- **Decay rate**: slow.
- **Blast radius**: ecosystem.
- **Mitigation**: [`ECOSYSTEM_ANTI_FRAGILITY.md`](./ECOSYSTEM_ANTI_FRAGILITY.md) §4
  + ADR-115.

There is no framework-issued signing CA. Adopters who want
Sigstore-style transparency layer it on top. A maintainer "centralising
trust by introducing a framework CA" inverts the ecosystem-health
model. **The decentralised posture is constitutional.**

### 6.2 Conformance vocabulary `KERNEL_REFUSAL_CODES` is closed

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: replay (basis vocabulary).
- **Mitigation**:
  [`packages/core/src/pack-conformance.ts`](../../packages/core/src/pack-conformance.ts)
  + AJD-103.

Adding a kernel refusal code is a MINOR if additive, a MAJOR if
narrowing. The closed set is enforced. **A Pack-side refusal code is a
basis code, not a kernel one; do not conflate.**

### 6.3 Multi-runtime conformance assumes language parity is testable

- **Bus factor**: documented.
- **Decay rate**: slow.
- **Blast radius**: ecosystem.
- **Mitigation**: [`docs/specs/MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md)
  + canonical-hash-vectors.json.

A future Rust/Go/Python implementation could diverge silently if it
passes the hash vectors but skips the decision-equivalence vectors. The
former exists; the latter is sketched. **Adding the
decision-equivalence vector file is the highest-leverage longevity
investment for cross-runtime parity.**

---

## 7. Operational-knowledge risks

### 7.1 The five health signals in OPERATOR_GUIDE are not parameterised

- **Bus factor**: documented.
- **Decay rate**: slow.
- **Blast radius**: operator triage.
- **Mitigation**: [`OPERATIONAL_ASSUMPTIONS.md`](../ops/OPERATIONAL_ASSUMPTIONS.md) §2.

The "kill-switch state, audit-sink health, ledger dedup, replay-drift,
integrity-failure" model assumes the deployment exposes those signals.
An operator without them is flying blind. **The deployment topology
that exposes the signals is the operational contract.**

### 7.2 The "shadow → enforce" four-stage rollout assumes test traffic exists

- **Bus factor**: documented.
- **Decay rate**: slow.
- **Blast radius**: rollout safety.
- **Mitigation**: [`docs/ops/runbooks/`](../ops/runbooks/).

If an adopter has no representative test traffic, the shadow stages
provide no evidence. The runbooks state this assumption; a maintainer
must not "streamline" the staged rollout into a single step.

### 7.3 Replay-drift classifier presupposes a daily replay job

- **Bus factor**: encoded.
- **Decay rate**: slow.
- **Blast radius**: governance-intelligence signal.
- **Mitigation**:
  [`packages/audit/src/replay-drift.ts`](../../packages/audit/src/replay-drift.ts)
  + `OPERATOR_GUIDE.md` §"Daily replay job".

A deployment that does not run the replay job sees `insufficient_data`
forever. The classifier is honest about this state, but the operator
must know to interpret it as "we are not testing replay" rather than
"replay is healthy".

---

## 8. The mitigated/open ledger

| # | Risk | Status | Primary mitigation |
|---|---|---|---|
| 2.1 | Guard order | mitigated | invariant test + AC-005 |
| 2.2 | createdAt exclusion | mitigated | property test + spec |
| 2.3 | No clock/RNG | mitigated | property test + ESLint |
| 2.4 | Closed Decision algebra | mitigated | conformance + ADR-104 |
| 2.5 | Legacy basis duplicate | mitigated | deprecation calendar |
| 2.6 | Policy fall-through REFUSE | mitigated | AC-006 |
| 2.7 | auditHash hash-input subset | mitigated | golden vector |
| 3.1 | @noble/hashes pin | mitigated | golden vectors are arbiter |
| 3.2 | Redis as transport | mitigated | interface seam + in-memory shim |
| 3.3 | Postgres as sink | mitigated | additive migration discipline |
| 3.4 | Node 20 + globalThis.crypto | mitigated | engines pin |
| 3.5 | RFC 8785 / JCS | mitigated | spec + Python checker |
| 3.6 | GitHub + npm + Sigstore | partial | additive, not required |
| 4.1 | rc-checks.ts gate set | mitigated | documented + ADR-gated |
| 4.2 | Changesets credentials | **open** | maintainer guide rotation policy |
| 4.3 | Lockfile drift | mitigated | CI uses `--frozen-lockfile` |
| 5.1 | Magic timestamps | mitigated | UTC literals only |
| 5.2 | Golden hash regressions | mitigated | comment + property test |
| 5.3 | Partition format | mitigated | migration comment |
| 6.1 | Pack signing decentralised | mitigated | constitutional |
| 6.2 | KERNEL_REFUSAL_CODES closed | mitigated | AJD-103 |
| 6.3 | Multi-runtime parity | **partial** | hash vectors exist; decision vectors sketched |
| 7.1 | Health signals exposure | mitigated | OPERATIONAL_ASSUMPTIONS |
| 7.2 | Staged rollout | mitigated | runbooks |
| 7.3 | Replay drift daily job | mitigated | operator guide |

**Two open risks**: 4.2 (release credentials handover) and 6.3
(cross-runtime decision-equivalence vectors). Both are tracked in
[`POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md) and
[`LONG_TERM_STEWARDSHIP_REPORT.md`](./LONG_TERM_STEWARDSHIP_REPORT.md)
§"Long-horizon risks".

---

## 9. How this register is maintained

This is a living document. Update discipline:

- **New mitigation lands** → flip the status entry, link to the
  encoded artefact.
- **New risk discovered** → add an entry with all four annotations.
  If the bus factor is 1, the next PR should reduce it to "encoded" by
  writing the relevant test, ADR, or rationale doc.
- **Risk decays away** (e.g., a deprecated dependency removed) → mark
  *resolved* with the commit hash and date; do not delete the entry
  (institutional memory).
- **Annual review** → walk the table, confirm each mitigation still
  resolves. The reviewer's name and date go into
  [`docs/execution/decisions-log.md`](../execution/decisions-log.md).

The register is not a punch-list. It is the institutional ledger of
"what would break if everyone left tomorrow" — and the encoded
artefact that prevents that break.
