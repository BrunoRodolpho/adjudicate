# Ecosystem anti-fragility

> **Status.** Normative. Catalogues the framework's external dependency
> surface and documents the *anti-fragility* posture — for each
> dependency, the documented fallback if it disappears, becomes hostile,
> or simply rots.
>
> Companion to
> [`INSTITUTIONAL_RISK_REGISTER.md`](./INSTITUTIONAL_RISK_REGISTER.md) §3
> (infrastructure-assumption risks),
> [`OPERATIONAL_ASSUMPTIONS.md`](../ops/OPERATIONAL_ASSUMPTIONS.md) (what
> the framework presupposes), and
> [`pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md)
> (Pack-side trust).
>
> A *fragile* system breaks when a dependency goes bad. An
> *anti-fragile* system has a documented response that does not require
> the original maintainers to be available. This document is the
> framework's response catalogue.

---

## 1. Posture

The framework is designed to *survive* the disappearance of any single
external dependency. The survivability mechanism is:

1. **Every load-bearing dependency is behind an interface seam.** The
   reference implementation can be replaced by an adopter without
   touching the kernel.
2. **Every non-load-bearing dependency is additive.** Its disappearance
   degrades a non-critical signal, not the framework.
3. **No dependency lives in the trust path** (with one exception:
   `@noble/hashes`, see §2).
4. **The release substrate is decoupled from the runtime substrate.**
   GitHub + npm + Sigstore can fail without affecting any
   adjudicate-backed deployment.

---

## 2. Crypto primitives — `@noble/hashes`

**Role.** SHA-256 over canonical-JSON. Used in `intentHash` and
`auditHash`. The single load-bearing crypto primitive in the framework.

**Failure modes.**

- *Library unmaintained*: still functions; the framework continues to
  work. Static security-audit posture decays.
- *Library yanked from npm*: cannot install fresh. Pinned versions in
  the lockfile continue to resolve from the local cache or mirror.
- *Security advisory*: high-severity vulnerability in `@noble/hashes`
  affects every audit record ever written.

**Anti-fragility plan.**

- **Tier 1 (no maintainer action)**: golden vectors in
  [`docs/specs/canonical-hash-vectors.json`](../specs/canonical-hash-vectors.json)
  and [`docs/specs/replay-longevity-corpus.json`](../specs/replay-longevity-corpus.json)
  are the algorithm contract. Any byte-identical SHA-256 implementation
  is a drop-in replacement.
- **Tier 2 (1-PR migration)**: switch to a different sync, pure-JS
  SHA-256 library (e.g., `js-sha256` or a hand-rolled implementation
  vetted against the golden vectors). One-file change to
  `packages/core/src/hash.ts`.
- **Tier 3 (Node-only adopters)**: switch to
  `node:crypto.createHash("sha256")`. Loses browser/edge support; gains
  std-lib stability. Documented in the freeze matrix as the recovery
  mode.

**Trigger.** A documented advisory or six months without a release
from `@noble/hashes` upstream. Maintainer decision based on
[`REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md) checklist.

---

## 3. Persistent ledger — Redis

**Role.** Replay-suppression ledger; emergency-store backing;
kill-switch pub/sub transport; audit event bus transport.

**Failure modes.**

- *Provider outage*: in-flight intents fail-closed (ledger error =
  no decision). The kernel does not lose state.
- *Redis Inc. business change* (e.g., licence regression): existing
  versions continue to run; new versions may diverge.
- *Memory eviction policy drift*: ledger entries silently expire; replay-
  suppression becomes best-effort. Documented as a tunable.

**Anti-fragility plan.**

- **Tier 1**: the kernel does not import Redis. The
  `@adjudicate/audit` package exposes the `Ledger`, `EmergencyStore`,
  and `KillSwitchTransport` *interfaces*; Redis is a *reference*
  implementation.
- **Tier 2 (adopter swap)**: an adopter implements the four interfaces
  against a different KV store (Valkey, DynamoDB, etcd, KeyDB). No
  kernel change required.
- **Tier 3 (in-memory fallback)**: single-process deployments use
  `createMemoryLedger`. Loses horizontal scale; the framework
  continues to provide its v1 guarantees in single-replica mode.

**Trigger.** None required — adopters operating outside the
Redis-as-default deployment topology use Tier 2 from day one.

---

## 4. Durable audit sink — Postgres

**Role.** Reference durable sink for `AuditSink.emit`. The
audit-postgres package ships migrations 001-008 and a Postgres-specific
sink implementation.

**Failure modes.**

- *Postgres major version regression*: a future major (e.g., 18 → 19)
  changes partition pruning semantics. The migration sequence may
  need a new entry.
- *Provider outage*: `persistent-buffered-sink` spools to local disk;
  drain when the upstream returns.
- *Schema drift*: a maintainer attempts a destructive migration. ADR-111
  prohibits this; the migration discipline is forward-only.

