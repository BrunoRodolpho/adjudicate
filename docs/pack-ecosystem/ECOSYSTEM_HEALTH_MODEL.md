# Ecosystem health model

> **Status.** Normative for the v1 line. The mental model behind the
> Pack-ecosystem primitives (`scorePackHealth`, `verifyPackTrust`,
> `validatePackManifest`, `runConformance`) and the operating rules
> framework maintainers apply when evaluating ecosystem-side changes.
>
> Companion to [`quality-scoring.md`](./quality-scoring.md) (per-Pack
> tier definitions), [`registry-foundations.md`](./registry-foundations.md)
> (npm-convention manifest schema), and the framework
> [`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md).

---

## 1. What "ecosystem health" means

A *healthy* adjudicate ecosystem has four observable properties.

1. **Adopters can install a Pack without trusting its author.** The
   primitives that make this true: `validatePackManifest`,
   `runConformance`, `verifyPackTrust`, `scorePackHealth`. None of them
   require a hosted service.
2. **Replay survives Pack updates.** When a Pack ships a new version,
   adopters who replay historical audit rows still classify the
   re-derived decisions as `IDENTICAL` or `BASIS_ONLY`. The Pack
   author is responsible for honouring the framework's semver rule
   (cf. [`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md)
   §"Replay continuity"); the framework provides the classifier.
3. **Pack adoption is decentralised.** Packs ship via npm under
   adopter-chosen scopes. There is no framework-owned registry, no
   framework-issued signing CA, and no framework-mediated discovery.
4. **Maintenance burden is observable.** The health-scoring primitive
   produces a deterministic, bounded report so adopters can see at a
   glance which Packs are well-maintained.

The framework's job is to keep the substrate that enables those four
properties stable. It is not to *certify* Packs, *host* Packs, *rank*
Packs against each other, or *gate* who can publish.

---

## 2. Why no marketplace

Marketplaces centralise:

- Discovery (one curated index becomes the canonical source of truth).
- Trust (one signing authority becomes mandatory).
- Distribution (one upload-and-download pipeline becomes load-bearing).
- Revenue capture (one party meters access).

Each of those centralisations is a liability for a governance
substrate. A regulatory regime that excludes the marketplace operator
(GDPR-blocked jurisdiction, sanctioned tenant) excludes every Pack
distributed through it. A bug in the marketplace's review queue
delays every adopter's update path. The framework's evidence here is
historical: PyPI typosquatting, npm `event-stream`, ruby-gems supply-
chain attacks all flowed through centralised distribution channels.

adjudicate routes around this by treating the ecosystem as a *protocol*:
manifests, fingerprints, conformance checks, signatures. Adopters
assemble whatever distribution + discovery surface fits their
operating environment.

---

## 3. The four primitives and how they compose

```
┌──────────────────────────────┐
│  validatePackManifest        │   "Is the package.json well-formed?"
├──────────────────────────────┤
│  runConformance              │   "Does the live Pack pass the
│                              │    invariant suite?"
├──────────────────────────────┤
│  verifyPackTrust             │   "Does the Pack match the fingerprint
│                              │    or signature I expected?"
├──────────────────────────────┤
│  scorePackHealth             │   "Roll all three up into a single
│                              │    operator-readable score."
└──────────────────────────────┘
```

Adopters who want partial scoring call the primitives directly. The
roll-up exists so a CI gate can be `npm test && pnpm adjudicate pack
verify --policy require_signature && pnpm adjudicate pack bom`. The CLI
exposes `scorePackHealth` through `pack bom` (the AI-BOM embeds the
health report); there is no standalone `pack health` command. CI gates
that want only the score call `scorePackHealth` from
`@adjudicate/conformance` directly.

---

## 4. Composition rules

The framework commits to keeping these composition properties stable
across the v1 line:

- **All four primitives are pure.** They do not read from disk, the
  network, or any process-global state.
- **Input is parsed by the caller.** `validatePackManifest` takes the
  parsed `package.json`; `runConformance` takes the live Pack object;
  `verifyPackTrust` takes a `VerifyPackTrustOptions` object (Pack
  fingerprint input plus optional `publicKeyPem`, `signature`, and
  `policy` — the bare-PEM signature check is `verifyPackSignature`);
  `scorePackHealth` takes the pre-computed reports from the other three.
  CLI commands wrap I/O around these primitives — the primitives
  themselves never touch the filesystem.
- **Outputs are JSON-stable.** Every primitive returns a value that
  serialises deterministically; field ordering inside the report is
  pinned by the canonical-JSON convention.
- **Closed vocabularies.** Each report uses a bounded enum so dashboards
  built today survive minor bumps.

---

## 5. Pack lifecycle

A Pack's life cycle through the ecosystem:

```
author → publish → install → conform → trust → operate → upgrade → deprecate
```

Each stage maps to a primitive:

| Stage     | Primitive                                  | What it answers                                  |
|-----------|--------------------------------------------|--------------------------------------------------|
| publish   | `validatePackManifest`                     | Is the manifest npm-convention-correct?          |
| install   | `verifyPackTrust` (policy `best_effort`)   | Does the install match the published fingerprint?|
| conform   | `runConformance`                           | Does the Pack pass AC-001..AC-006?               |
| trust     | `verifyPackTrust` (policy `require_signature`) | Does the signature verify against my CA?     |
| operate   | `scorePackHealth`                          | One-line dashboard score for ongoing health.     |
| upgrade   | replay-classify (per `SEMVER_GOVERNANCE.md`) | Does the new version replay-equivalent the old?  |
| deprecate | `deprecations.md` + `@adjudicate/migrate`  | Is there a codemod to the replacement?           |

