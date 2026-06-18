/**
 * gen-config-seal-key — generate an ed25519 keypair (PEM) for config-seal signing.
 *
 *   pnpm tsx scripts/gen-config-seal-key.ts            # print both PEMs to stdout
 *   pnpm tsx scripts/gen-config-seal-key.ts --out ./keys   # write key files
 *
 * The PRIVATE key signs the config seal at build/deploy time
 * (`sealPackConfig(surface, { privateKeyPem })`); the PUBLIC key verifies it in
 * the loop (`verifyConfigSeal(..., { publicKeyPem, policy: "require_signature" })`).
 *
 * SECURITY: the private key is signing-key custody material. NEVER commit it.
 * Store it in your secret manager (KMS / Vault / sealed secret); distribute only
 * the PUBLIC key to verifiers. See docs/ops/config-seal-key-management.md.
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

function parseOutDir(argv: readonly string[]): string | undefined {
  const i = argv.indexOf("--out");
  return i >= 0 ? argv[i + 1] : undefined;
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const outDir = parseOutDir(process.argv.slice(2));
if (outDir !== undefined) {
  mkdirSync(outDir, { recursive: true });
  const priv = path.join(outDir, "config-seal.private.pem");
  const pub = path.join(outDir, "config-seal.public.pem");
  // Private key 0600: owner read/write only.
  writeFileSync(priv, privateKey, { mode: 0o600 });
  writeFileSync(pub, publicKey, { mode: 0o644 });
  process.stdout.write(
    `Wrote:\n  ${priv}  (PRIVATE — do not commit; move to your secret manager)\n  ${pub}  (PUBLIC — distribute to verifiers)\n`,
  );
} else {
  process.stdout.write(
    `# ed25519 config-seal keypair (algorithm: "ed25519")\n` +
      `# PRIVATE KEY — signing-key custody material; NEVER commit. Store in a secret manager.\n` +
      `${privateKey}\n` +
      `# PUBLIC KEY — distribute to verifiers (verifyConfigSeal publicKeyPem).\n` +
      `${publicKey}\n`,
  );
}
