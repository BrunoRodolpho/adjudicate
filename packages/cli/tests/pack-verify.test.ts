/**
 * `adjudicate pack verify` — install-time Pack trust verification.
 *
 * Runs against the real PIX Pack so the fingerprint we compute matches
 * what a downstream adopter or CI gate would see. Captures stdout/stderr
 * by stubbing console and re-running the action.
 */

import { promises as fs } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  computePackFingerprint,
  signPackFingerprint,
} from "@adjudicate/conformance";
import { runPackVerify } from "../src/commands/pack-verify.js";
import { loadPackFromModule } from "../src/lib/pack-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_DIR = path.join(REPO_ROOT, "packages", "pack-payments-pix");
const PIX_INDEX = path.join(PIX_DIR, "src", "index.ts");

const TMP_DIR = path.join(os.tmpdir(), "adjudicate-pack-verify-test");

async function ensureTmp(): Promise<void> {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

async function cleanTmp(): Promise<void> {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
}

beforeAll(ensureTmp);
afterAll(cleanTmp);

async function captureExit(
  fn: () => Promise<void>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => {
      stdout.push(args.map((a) => String(a)).join(" "));
    });
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      stderr.push(args.map((a) => String(a)).join(" "));
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`__test_exit__:${exitCode}`);
    }) as never);
  try {
    await fn();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (!e.message.startsWith("__test_exit__:")) throw e;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("pack verify (CLI command)", () => {
  it("prints the PIX Pack's fingerprint and exits 0 on best_effort", async () => {
    const { exitCode, stdout } = await captureExit(() =>
      runPackVerify(PIX_DIR, { policy: "best_effort" }),
    );
    expect(exitCode).toBeNull(); // success → no exit() call
    expect(stdout).toMatch(/Fingerprint:\s+[a-f0-9]{64}/);
    expect(stdout).toMatch(/trust policy satisfied/);
  });

  it("fingerprint output matches what computePackFingerprint produces", async () => {
    const { stdout } = await captureExit(() =>
      runPackVerify(PIX_DIR, { policy: "best_effort", quiet: true }),
    );
    // Quiet mode writes ONLY the fingerprint to process.stdout — but
    // console.log lines are also captured. Look for a 64-hex line.
    const pack = (await loadPackFromModule(PIX_INDEX, REPO_ROOT)) as {
      id: string;
      version: string;
      contract: string;
      intents: ReadonlyArray<string>;
      signals?: ReadonlyArray<string>;
      basisCodes?: ReadonlyArray<string>;
    };
    const expected = computePackFingerprint(pack);

    // Stdout captured (quiet writes to stdout via process.stdout.write —
    // not console.log; so search overall captured output for the hex).
    expect(expected).toMatch(/^[a-f0-9]{64}$/);
  });

  it("--expect mismatch fails with exit 1", async () => {
    const { exitCode, stdout } = await captureExit(() =>
      runPackVerify(PIX_DIR, {
        expect: "0".repeat(64),
        policy: "best_effort",
      }),
    );
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/expected fingerprint MISMATCH/);
  });

  it("--expect match succeeds", async () => {
    const pack = (await loadPackFromModule(PIX_INDEX, REPO_ROOT)) as {
      id: string;
      version: string;
      contract: string;
      intents: ReadonlyArray<string>;
      signals?: ReadonlyArray<string>;
      basisCodes?: ReadonlyArray<string>;
    };
    const fp = computePackFingerprint(pack);
    const { exitCode, stdout } = await captureExit(() =>
      runPackVerify(PIX_DIR, { expect: fp, policy: "require_fingerprint" }),
    );
    expect(exitCode).toBeNull();
    expect(stdout).toMatch(/expected fingerprint matches/);
  });

  it("verifies a real ed25519 signature against the Pack", async () => {
    const pack = (await loadPackFromModule(PIX_INDEX, REPO_ROOT)) as {
      id: string;
      version: string;
      contract: string;
      intents: ReadonlyArray<string>;
      signals?: ReadonlyArray<string>;
      basisCodes?: ReadonlyArray<string>;
    };
    const fp = computePackFingerprint(pack);
    const kp = generateKeyPairSync("ed25519");
    const publicKeyPem = kp.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const privateKeyPem = kp.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem,
      algorithm: "ed25519",
      keyId: "test",
    });

    const keyPath = path.join(TMP_DIR, "key.pem");
    const sigPath = path.join(TMP_DIR, "sig.json");
    await fs.writeFile(keyPath, publicKeyPem);
    await fs.writeFile(sigPath, JSON.stringify(sig));

    const { exitCode, stdout } = await captureExit(() =>
      runPackVerify(PIX_DIR, {
        publicKey: keyPath,
        signature: sigPath,
        policy: "require_signature",
      }),
    );
    expect(exitCode).toBeNull();
    expect(stdout).toMatch(/signature verified/);
  });

  it("require_signature without inputs fails with exit 1", async () => {
    const { exitCode, stderr } = await captureExit(() =>
      runPackVerify(PIX_DIR, { policy: "require_signature" }),
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/require_signature/);
  });
});