**Anti-fragility plan.**

- **Tier 1**: `AuditSink` is an interface. NATS, S3, SQS, and
  in-memory sinks ship as reference implementations.
- **Tier 2 (adopter swap)**: any append-only durable store with
  partitioning semantics suffices.
- **Tier 3 (no durable sink)**: the kernel continues to operate.
  Replay-with-integrity is unavailable; this is a *degraded mode*
  documented in [`FAILURE_MODE_CATALOG.md`](../ops/FAILURE_MODE_CATALOG.md)
  §3.

**Trigger.** None — adopter choice from day one.

---

## 5. Release substrate — GitHub + npm + Sigstore

**Role.** Source hosting, package registry, attestation transparency.

**Failure modes.**

- *GitHub unavailable*: cannot push tags, cannot run CI, cannot
  publish from the workflow. Previously-published versions remain.
- *npm registry change*: pnpm fails to install or publish. Adopters
  on a proxy (Verdaccio, Artifactory) are insulated; adopters on the
  public registry are not.
- *Sigstore unavailable*: attestation step fails; publish continues.
- *Account loss*: the maintainer holding NPM_TOKEN or GitHub admin
  is gone. See [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
  §"Lost release credentials".

**Anti-fragility plan.**

- **Tier 1 (already published)**: previously released versions remain
  installable indefinitely. The framework's *value to existing
  adopters* survives any release-substrate outage.
- **Tier 2 (new versions)**: a maintainer with NPM_TOKEN can publish
  manually with `pnpm publish -r` from any environment. The GitHub
  workflow is a convenience, not a requirement.
- **Tier 3 (account loss)**: fork to a new npm scope. Document the
  lineage in [`docs/execution/decisions-log.md`](../execution/decisions-log.md).
  Adopters opt-in to the new scope at their next upgrade.
- **Tier 4 (registry alternative)**: publish to a private registry
  or self-hosted Verdaccio. Adopters who consume from there are
  insulated from npm changes.

**Trigger.** Per-failure mode; documented in
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §10.

---

## 6. Node.js runtime

**Role.** Execution environment. Pinned to `>=20.0.0` via
`package.json` engines.

**Failure modes.**

- *LTS support ends*: Node 20 LTS exits security support in 2026.
  Adopters on 20 stop receiving CVE patches.
- *API deprecation*: `globalThis.crypto.randomUUID` deprecated in a
  future major. The framework's adapter-loop and emergency-store paths
  break.
- *Foundation governance change*: the Node.js Foundation evolves;
  release cadence shifts.

**Anti-fragility plan.**

- **Tier 1**: `engines.node >= 20` permits Node 22, 24, etc. The
  framework's CI tests against Node 22; forward-compatibility is
  validated.
- **Tier 2 (major Node bump)**: when Node 20 EOLs, bump the `engines`
  pin in a MINOR release. Adopters on Node 20 continue to use the
  prior version line.
- **Tier 3 (Node deprecation of a primitive)**: replace
  `globalThis.crypto.randomUUID` with the modern equivalent (e.g.,
  `crypto.randomUUID()` from `node:crypto`). One-file change.

**Trigger.** Annual review per `OPERATIONAL_ASSUMPTIONS.md` §12.

---

## 7. LLM provider SDKs — Anthropic, OpenAI

**Role.** L5 adapter packages (`@adjudicate/anthropic`,
`@adjudicate/openai`) shim provider SDKs.

**Failure modes.**

- *SDK major version*: API surface drifts (e.g., a tool-use field
  renamed). Adapter recompiles fail; runtime breaks.
- *Provider sunset*: a model or API endpoint is retired.
- *Provider commercial change*: pricing, rate limits, terms shift.

**Anti-fragility plan.**

- **Tier 1**: the kernel does not import any provider SDK. Provider
  knowledge is confined to the L5 adapter package.
- **Tier 2 (SDK drift)**: the adapter ships behind a pinned peer
  dependency (`>=0.30.0`). A new major is a single-package update.
- **Tier 3 (provider sunset)**: adopters switch providers by
  swapping the adapter package. Two providers ship today; a third
  is < 200 lines per [`AI_CONTEXT.md`](../../AI_CONTEXT.md) §"How
  adapter-core layering works".
- **Tier 4 (adopter writes adapter)**: adapter-core's `ProviderBridge`
  interface is documented and stable. An adopter facing a sunset can
  write a custom adapter without framework support.

**Trigger.** Per-provider; the framework does not gate on this.

---

## 8. Observability — OpenTelemetry / OTLP

**Role.** SEMCONV vocabulary + sink implementations in
`@adjudicate/observability`.

**Failure modes.**

- *OTLP schema evolution*: the SEMCONV upstream changes a key. The
  framework's exported constants drift from upstream conventions.
- *Collector unavailable*: metrics drop silently.

**Anti-fragility plan.**

- **Tier 1**: the framework's SEMCONV constants are *frozen vocabulary*
  per [`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md) §8.
  Upstream SEMCONV evolves; the framework's keys do not.
- **Tier 2**: adopters wanting upstream parity write a translation
  layer in their collector pipeline. The framework's keys remain stable.

**Trigger.** Annual review; the framework does not chase upstream.

---

## 9. CI workflows — GitHub Actions

**Role.** Lint, test, version-consistency, release-candidate gates.

**Failure modes.**

- *GitHub Actions service degradation*: PRs cannot land; releases
  cannot be cut.
- *Action deprecation*: e.g., `actions/checkout@v4` is sunset.
- *Self-hosted runner failure*: not applicable (the framework uses
  GitHub-hosted runners).

**Anti-fragility plan.**

- **Tier 1**: the workflows are short, declarative, and re-runnable
  from local shells. `pnpm install && pnpm test` is the *entire* CI
  gate at its core.
- **Tier 2 (GitHub outage)**: maintainer runs `pnpm tsx
  scripts/rc-checks.ts` locally; the gates are designed to be
  reproducible.
- **Tier 3 (migration to alternative CI)**: the workflows port to
  GitLab CI / Buildkite / Drone in < 1 day. The build is portable.

**Trigger.** None proactive — respond to incidents.

---

## 10. Package signing — Sigstore

**Role.** SBOM + provenance attestation on publish.

**Failure modes.**

- *Sigstore Rekor unavailable*: attestation step fails; publish
  succeeds.
- *Sigstore service end-of-life*: existing attestations remain valid
  via local verification; new attestations cannot be produced.

**Anti-fragility plan.**

- **Tier 1**: Sigstore is *additive*. The framework's trust model
  (`verifyPackTrust`) does not depend on Sigstore. See
  [`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md) §12.
- **Tier 2**: if Sigstore disappears, adopters who built around it
  switch to local key management.

**Trigger.** None — the framework remains functional.

---

## 11. Pack ecosystem — npm packages

**Role.** Packs ship as npm packages under adopter-chosen scopes.

**Failure modes.**

- *Pack abandoned*: the npm package stops receiving updates. The
  Pack continues to work; security advisories accumulate.
- *Pack yanked*: the package is unpublished. Adopters' lockfiles
  continue to resolve from cache; fresh installs fail.
- *Pack hostile takeover*: a maintainer transfers ownership to a
  bad actor; a malicious update lands.

**Anti-fragility plan.**

- **Tier 1**: `verifyPackTrust` with `require_signature` mode
  blocks unsigned updates. Adopters who manage signing keys are
  insulated from hostile takeover.
- **Tier 2 (adopter-managed mirror)**: adopters mirror Packs to a
  private registry; updates are vetted before mirroring.
- **Tier 3 (fork)**: a Pack consumer forks the Pack to their own
  scope. The Pack's interface (`@adjudicate/conformance` checks +
  manifest schema) is the substrate; the contents are forkable.

