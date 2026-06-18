import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";
import { createRewriteGuard } from "@adjudicate/primitives";
import {
  computeConfigDigest,
  extractSealableSurface,
  sealPackConfig,
  verifyConfigSeal,
  type SealablePackInput,
} from "../src/config-seal.js";

function makePack(opts: { systemOnlyKinds?: string[]; threshold?: number } = {}): SealablePackInput {
  const systemOnly = new Set(opts.systemOnlyKinds ?? ["x.webhook"]);
  const guard = withMetadata(
    function thresholdGuard(): null {
      return null;
    } as Guard<string, unknown, unknown>,
    {
      name: "thresholdGuard",
      description: { kind: "threshold", threshold: opts.threshold ?? 100, comparator: ">=" },
    },
  );
  return {
    id: "pack-seal-test",
    version: "1.0.0",
    contract: "v0",
    intents: ["x.create", "x.webhook"],
    signals: ["x.done"],
    basisCodes: ["x.code"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: (k: string) => (systemOnly.has(k) ? "TRUSTED" : "UNTRUSTED") },
      business: [guard],
      default: "REFUSE",
    },
  };
}

function ed25519Keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

describe("config-seal — digest", () => {
  it("is deterministic for the same pack", () => {
    expect(computeConfigDigest(extractSealableSurface(makePack()))).toBe(
      computeConfigDigest(extractSealableSurface(makePack())),
    );
  });

  it("captures probed taint minimums (system-only config)", () => {
    const surface = extractSealableSurface(makePack({ systemOnlyKinds: ["x.webhook"] }));
    expect(surface.taintMinimums).toContainEqual({ kind: "x.webhook", minimum: "TRUSTED" });
    expect(surface.taintMinimums).toContainEqual({ kind: "x.create", minimum: "UNTRUSTED" });
  });
});

describe("config-seal — sign/verify round-trip", () => {
  it("verifies an ed25519-signed seal", () => {
    const { publicKeyPem, privateKeyPem } = ed25519Keys();
    const seal = sealPackConfig(makePack(), { privateKeyPem, algorithm: "ed25519", keyId: "k1" });
    const report = verifyConfigSeal(makePack(), seal, { publicKeyPem, policy: "require_signature" });
    expect(report.verified).toBe(true);
    expect(report.digestMatch).toBe("match");
  });

  it("require_digest passes for an unsigned seal", () => {
    const seal = sealPackConfig(makePack());
    expect(verifyConfigSeal(makePack(), seal).verified).toBe(true);
  });
});

describe("config-seal — tamper detection (adversarial)", () => {
  it("detects a taint downgrade (system-only kind dropped)", () => {
    const seal = sealPackConfig(makePack({ systemOnlyKinds: ["x.webhook"] }));
    const tampered = makePack({ systemOnlyKinds: [] }); // x.webhook now UNTRUSTED
    const report = verifyConfigSeal(tampered, seal);
    expect(report.digestMatch).toBe("mismatch");
    expect(report.verified).toBe(false);
  });

  it("detects guard-metadata tampering (threshold changed)", () => {
    const seal = sealPackConfig(makePack({ threshold: 100 }));
    const report = verifyConfigSeal(makePack({ threshold: 50 }), seal);
    expect(report.digestMatch).toBe("mismatch");
  });

  it("detects signature mismatch under a different key", () => {
    const { privateKeyPem } = ed25519Keys();
    const { publicKeyPem: otherPub } = ed25519Keys();
    const seal = sealPackConfig(makePack(), { privateKeyPem, algorithm: "ed25519", keyId: "k1" });
    const report = verifyConfigSeal(makePack(), seal, { publicKeyPem: otherPub, policy: "require_signature" });
    expect(report.verified).toBe(false);
  });

  it("require_signature without publicKey errors", () => {
    const seal = sealPackConfig(makePack());
    const report = verifyConfigSeal(makePack(), seal, { policy: "require_signature" });
    expect(report.verified).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });
});

// ── 081: guard CODE bodies are sealed, not just metadata (Critique #27) ──────

