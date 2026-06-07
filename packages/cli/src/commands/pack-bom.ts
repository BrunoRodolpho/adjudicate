/**
 * `adjudicate pack bom` — emit an AI Bill-of-Materials for a Pack (ADR-127).
 *
 * Composes the conformance primitives (fingerprint + runConformance +
 * scorePackHealth) into a deterministic, EU-AI-Act/NIST-aligned manifest.
 */
import {
  computePackFingerprint,
  generateAiBom,
  runConformance,
  scorePackHealth,
  type PackFingerprintInput,
  type PackManifest,
} from "@adjudicate/conformance";
import type { PackV0 } from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface PackBomOptions {
  readonly pack: string;
  readonly kernelVersion?: string;
  readonly modelVersion?: string;
  readonly cwd?: string;
  readonly now?: () => string;
  readonly stdout?: (line: string) => void;
}

export async function runPackBom(options: PackBomOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const out = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date().toISOString());

  const pack = (await loadPackFromModule(options.pack, cwd)) as PackV0<string, unknown, unknown, unknown>;
  const fpInput: PackFingerprintInput = {
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents],
    ...(pack.signals ? { signals: [...pack.signals] } : {}),
    basisCodes: [...pack.basisCodes],
  };
  const conformance = runConformance(pack);
  const health = scorePackHealth({
    conformance,
    intentCount: pack.intents.length,
    signalCount: pack.signals?.length ?? 0,
    packId: pack.id,
  });
  const manifest: PackManifest = {
    contract: pack.contract === "v0" ? "v0" : "v1",
    packId: pack.id,
    kernelMinVersion: options.kernelVersion ?? ">=1 <2",
    intents: [...pack.intents],
    ...(pack.signals ? { signals: [...pack.signals] } : {}),
    ...(options.modelVersion !== undefined ? { modelVersion: options.modelVersion } : {}),
  };
  const bom = generateAiBom({
    pack: fpInput,
    manifest,
    conformance,
    health,
    generatedAt: now(),
    ...(options.kernelVersion !== undefined ? { kernelVersion: options.kernelVersion } : {}),
    ...(options.modelVersion !== undefined
      ? { model: { provider: "adopter", model: options.modelVersion } }
      : {}),
  });
  out(JSON.stringify(bom, null, 2));
  if (!conformance.passed) process.exitCode = 1;
}
