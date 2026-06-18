import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import {
  computeConfigDigest,
  computePackFingerprint,
  extractSealableSurface,
  validatePackManifest,
  verifyPackTrust,
  type PackSignature,
  type PackSignatureAlgorithm,
  type SealablePackInput,
  type TrustPolicy,
} from "@adjudicate/conformance";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface PackVerifyOptions {
  readonly cwd?: string;
  /** Expected SHA-256 hex fingerprint. When supplied, mismatch fails. */
  readonly expect?: string;
  /**
   * Expected SHA-256 hex of the ConfigSeal sealable surface (081). When
   * supplied, the command re-extracts the live pack's *extended* surface —
   * which now binds per-guard CODE artifacts (closure-captured caps +
   * predicate bodies), not just declared metadata — and fails on mismatch.
   * This is what catches a behavior-changing edit to a guard's closure cap
   * that the fingerprint (declarative subset only) cannot see.
   */
  readonly expectSeal?: string;
  /** Path to a PEM-encoded public key. */
  readonly publicKey?: string;
  /** Path to a JSON file containing the signature. */
  readonly signature?: string;
  /** Trust policy. */
  readonly policy?: TrustPolicy;
  /** When set, prints the fingerprint as the only stdout line (script-friendly). */
  readonly quiet?: boolean;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

interface SignatureFile {
  readonly algorithm: PackSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

/**
 * `pack verify` — install-time Pack trust verification.
 *
 * Composes (a) manifest validation, (b) fingerprint computation, and
 * (c) optional signature verification into a single command operators
 * run before installing a community Pack.
 *
 * Exit code:
 *   - 0 when the pack passes the trust policy
 *   - 1 when any axis fails OR the trust policy is not satisfiable
 *
 * Wirings:
 *   adjudicate pack verify              # local dev — fingerprint only
 *   adjudicate pack verify --expect <hex>           # CI gate
 *   adjudicate pack verify --public-key <pem> --signature <json> --policy require_signature   # prod
 */
export async function runPackVerify(
  packPath?: string,
  options: PackVerifyOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const packDir = path.resolve(cwd, packPath ?? ".");
  const indexPath = path.join(packDir, "src", "index.ts");
  const packageJsonPath = path.join(packDir, "package.json");

  if (!(await fileExists(indexPath))) {
    console.error(
      chalk.red("✗"),
      `No src/index.ts found at ${chalk.bold(packDir)}`,
    );
    process.exit(1);
  }

  // 1. Load + validate manifest (only when the adjudicate field is present;
  //    workspace Packs predate the manifest convention so we don't punish them).
  let pkgJson: unknown;
  if (await fileExists(packageJsonPath)) {
    try {
      pkgJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(chalk.red("✗"), `Failed to parse package.json: ${e.message}`);
      process.exit(1);
    }
    const hasManifestField =
      pkgJson !== null &&
      typeof pkgJson === "object" &&
      "adjudicate" in (pkgJson as Record<string, unknown>);
    if (hasManifestField) {
      const validation = validatePackManifest(pkgJson);
      if (!validation.ok) {
        console.error(chalk.red("✗"), "Pack manifest validation failed:");
        for (const err of validation.errors) {
          console.error(chalk.dim(`  - ${err}`));
        }
        process.exit(1);
      }
    }
  }

  // 2. Load the Pack module.
  let pack: unknown;
  try {
    pack = await loadPackFromModule(indexPath, cwd);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red("✗"), `Failed to import ${indexPath}: ${e.message}`);
    process.exit(1);
  }
  if (!pack || typeof pack !== "object") {
    console.error(chalk.red("✗"), `No Pack export found in ${indexPath}.`);
    process.exit(1);
  }

  const p = pack as {
    id: string;
    version: string;
    contract: string;
    intents: ReadonlyArray<string>;
    signals?: ReadonlyArray<string>;
    basisCodes?: ReadonlyArray<string>;
    policy?: SealablePackInput["policy"];
  };

  // 3a. Optional ConfigSeal verification over the EXTENDED surface (081). The
  //     fingerprint above pins only the declarative subset; the config-seal
  //     digest additionally binds per-guard CODE artifacts, so this is the
  //     axis that catches a closure-captured cap edit. Requires `policy` on the
  //     loaded pack (every PackV0 carries it).
  let sealDigest: string | undefined;
  let sealMatch: "match" | "mismatch" | undefined;
  if (options.expectSeal !== undefined) {
    if (p.policy === undefined) {
      console.error(
        chalk.red("✗"),
        "--expect-seal requires a Pack that exposes `policy` (PackV0 shape).",
      );
      process.exit(1);
    }
    const surface = extractSealableSurface({
      id: p.id,
      version: p.version,
      contract: p.contract,
      intents: p.intents,
      ...(p.signals !== undefined ? { signals: p.signals } : {}),
      ...(p.basisCodes !== undefined ? { basisCodes: p.basisCodes } : {}),
      policy: p.policy,
    });
    sealDigest = computeConfigDigest(surface);
    sealMatch = sealDigest === options.expectSeal ? "match" : "mismatch";
  }

  // 3. Trust verification.
  let signature: PackSignature | undefined;
  if (options.signature) {
    const sigPath = path.resolve(cwd, options.signature);
    try {
      const raw = await fs.readFile(sigPath, "utf-8");
      const parsed = JSON.parse(raw) as SignatureFile;
      if (
        typeof parsed.algorithm !== "string" ||
        typeof parsed.keyId !== "string" ||
        typeof parsed.value !== "string"
      ) {
        throw new Error(
          'signature file must contain { "algorithm", "keyId", "value": "<base64>" }',
        );
      }
      signature = parsed;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(chalk.red("✗"), `Failed to load signature: ${e.message}`);
      process.exit(1);
    }
  }

  let publicKeyPem: string | undefined;
  if (options.publicKey) {
    const keyPath = path.resolve(cwd, options.publicKey);
    try {
      publicKeyPem = await fs.readFile(keyPath, "utf-8");
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(chalk.red("✗"), `Failed to read public key: ${e.message}`);
      process.exit(1);
    }
  }

  const report = verifyPackTrust({
    pack: p,
    expectedFingerprint: options.expect,
    publicKeyPem,
    signature,
    policy: options.policy ?? "best_effort",
  });

  if (options.quiet) {
    if (!report.trusted || sealMatch === "mismatch") process.exit(1);
    process.stdout.write(report.fingerprint + "\n");
    return;
  }

  console.log(chalk.bold("Pack:"), p.id, chalk.dim(`v${p.version}`));
  console.log(chalk.bold("Fingerprint:"), report.fingerprint);
  if (report.fingerprintMatch === "match") {
    console.log(chalk.green("✓"), "expected fingerprint matches");
  } else if (report.fingerprintMatch === "mismatch") {
    console.log(chalk.red("✗"), "expected fingerprint MISMATCH");
  }
  if (sealDigest !== undefined) {
    console.log(chalk.bold("Config seal:"), sealDigest);
    if (sealMatch === "match") {
      console.log(chalk.green("✓"), "expected config seal matches (guard code bodies pinned)");
    } else {
      console.log(chalk.red("✗"), "expected config seal MISMATCH (guard code or config drifted)");
    }
  }
  if (report.signatureVerification?.verified === true) {
    console.log(chalk.green("✓"), "signature verified");
  } else if (report.signatureVerification?.verified === false) {
    console.log(
      chalk.red("✗"),
      `signature verification failed: ${report.signatureVerification.reason}`,
    );
  }
  if (!report.trusted || sealMatch === "mismatch") {
    for (const e of report.errors) console.error(chalk.dim(`  - ${e}`));
    if (sealMatch === "mismatch") {
      console.error(
        chalk.dim(`  - config seal mismatch: expected ${options.expectSeal}, got ${sealDigest}`),
      );
    }
    process.exit(1);
  }
  console.log(chalk.green("✓"), "trust policy satisfied");
}

// Re-export TrustPolicy for parser usage in bin.ts.
export type { TrustPolicy } from "@adjudicate/conformance";
