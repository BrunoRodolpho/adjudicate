/**
 * 021 — Capability schema + pure-JS pre-image / hash-bind verify.
 *
 * Pins the schema shape, the deterministic golden-locked pre-image, the
 * tamper-fails / fail-safe `verifyCapability` contract, and — per T5 — that the
 * kernel-identity `attest` seam stays a THROWING v0.2 stub (021 does not unstub
 * it; the kernel never signs).
 */

import { describe, expect, it } from "vitest";
import {
  CAPABILITY_PREIMAGE_VERSION,
  bindCapability,
  capabilityPreimage,
  createKernelIdentity,
  verifyCapability,
  type Capability,
} from "../src/index.js";
import { sha256Canonical } from "../src/hash.js";

const body = {
  intentHash: "cd017dd347b4a8c4c748f7a064788f82eb30fd240d6667873b16cefeb4ed4bc0",
  kernelId: "kernel://prod/us-east-1",
};

describe("capabilityPreimage", () => {
  it("is the versioned tag line + sha256Canonical of the unsigned body", () => {
    const expected = `${CAPABILITY_PREIMAGE_VERSION}\n${sha256Canonical(body)}`;
    expect(capabilityPreimage(body)).toBe(expected);
  });

  it("the version tag is the frozen v1 literal", () => {
    expect(CAPABILITY_PREIMAGE_VERSION).toBe("adjudicate-capability-v1");
    expect(capabilityPreimage(body).startsWith("adjudicate-capability-v1\n")).toBe(
      true,
    );
  });

  it("is deterministic (same body → byte-identical pre-image)", () => {
    expect(capabilityPreimage(body)).toBe(capabilityPreimage({ ...body }));
  });

  it("the signature slot is NOT part of the pre-image (value cannot sign itself)", () => {
    // Adding fields beyond {intentHash, kernelId} must not change the pre-image:
    // capabilityPreimage only reads those two fields.
    const withExtra = { ...body, signature: { keyId: "x", alg: "y", value: "z" } };
    expect(capabilityPreimage(withExtra as typeof body)).toBe(
      capabilityPreimage(body),
    );
  });
});

describe("bindCapability + verifyCapability (hash-bind leg)", () => {
  it("binds a capability whose value commits to its own pre-image, and verifies", () => {
    const cap: Capability = bindCapability(body, "key-1");
    expect(cap.intentHash).toBe(body.intentHash);
    expect(cap.kernelId).toBe(body.kernelId);
    expect(cap.signature.keyId).toBe("key-1");
    expect(cap.signature.value).toBe(sha256Canonical(capabilityPreimage(body)));
    expect(verifyCapability(cap)).toBe(true);
  });

  it("tamper in ANY bound field fails verification", () => {
    const cap = bindCapability(body, "key-1");
    expect(verifyCapability({ ...cap, intentHash: "0".repeat(64) })).toBe(false);
    expect(verifyCapability({ ...cap, kernelId: "kernel://evil" })).toBe(false);
    expect(
      verifyCapability({ ...cap, signature: { ...cap.signature, value: "f".repeat(64) } }),
    ).toBe(false);
  });

  it("verify is fail-safe: malformed input returns false, never throws", () => {
    expect(() => verifyCapability(undefined)).not.toThrow();
    expect(verifyCapability(undefined)).toBe(false);
    expect(verifyCapability({})).toBe(false);
  });
});

describe("T5 — kernel-identity attest stays a THROWING v0.2 stub (021 does not unstub)", () => {
  it("createKernelIdentity().attest() rejects with the reserved-seam error", async () => {
    const identity = createKernelIdentity("kernel://prod/us-east-1", "0.1.0");
    expect(identity.attest).toBeDefined();
    await expect(identity.attest!()).rejects.toThrow(/reserved for v0\.2/);
  });
});