**Trigger.** Per-Pack; the framework provides primitives, not
policy. See [`ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md)
§2.

---

## 12. The "everything fails at once" scenario

A common anti-fragility question: what if multiple dependencies fail
simultaneously? The framework's posture:

- **Already-published versions** remain installable and runnable as
  long as Node.js itself is installable. This is multi-decade
  durability.
- **Already-deployed instances** continue to run as long as Redis,
  Postgres, and the LLM provider are reachable. If any of those
  fail, the documented degraded mode applies.
- **New releases** can be cut from any environment with NPM_TOKEN
  and a working `pnpm` install. No specific CI provider is required.
- **Forks** are permitted under the licence; the project survives
  even total maintainer disappearance through fork pathways
  documented in [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
  §"Maintainer-absent operation".

---

## 13. Dependency hygiene discipline

The annual review for this document:

- [ ] Walk the dependency tree (`pnpm why -r <package>`); confirm no
      single dependency holds the entire framework hostage.
- [ ] Re-verify that the kernel imports no provider SDK, no Redis
      client, no Postgres client (these live in adapter, runtime, and
      audit-postgres packages, *not* core).
- [ ] Re-verify that `@noble/hashes` is the only crypto dependency.
- [ ] Re-verify that the `engines.node` pin is still upstream-supported.
- [ ] Sign in [`docs/execution/decisions-log.md`](../execution/decisions-log.md).

---

## 14. What anti-fragility is not

Anti-fragility is *not* the absence of failure. Dependencies will
fail; that is given. Anti-fragility is the property that each failure
has a documented response that does not require the original
maintainers to be available *and* does not compromise the
framework's v1 invariants.

Above all, anti-fragility is *not* an excuse to add dependencies.
The strongest anti-fragility posture is the one with the *fewest*
dependencies. Every new dependency is a new entry in this document
and a new annual-review obligation.

The framework's dependency tree is conspicuously short. Keep it that
way.