/**
 * The escape this regression closes: a `createRewriteGuard` clamp captures its
 * cap (here named `AUTO_REMEDIATION_BLAST_CAP`) in the guard CLOSURE and records
 * only `{ kind: "rewrite", mutatesPayloadFields }` in metadata. Pre-081, editing
 * the cap 5 → 5000 changed guard behavior but left a byte-identical sealable
 * surface that verified clean. 081 pins the cap into the per-guard code artifact
 * digest, so the edit now moves `computeConfigDigest`.
 */
function makeRewritePack(cap: number): SealablePackInput {
  const clampGuard = createRewriteGuard<string, Record<string, unknown>, unknown>({
    matches: (env) => env.kind === "remediation.apply",
    extract: (env) => (env.payload as { blast?: number }).blast,
    cap,
    mutateField: "blast",
    reason: "clamped blast radius to the auto-remediation cap",
  });
  return {
    id: "pack-rewrite-cap",
    version: "1.0.0",
    contract: "v0",
    intents: ["remediation.apply"],
    signals: [],
    basisCodes: ["business:quantity_capped"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [clampGuard as Guard<string, unknown, unknown>],
      default: "REFUSE",
    },
  };
}

describe("config-seal — guard CODE is sealed (081, Critique #27)", () => {
  const AUTO_REMEDIATION_BLAST_CAP = 5;
  const TAMPERED_BLAST_CAP = 5000;

  it("a createRewriteGuard closure cap is surfaced into the sealable surface", () => {
    const surface = extractSealableSurface(makeRewritePack(AUTO_REMEDIATION_BLAST_CAP));
    // The cap must be captured as a per-guard code digest — proving the
    // executable surface (not just metadata) is part of what gets hashed.
    expect(surface.guardCodeDigests.length).toBeGreaterThan(0);
    expect(surface.guardCodeDigests[0]!.codeDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("editing AUTO_REMEDIATION_BLAST_CAP 5→5000 CHANGES computeConfigDigest", () => {
    const baseDigest = computeConfigDigest(
      extractSealableSurface(makeRewritePack(AUTO_REMEDIATION_BLAST_CAP)),
    );
    const tamperedDigest = computeConfigDigest(
      extractSealableSurface(makeRewritePack(TAMPERED_BLAST_CAP)),
    );
    // Pre-081 these were byte-identical (metadata-only seal). They must differ now.
    expect(tamperedDigest).not.toBe(baseDigest);
  });

  it("verifyConfigSeal reports a mismatch when the cap is tampered (fail-closed)", () => {
    const seal = sealPackConfig(makeRewritePack(AUTO_REMEDIATION_BLAST_CAP));
    const report = verifyConfigSeal(makeRewritePack(TAMPERED_BLAST_CAP), seal);
    expect(report.digestMatch).toBe("mismatch");
    expect(report.verified).toBe(false);
  });

  it("presence-only is NOT sufficient — the SAME cap still verifies clean", () => {
    // Non-vacuity guard: the mismatch above is caused by the CAP, not by guard
    // identity/order. Re-sealing the identical cap must still verify.
    const seal = sealPackConfig(makeRewritePack(AUTO_REMEDIATION_BLAST_CAP));
    const report = verifyConfigSeal(makeRewritePack(AUTO_REMEDIATION_BLAST_CAP), seal);
    expect(report.digestMatch).toBe("match");
    expect(report.verified).toBe(true);
  });
});

describe("config-seal — registry fields are NOT sealed (non-interference)", () => {
  it("adding sideEffects / executorContract / handlers leaves the digest unchanged", () => {
    const baseDigest = computeConfigDigest(extractSealableSurface(makePack()));

    // The sealable surface is {id,version,contract,intents,signals,basisCodes,
    // policyStructure,taintMinimums}. Registry-layer fields (items 1 & 2, plus
    // the existing handlers/rehydrateState) are NOT part of it, so attaching
    // them must produce a byte-identical digest.
    const withRegistry = {
      ...makePack(),
      sideEffects: { "x.create": "write", "x.webhook": "destructive" },
      executorContract: {
        "x.create": { outputShape: { kind: "object", fields: { id: { kind: "string" } } } },
      },
      handlers: { "x.create": async () => ({}) },
      rehydrateState: (raw: unknown) => raw,
    } as SealablePackInput;

    expect(computeConfigDigest(extractSealableSurface(withRegistry))).toBe(baseDigest);
  });
});
