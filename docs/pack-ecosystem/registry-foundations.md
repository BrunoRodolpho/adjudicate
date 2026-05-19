# Pack Registry Foundations

> Status: **v0.3.0 — npm-conventions phase.** The dedicated registry
> ships post-v1.0. v0.3-v0.5 use npm + a thin `registry.adjudicate.io`
> reverse proxy that indexes Packs published under the `@adjudicate-community/*`
> npm org and validates their `package.json` `adjudicate` field.

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
   semver range matching `Pack.kernelMinVersion`.

## The `adjudicate` field schema

```jsonc
{
  "name": "@adjudicate-community/pack-acme-refunds",
  "version": "0.4.2",
  "type": "module",
  "adjudicate": {
    "contract": "v1",
    "packId": "@acme/refunds",
    "kernelMinVersion": ">=0.3 <2",
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
    "@adjudicate/core": ">=0.3 <2"
  }
}
```

### Field semantics

- **`contract`**: `"v0"` or `"v1"`. v1 packs declare `version` + `kernelMinVersion`.
- **`packId`**: stable string identifier used in audit records and replay registries. NOT the npm package name (which can be renamed); the `packId` is the immutable handle for an "AuditRecord.policyVersion @ packId" pair.
- **`kernelMinVersion`**: semver range against `@adjudicate/core`.
- **`intents`**: enumeration of intent-kind strings the Pack handles. Adopter tooling validates this matches the IntentEnvelope's `kind` at install time.
- **`signals`**: enumeration of DEFER signals the Pack parks on. Cross-checked against actual `decisionDefer` calls by the M2 analyzer (AJD-102).
- **`qualityTier`**: self-declared Bronze/Silver; Gold is reviewed.
- **`docs`**: URL to the Pack's documentation.
- **`compatibility.adapters`**: array of adapter semver ranges this Pack is known compatible with.
- **`signed.sigstore`**: URL into a Sigstore transparency log for the signed release.

## Discovery: `registry.adjudicate.io` (post-v0.3)

The registry is a static-site reverse proxy over npm:

```
GET registry.adjudicate.io/packs/@acme/refunds
→ {
    versions: [...],
    latestStableTier: "silver",
    publisher: "@adjudicate-community",
    homepage: "https://github.com/acme/adjudicate-pack-refunds",
    weeklyDownloads: 1247,
    lastPublished: "2026-04-21T10:14:22Z"
  }

GET registry.adjudicate.io/packs?tier=silver+&signal=payment.confirmed
→ filtered listing
```

The registry runs `adjudicate pack lint --strict` against each published
version (via a webhook on npm publish) and stores the computed tier.

## Discovery: pre-v0.3 (npm-only)

Until the dedicated registry is live, adopters discover Packs via:

- `npm search @adjudicate-community`
- The framework's published catalog at `adjudicate.io/packs` (manually
  curated).
- GitHub topic `adjudicate-pack` for community-published Packs in
  other orgs.

## Pack signing (design preview)

T-039 (this milestone) ships the design; implementation lands post-v1.0:

1. Pack author runs `pnpm release` (per their own release toolchain).
2. CI workflow (template provided) runs `cosign sign-blob` over the
   published tarball using OIDC-issued ephemeral keys.
3. Signature URL written into `package.json` `adjudicate.signed.sigstore`.
4. Registry verifies the signature on indexing; surfaces `verified: true`
   to adopters.
5. Adopter CLI can run `adjudicate pack verify <package>` to verify
   locally before install.

The same model (Sigstore + OIDC + transparency log) used by
`@adjudicate/*` first-party releases (T-017) applies to community Packs.

## Naming conventions

- Org: `@adjudicate-community` for community-maintained; `@adjudicate` for first-party.
- Package: `pack-<domain>` for Packs. (`pack-payments-pix`, `pack-identity-kyc`.)
- Pack ID: `@<org>/<domain>` short form (e.g., `@acme/refunds`).

## Compatibility against multiple kernel versions

A Pack declares one `kernelMinVersion` range. Adopters using a kernel
outside the range get a boot-time `PackConformanceError` (via
`assertPackConformance`). Adopters needing to support multiple
kernel-major versions ship parallel Pack versions:

- `@acme/refunds@1.x` — kernels `>=0.3 <1`
- `@acme/refunds@2.x` — kernels `>=1 <2`

## When this evolves

- v0.4: registry static-site live for community discovery.
- v0.5: signing workflow shipped (Sigstore + OIDC).
- v1.0: dedicated registry with full tier-computation pipeline; npm
  remains the distribution substrate (single source of truth).
- post-v1.0: marketplace UI (browseable web app).
