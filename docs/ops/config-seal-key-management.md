# Ops runbook: config-seal key management

> WS-A / ADR Appendix D. Covers generation, custody, distribution, rotation, and
> loss of the ed25519 keypair that signs the **config seal** — the tamper-evident
> fingerprint over a Pack's sealable surface (intents, basis codes, signals).

## What the seal protects

`sealPackConfig(surface, { privateKeyPem })` signs a digest of the Pack's
sealable surface. In the loop, `verifyConfigSeal(pack, seal, { publicKeyPem,
policy })` checks it:

- `policy: "require_digest"` — the digest must match (detects accidental drift).
- `policy: "require_signature"` — the digest must match **and** carry a valid
  signature under the trusted public key (detects tampering). Fail-closed.

> **Default note.** The seal default is `require_digest` for one deprecation
> release (decision L1); the breaking flip to `require_signature` +
> `engageKillSwitchOnMismatch` is **WS-A, deferred** until that release has
> shipped and adopters have migrated. This runbook is the prerequisite custody
> process for that flip — see also [kill-switch-recovery.md](./kill-switch-recovery.md).

## Generate

```bash
pnpm tsx scripts/gen-config-seal-key.ts --out ./.keys   # writes private/public PEM
# or print to stdout to pipe straight into a secret manager:
pnpm tsx scripts/gen-config-seal-key.ts
```

Produces an ed25519 keypair (PKCS#8 private / SPKI public PEM, the format
`sealPackConfig` / `verifyConfigSeal` expect).

## Custody (private key)

- The private key is **signing-key custody material**. Treat it like a release
  signing key.
- Store it in a secret manager (KMS / Vault / a sealed K8s secret) — **never** in
  the repo, an image, or CI logs. The `.keys/` output path above is git-ignored
  by convention; do not commit PEMs.
- Restrict signing to the release/build pipeline that produces the seal. Humans
  should not hold the raw private key; grant signing via the secret manager.
- Record an owner and an escrow location so a single departure cannot strand it.

## Distribution (public key)

- The public key is **not** secret. Distribute it to every verifier (each
  adopter loop that runs `verifyConfigSeal` with `publicKeyPem`).
- Pin it in the verifier's config/secret store, not fetched at runtime from an
  untrusted source (a swapped public key defeats the seal).
- Version the public key alongside the seal so a rotation is unambiguous.

## Rotation

1. Generate a new keypair (above).
2. Distribute the **new public key** to all verifiers and have them accept both
   the old and new key during the overlap window (dual-trust).
3. Re-sign and redeploy the seal with the **new private key**.
4. Once every verifier has the new public key and every fleet member runs the
   newly-signed seal, retire the old public key.
5. Revoke/destroy the old private key in the secret manager.

Rotate on a schedule and immediately on any suspected exposure. Because
verification is offline (no CRL/OCSP), rotation == redistribute-public-key +
re-sign; plan the overlap window so no verifier fail-closes mid-rotation.

## Loss / compromise

- **Lost private key (no compromise):** generate a new keypair, re-sign, rotate
  the public key. No tampering risk, but you cannot re-sign until replaced.
- **Compromised private key:** assume an attacker can forge a valid-looking seal.
  Rotate immediately, redistribute the new public key **first**, then re-sign;
  treat any seal signed in the exposure window as untrusted and re-verify the
  deployed surface out-of-band.
- **Lost public key:** non-secret — regenerate/redistribute from the private key
  or the keypair record; no compromise.

## Determinism boundary

Key material and signing live **outside** the kernel determinism boundary: the
seal is verified at load, never inside `adjudicate()`, and key handling never
touches `intentHash` / policy / state. Losing or rotating keys is an operational
event, not a replay-determinism one.