---

## 6. What an adopter is *not* asked to trust

- **A hosted registry.** Adopters install via npm (or their internal
  mirror). The framework does not host one.
- **A framework-issued key.** Pack authors generate their own keys;
  adopters distribute their own trust roots.
- **A framework-curated index.** No "official Packs" list. The Pack
  list lives in adopters' lockfiles.

---

## 7. Drift and decay — operational signals

The ecosystem develops health problems when:

1. **A widely-installed Pack stops being maintained.** Signal: no
   commits, no published versions, growing issue backlog. The
   framework does not page on this — adopters should monitor their own
   lockfiles. `scorePackHealth` will surface low scores when the Pack
   drops `runConformance` invariants on a kernel bump.
2. **A Pack's published fingerprint diverges from its built artifact.**
   Signal: `verifyPackTrust(... { policy: "require_fingerprint" })`
   reports `fingerprint mismatch`. Treat as a security incident — the
   shipped artifact does not match the source.
3. **A Pack adds a basis code outside `BASIS_CODES`.** Signal: AJD-103
   (analyzer) plus `runConformance` AC-004 fails. The framework's
   basis vocabulary is closed at category level; new codes within a
   category are MINOR per `SEMVER_GOVERNANCE.md`. Custom codes belong in
   `Pack.basisCodes`, not silently injected.
4. **A Pack ships behaviour that diverges from replay history.** Signal:
   `classifyReplayDrift` reports `regressing` over a window of release
   tags. This is the load-bearing per-Pack health metric; CI gates that
   block merges on drift are the recommended mechanism.

---

## 8. Framework-side responsibilities

The framework commits to:

- Keep `validatePackManifest`, `runConformance`, `verifyPackTrust`, and
  `scorePackHealth` **pure and deterministic** for the life of the v1
  line.
- Keep the `PackManifest` schema **additive only** within v1.
- Keep `BASIS_CODES` **additive at code level**, and **closed at
  category level**, within v1.
- Document every breakage (and every deprecation calendar entry) in
  `docs/release/deprecations.md` and `docs/release/UPGRADE-PLAYBOOK.md`.
- Ship a codemod (`@adjudicate/migrate`) in the same release as any
  `@deprecated` marker.

The framework does NOT commit to:

- Maintain a hosted registry.
- Issue or distribute Pack-signing keys.
- Curate which Packs are visible to adopters.
- Rank or grade Pack authors.
- Operate a marketplace, payments rail, billing layer, or commercial
  reseller program.

---

## 9. How to think about "extension pressure"

Common requests that look like ecosystem improvements but should be
declined unless the four-property test in §1 is at risk:

| Request                                | Why decline (default) | Acceptable shape (if pressure persists)                                                              |
|---|---|---|
| Hosted Pack registry                   | Centralises distribution; violates §1.3. | A pluggable registry interface in `@adjudicate/conformance` so adopters can run their own.            |
| Framework-issued signing keys          | Centralises trust; violates §1.3.        | A trust-bundle helper that aggregates adopter-supplied roots.                                         |
| Framework-side Pack ranking            | Editorialises the ecosystem.             | Document `scorePackHealth` as the only ranking primitive; let adopters compose their own dashboards.   |
| YAML/JSON Pack DSL                     | Recreates the DSL-proliferation failure mode.| Refused without an ADR. `GuardMetadata` carries declarative content; Packs stay TypeScript.       |
| MCP-style Pack discovery protocol      | Reintroduces hosted indexer dependency.  | npm tag convention + `validatePackManifest` already covers the discovery side.                        |

---

## 10. Invariants

Ecosystem-side invariants the framework will not relax in the v1 line:

1. **No hidden network behaviour in any framework primitive.** Every
   call site is explicit; nothing phones home.
2. **No required cloud dependency.** A fully air-gapped install runs the
   kernel, the conformance harness, the analyzer, the migrate runner,
   and the CLI.
3. **No framework-owned namespace lockout.** Adopters publish under
   their own npm scope; the framework does not gatekeep `@adjudicate-*`.
4. **No silent Pack mutation.** Drift is detected, not hidden.
   `installPack` returns a wrapped Pack (`withBasisAudit`: a spread-copy
   whose guards are decorated by a basis-audit proxy) that *records*
   refusal-code / vocabulary / taint drift to the MetricsSink without
   altering any Decision; the wrapper is idempotent (the
   `BASIS_AUDIT_WRAPPED` tag makes a second pass a no-op). It is not
   `Object.freeze` — the framework relies on drift observability plus
   the trust primitives, not immutability, and ships no mutator in the
   public surface.
5. **No marketplace economics.** The framework does not collect rent on
   Pack distribution, install volume, or signing service.

---

## 11. Health-decay response

When `scorePackHealth` consistently returns `bronze` or `unrated` for a
Pack important to the adopter's operation:

1. Run `classifyReplayDrift` over the Pack's release tags. Is replay
   drift the cause?
2. Run `runConformance` on the latest version. Are any AC-001..AC-006
   invariants failing?
3. Run `analyzePolicy` with Tier 2 enabled. Are AJD-2NN AST checks
   failing?
4. If the Pack is third-party and unmaintained, fork. The framework's
   licence allows this; the ecosystem's decentralised shape requires
   adopters retain the option.
5. Optionally publish a `@deprecated`-marked fork pointing back to the
   original via `peerDependencies` (or migration codemod) so other
   adopters can find the maintained version.

The framework does not adjudicate fork disputes. The substrate is the
substrate; ecosystem governance is adopter governance.
