import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";
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
