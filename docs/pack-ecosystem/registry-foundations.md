# Pack Registry Foundations

> Status: **npm-conventions phase** (core `@adjudicate/core` v1.3.0).
> Packs are distributed as ordinary npm packages today. A dedicated
> registry — a thin `registry.adjudicate.io` reverse proxy that indexes
> Packs published under the `@adjudicate-community/*` npm org and
> validates their `package.json` `adjudicate` field — is still design-only.
> This doc is the canonical home for the npm convention; the manifest
> schema is enforced in code by `validatePackManifest`
> (`packages/conformance/src/manifest.ts`).

## npm convention

A community Pack is an npm package satisfying ALL of:

1. **Package name.** Under the `@adjudicate-community/*` org OR another
   org that lists `adjudicate-pack` in its npm `keywords`.
2. **Type.** ESM (`"type": "module"`).
3. **Adjudicate metadata.** A top-level `"adjudicate"` field in
   `package.json` (schema below).
4. **Default export.** Exports a `Pack<...>` object via the default
   export. Adopters typically also export it named (e.g.,
   `export const myPack = { ... }`).
5. **Peer dependency.** `@adjudicate/core` listed as a peer dep with a
   semver range matching `Pack.kernelMinVersion`. `validatePackManifest`
   errors if it is missing or disagrees with `kernelMinVersion`.

## The `adjudicate` field schema

```jsonc
{
  "name": "@adjudicate-community/pack-acme-refunds",
  "version": "1.2.0",
  "type": "module",
  "adjudicate": {
    "contract": "v1",
    "packId": "@acme/refunds",
    "kernelMinVersion": ">=1 <2",
    "intents": [
      "acme.refund.request",
      "acme.refund.approve"
    ],
    "signals": ["acme.refund.review_complete"],
    "qualityTier": "silver",
    "docs": "https://docs.acme.io/refunds-pack",
    "compatibility": {
      "adapters": [
        "@adjudicate/anthropic@>=0.4"
      ]
    },
    "signed": {
      "sigstore": "https://search.sigstore.dev/?logIndex=..."
    }
  },
  "peerDependencies": {
    "@adjudicate/core": ">=1 <2"
  }
}
```

### Field semantics

- **`contract`**: `"v0"` or `"v1"`. v1 packs declare `version` + `kernelMinVersion`.
- **`packId`**: stable string identifier used in audit records and replay registries. NOT the npm package name (which can be renamed); the `packId` is the immutable handle for an "AuditRecord.policyVersion @ packId" pair.
- **`kernelMinVersion`**: semver range against `@adjudicate/core`. CLI/tests default to `>=1 <2` for the v1 kernel.
- **`intents`**: enumeration of intent-kind strings the Pack handles. Adopter tooling validates this matches the IntentEnvelope's `kind` at install time.
- **`signals`**: enumeration of DEFER signals the Pack parks on. Cross-checked against the signal declared on DEFER guards (the `GuardMetadata.description.signal` of `state_defer` guards) by the M2 SignalConsistencyAnalyzer (AJD-102, `packages/analyze/src/analyzers.ts`).
- **`qualityTier`**: self-declared Bronze/Silver; Gold is reviewed.
- **`docs`**: URL to the Pack's documentation.
- **`compatibility.adapters`**: array of adapter semver ranges this Pack is known compatible with.
- **`signed.sigstore`**: URL into a Sigstore transparency log for the signed release.

> **AI-BOM fields (ADR-127).** `PackManifest` also carries additive,
> optional, author-declared AI-BOM metadata: `modelVersion`,
> `promptHashes`, `tools`, `rag`. They are omitted above to keep the
> distribution example small; the source of truth for their shape is the
> `PackManifest` type in `packages/conformance/src/manifest.ts`.

## Discovery

The dedicated registry (`registry.adjudicate.io`) is a planned static-site
reverse proxy over npm: it would index published versions, run
`adjudicate pack lint --strict` on each publish via webhook, and surface
the computed quality tier and a verification flag. Until it is live,
adopters discover Packs via:

- `npm search @adjudicate-community`
- The framework's published catalog at `adjudicate.io/packs` (manually
  curated).
- GitHub topic `adjudicate-pack` for community-published Packs in
  other orgs.

## Pack verification and signing

**Verification ships today.** `adjudicate pack verify`
(`packages/cli/src/commands/pack-verify.ts`, `runPackVerify`) composes,
in one install-time command:

1. **Manifest validation** — `validatePackManifest` against the
   `adjudicate` field (skipped for workspace Packs that predate the
   convention).
2. **Fingerprint** — `computePackFingerprint`; `--expect <hex>` fails on
   mismatch (CI gate).
3. **Optional signature verification** — `--public-key <pem>
   --signature <json>` under a `--policy` (`best_effort` /
   `require_signature`), evaluated by `verifyPackTrust`.

```
adjudicate pack verify                                   # local — fingerprint only
adjudicate pack verify --expect <hex>                    # CI gate
adjudicate pack verify --public-key <pem> --signature <json> --policy require_signature   # prod
```

The signing/verifying crypto primitive (`signPackFingerprint` /
`verifyPackSignature`, ed25519 + rsa-pss-sha256) also exists in
`packages/conformance/src/pack-trust.ts`.

**Design-only:** the *publish-side* cosign/sigstore pipeline that would
populate `adjudicate.signed.sigstore` (CI runs `cosign sign-blob` over the
tarball with OIDC-issued ephemeral keys; the registry verifies on
indexing). No cosign/sigstore implementation exists in the CLI or
conformance package yet — only the manifest field that records the
resulting transparency-log URL.

## Naming conventions

- Org: `@adjudicate-community` for community-maintained; `@adjudicate` for first-party.
- Package: `pack-<domain>` for Packs. (`pack-payments-pix`, `pack-identity-kyc`.)
- Pack ID: `@<org>/<domain>` short form (e.g., `@acme/refunds`).

## Compatibility against multiple kernel versions

A Pack declares one `kernelMinVersion` range. Adopters running a kernel
outside the range get a boot-time `PackConformanceError` (via
`assertPackConformance`). Adopters needing to support multiple
kernel-major versions ship parallel Pack versions, each pinning its range:

- `@acme/refunds@1.x` — kernels `>=1 <2`
- `@acme/refunds@2.x` — kernels `>=2 <3`
