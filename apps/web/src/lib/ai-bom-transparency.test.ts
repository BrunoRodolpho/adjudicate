import { describe, expect, it } from "vitest";
import {
  projectAiBomTransparency,
  sanitizeBomForPublic,
} from "./ai-bom-transparency";
import {
  AI_BOM_TRANSPARENCY_SAMPLE,
  type AiBomTransparencySample,
} from "./transparency-fixtures";

/**
 * The public AI-BOM projection is an ALLOWLIST (ADR-130). These tests pin the
 * load-bearing safety property: a future/unknown field is dropped, and the
 * signature value is never published — only `signed: boolean`.
 */

const ALLOWED_TOP_KEYS = new Set([
  "bomVersion",
  "packId",
  "packVersion",
  "contract",
  "kernelMinVersion",
  "fingerprint",
  "model",
  "intents",
  "signals",
  "basisCodes",
  "tools",
  "rag",
  "promptHashes",
  "guardrails",
  "conformance",
  "healthTier",
  "healthScore",
  "frameworks",
  "bomDigest",
  "generatedAt",
  "signed",
]);

describe("sanitizeBomForPublic — allowlist", () => {
  it("drops an injected unknown/secret-looking field", () => {
    const tampered = {
      ...(AI_BOM_TRANSPARENCY_SAMPLE[0] as AiBomTransparencySample),
      rawPrompt: "You are a helpful assistant. SECRET TEMPLATE BODY.",
      apiKey: "sk-super-secret",
      internalNotes: "do not publish",
    } as unknown as Record<string, unknown>;

    const out = sanitizeBomForPublic(tampered);
    const json = JSON.stringify(out);

    expect(json).not.toContain("SECRET TEMPLATE BODY");
    expect(json).not.toContain("sk-super-secret");
    expect(json).not.toContain("do not publish");
    expect(Object.prototype.hasOwnProperty.call(out, "rawPrompt")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "apiKey")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "internalNotes")).toBe(
      false,
    );
  });

  it("collapses a signature object to `signed: true`, never exposing the value", () => {
    const signed = {
      ...(AI_BOM_TRANSPARENCY_SAMPLE[0] as AiBomTransparencySample),
      signature: { algorithm: "ed25519", keyId: "key-1", value: "SECRET-SIG-VALUE" },
    } as unknown as Record<string, unknown>;

    const out = sanitizeBomForPublic(signed);
    expect(out.signed).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(out, "signature")).toBe(false);
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET-SIG-VALUE");
    expect(json).not.toContain("key-1");
    expect(json).not.toContain("ed25519");
  });

  it("reports `signed: false` for an unsigned BOM (honest provenance)", () => {
    const out = sanitizeBomForPublic(
      AI_BOM_TRANSPARENCY_SAMPLE[0] as unknown as Record<string, unknown>,
    );
    expect(out.signed).toBe(false);
  });

  it("emits only allowlisted top-level keys", () => {
    const out = sanitizeBomForPublic(
      AI_BOM_TRANSPARENCY_SAMPLE[0] as unknown as Record<string, unknown>,
    );
    for (const key of Object.keys(out)) {
      expect(ALLOWED_TOP_KEYS.has(key)).toBe(true);
    }
  });

  it("preserves the publishable hash/reference fields", () => {
    const sample = AI_BOM_TRANSPARENCY_SAMPLE[0] as AiBomTransparencySample;
    const out = sanitizeBomForPublic(
      sample as unknown as Record<string, unknown>,
    );
    expect(out.packId).toBe(sample.packId);
    expect(out.fingerprint).toBe(sample.fingerprint);
    expect(out.bomDigest).toBe(sample.bomDigest);
    expect(out.promptHashes).toEqual(sample.promptHashes);
    expect(out.tools.map((t) => t.name)).toEqual(
      sample.tools.map((t) => t.name),
    );
  });
});

describe("projectAiBomTransparency — committed reference sample", () => {
  it("projects every reference pack in declaration order", () => {
    const out = projectAiBomTransparency(AI_BOM_TRANSPARENCY_SAMPLE);
    expect(out).toHaveLength(AI_BOM_TRANSPARENCY_SAMPLE.length);
    expect(out.map((b) => b.packId)).toEqual(
      AI_BOM_TRANSPARENCY_SAMPLE.map((b) => b.packId),
    );
  });

  it("is deterministic across calls", () => {
    const a = projectAiBomTransparency(AI_BOM_TRANSPARENCY_SAMPLE);
    const b = projectAiBomTransparency(AI_BOM_TRANSPARENCY_SAMPLE);
    expect(a).toEqual(b);
  });

  it("never carries a `signature`, raw prompt, or secret-looking key anywhere", () => {
    const json = JSON.stringify(
      projectAiBomTransparency(AI_BOM_TRANSPARENCY_SAMPLE),
    );
    for (const forbidden of [
      "signature",
      "rawPrompt",
      "promptTemplate",
      "apiKey",
      "secret",
      "token",
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
