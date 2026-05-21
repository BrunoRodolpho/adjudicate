# Pack Signing — Design Document

> Status: **Design only.** Implementation deferred to post-v1.0. This
> document locks the approach so subsequent ADRs build on a shared
> baseline.

## Goals

1. **Tamper detection**: an adopter who `npm install`s a Pack version
   should be able to verify the tarball matches what the maintainer
   published.
2. **Provenance**: the signature should bind the tarball to a specific
   maintainer identity (or org) at a specific point in time, with
   transparency-log presence.
3. **Adopter-friendly verification**: `adjudicate pack verify <pkg>`
   runs locally without infrastructure setup.
4. **Backwards compatibility**: unsigned Packs continue to work
   (Bronze tier); signing is a Silver+ requirement.

## Approach: Sigstore + npm provenance

The framework first-party packages already use Sigstore via the
T-017/T-018 release workflow. Community Packs adopt the same primitives:

1. **Sigstore cosign** signs the tarball using OIDC-issued ephemeral
   keys (GitHub Actions OIDC, GitLab CI OIDC, etc.).
2. **npm provenance attestations** (in-toto) record the build
   provenance: which CI runner produced this tarball from which commit.
3. **Transparency log** (Rekor) records every signing event publicly.

This combination — npm provenance + Sigstore signature + Rekor log
entry — is the same package-supply-chain discipline used by SLSA Level
3+.

## Pack-author workflow

```yaml
# .github/workflows/release.yml — community Pack template

name: Release Pack

on:
  push:
    tags: ["v*"]

permissions:
  contents: read
  id-token: write       # OIDC for npm provenance + cosign
  attestations: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm lint
      - run: pnpm test

      # Validate against framework conformance
      - run: pnpm dlx @adjudicate/cli pack lint --strict
      - run: pnpm dlx @adjudicate/cli analyze --strict

      # npm publish with provenance
      - run: pnpm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Cosign signs the published tarball
      - uses: sigstore/cosign-installer@v3
      - run: |
          npm pack
          cosign sign-blob --yes \
            --output-signature pack-${{ github.ref_name }}.sig \
            --output-certificate pack-${{ github.ref_name }}.crt \
            *.tgz
```

The Sigstore signing step records a Rekor log entry. The signature
URL is then added to `package.json` `adjudicate.signed.sigstore`.

## Adopter verification

```bash
# Verify all Packs in your project's dependency tree:
adjudicate pack verify

# Verify a specific package version:
adjudicate pack verify @adjudicate-community/pack-stripe@0.4.2
```

The CLI:

1. Reads `package.json` `adjudicate.signed.sigstore` URL.
2. Fetches the Rekor log entry and the Sigstore certificate.
3. Verifies the signature against the npm tarball hash.
4. Verifies the certificate's OIDC issuer matches the org's declared
   maintainer (registry-side allowlist).
5. Returns exit code 0 if verified, 1 if signature missing, 2 if
   tamper detected.

## Failure modes

- **Signature missing**: `verify` exits 1; CI gates can block adoption.
- **Signature present but invalid**: `verify` exits 2; loud failure
  with the Rekor URL for investigation.
- **OIDC issuer mismatch** (e.g., a malicious actor publishes a Pack
  under a different GitHub account but same npm name): `verify` exits 2
  with the mismatch detail.

## Trust anchors

- Sigstore root keys: rotated per Sigstore project schedule.
- Rekor instance: `rekor.sigstore.dev` (public good infrastructure).
- npm registry: `registry.npmjs.org` (the canonical distribution
  substrate; the registry's own keys are trusted by `npm install`).
- Framework certificate authority: NONE — framework does not introduce
  its own CA. All trust flows through Sigstore + npm + the OIDC
  issuer (typically GitHub).

## When this implements

- v1.0: Sigstore signing optional for community Packs (Silver tier
  requirement).
- v1.1: `adjudicate pack verify` CLI command lands.
- v1.2: Registry surfaces verified-yes/no badge based on Sigstore
  presence + valid Rekor log entry.
- post-v1.x: framework first-party Packs ship verifying signatures by
  default on install.

## Out of scope for this design

- Encryption of Pack source (Packs are open-source by convention).
- Air-gapped verification (requires Rekor mirror — defer to v2.x).
- Multi-signature (M-of-N maintainer signatures) — not needed at
  current adoption scale.
- TUF (The Update Framework) — Sigstore covers our threat model
  without TUF's additional complexity.
