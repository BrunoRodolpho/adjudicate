# ADR-115 — Pack trust primitives: fingerprinting + signature verification

- **Status:** Accepted
- **Date:** 2026-05-20
- **Scope:** `@adjudicate/conformance` (pack-trust primitives), `@adjudicate/cli` (`pack verify`)
- **Related:** ADR-110 (conformance package), `docs/pack-ecosystem/registry-foundations.md`, `docs/pack-ecosystem/signing-design.md`

## Context

The Pack ecosystem has three trust-shaped primitives in v0.6:

1. `validatePackManifest` — checks that `package.json.adjudicate` is well-formed.
2. `crossCheckPackVsManifest` — checks live Pack ↔ manifest agreement.
3. `runConformance(pack)` — checks runtime invariants (taint, replay, basis vocabulary, etc.).

Missing: a primitive that answers *"is this specific Pack the one I (or the publisher) signed off on?"* — the question every adopter installing a third-party Pack from npm needs to answer before wiring it into a control plane.

The `docs/pack-ecosystem/signing-design.md` design describes Sigstore + OIDC + Rekor — appropriate for a hosted registry. We don't have a hosted registry; we have npm. The simpler primitive is local, deterministic, and uses standard Node `crypto`. Adopters who want Sigstore later can layer it on top.

## Decision

Ship three pure functions in `@adjudicate/conformance` and one CLI command in `@adjudicate/cli`:

1. **`computePackFingerprint(pack)`** — returns `sha256(canonical-JSON over (id, version, contract, intents, signals, basisCodes))`. The "declarative subset" — the part a reviewer reads without executing code. Excludes `policy`, `planner`, `handlers` (function references can't be hashed deterministically).

2. **`signPackFingerprint({ fingerprint, privateKeyPem, algorithm, keyId })`** — ed25519 or RSA-PSS over the fingerprint. Returns `{ algorithm, keyId, value: base64 }`. Uses `node:crypto`. Pure — no key fetching, no remote calls.

3. **`verifyPackSignature({ fingerprint, signature, publicKeyPem })`** — verifies. Returns `{ verified: true } | { verified: false, reason }`. Detects cross-algorithm misuse (signing with ed25519, verifying with an RSA key) as its own reason.

4. **`verifyPackTrust(opts)`** — composite. Combines fingerprint comparison, signature verification, and a `TrustPolicy` (`none | best_effort | require_fingerprint | require_signature`). Returns a structured `PackTrustReport` operators render or gate on.

5. **CLI: `adjudicate pack verify [path]`** — install-time wrapper around `verifyPackTrust`. Supports `--expect <hex>`, `--public-key <pem>`, `--signature <json>`, `--policy <policy>`, `--quiet`. Exits 0 on trust, 1 on failure.

## Why this shape

- **Pure functions in conformance, side effects in CLI.** Same separation as `validatePackManifest`. Adopters compose the primitives into install hooks, CI gates, or admin endpoints; the framework does not assume a delivery channel.

- **Fingerprint covers DECLARATIVE surface, not BEHAVIOR.** Behavior is what `runConformance` is for. Two Packs with the same fingerprint declare the same intents/signals/basisCodes — they may implement them differently. Pairing fingerprint + conformance gives both axes.

- **Asymmetric signatures only.** Symmetric MACs would require shared secrets, which don't generalize across publisher/consumer boundaries. Ed25519 (RFC 8032) is the recommended default; RSA-PSS is supported for environments without ed25519.

- **No hosted registry, no Sigstore lock-in.** The primitives are local. Adopters with a hosted registry layer Sigstore/Rekor on top by mapping their attestation format to `PackSignature`. The framework stays small.

- **`TrustPolicy` enum is closed.** Four values match the actual deployment shapes (dev / CI gate / publisher-signed / belt-and-suspenders). An open `policy: { fingerprint: required, signature: optional, ... }` would invite adopter-specific divergence.

## Stability across builds

The fingerprint is invariant under re-bundling. esbuild vs tsc, minification on/off, source-map placement — none of these affect `(id, version, contract, intents, signals, basisCodes)`. The fingerprint a publisher signs at build time matches the fingerprint an adopter computes at install time, as long as the declarative surface didn't change.

## Invariants preserved

- **Closed Decision algebra.** Trust is a deploy-time concern; nothing here touches the kernel's six decisions.
- **Pure functions.** Fingerprint + sign + verify are deterministic. Same inputs → same outputs.
- **Replay determinism.** Trust verification runs at install/CI, not at adjudication. Kernel inputs unchanged.
- **No new wire-format changes.** Fingerprint format is local; signature format is data-shaped (JSON). Neither leaks into the audit record or the envelope.

## Alternatives considered

- **PGP / GPG signatures over the npm tarball.** Rejected: ties trust to tarball bytes, which churn on re-publish. Fingerprinting the declarative surface decouples trust from packaging.
- **Hash over the full Pack module bytes.** Rejected: function-bodies differ across bundlers; would force adopters to re-sign on every build.
- **Centralized signing service.** Rejected: the framework is local-first. Hosting a service is an adopter concern.
- **Embed signatures in `package.json`.** Considered: `package.json.adjudicate.signature` would be ergonomic, but binds the signature to npm's metadata model and complicates re-signing. The `--signature <json-path>` external file is simpler.

## Test coverage

`packages/conformance/tests/pack-trust.test.ts` covers:
- Fingerprint determinism + key-order independence
- ed25519 + RSA-PSS sign/verify round-trips
- Tamper detection
- Cross-algorithm misuse detection
- All four `TrustPolicy` modes
- Compound failure (fingerprint AND signature both bad)

`packages/cli/tests/pack-verify.test.ts` covers the CLI surface end-to-end against the real PIX Pack.

## Adopter usage

```ts
import {
  computePackFingerprint,
  verifyPackTrust,
} from "@adjudicate/conformance";
import { myPack } from "./my-pack";

// CI gate: pin the declarative surface
const report = verifyPackTrust({
  pack: myPack,
  expectedFingerprint: "abc...",   // committed to your repo
  policy: "require_fingerprint",
});
if (!report.trusted) process.exit(1);
```

```bash
# Local dev: just see the fingerprint
adjudicate pack verify ./packages/my-pack

# Prod: require the publisher's signature
adjudicate pack verify ./node_modules/@vendor/pack-x \
  --public-key ./trust/vendor.pem \
  --signature  ./trust/vendor-pack-x.sig.json \
  --policy require_signature
```
