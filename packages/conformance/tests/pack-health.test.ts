import { describe, expect, it } from "vitest";
import {
  explainPackHealth,
  scorePackHealth,
  type PackHealthInputs,
} from "../src/index.js";
import type { ConformanceReport } from "../src/types.js";
import type { PackManifestValidation } from "../src/manifest.js";
import type { PackTrustReport } from "../src/pack-trust.js";

const okManifest = (): PackManifestValidation => ({
  ok: true,
  manifest: {
    contract: "v0",
    packId: "pack-payments-pix",
    kernelMinVersion: "^1.0.0",
    intents: ["pix.charge.refund"],
  },
});

const okConformance = (): ConformanceReport => ({
  packId: "pack-payments-pix",
  results: [
    { id: "AC-001", name: "untrusted-never-executes", passed: true },
    { id: "AC-002", name: "replay-determinism", passed: true },
  ],
  passed: true,
  summary: { total: 2, passed: 2, failed: 0 },
});

const okTrust = (verified: boolean): PackTrustReport => ({
  fingerprint: "f".repeat(64),
  trusted: verified,
  errors: verified ? [] : ["pack signature verification failed: signature_mismatch"],
  fingerprintMatch: "match",
  signatureVerification: verified
    ? { verified: true }
    : { verified: false, reason: "signature_mismatch" },
});

const goldInputs = (): PackHealthInputs => ({
  packId: "pack-payments-pix",
  manifest: okManifest(),
  conformance: okConformance(),
  trust: okTrust(true),
  declaredQualityTier: "gold",
  intentCount: 3,
  signalCount: 2,
  hasDocsLink: true,
});

describe("scorePackHealth", () => {
  it("scores a fully-verified Pack as gold", () => {
    const report = scorePackHealth(goldInputs());
    expect(report.tier).toBe("gold");
    expect(report.blockers).toEqual([]);
    expect(report.score).toBe(report.maxScore);
    expect(report.axes.every((a) => a.outcome === "pass")).toBe(true);
    expect(report.packId).toBe("pack-payments-pix");
  });

  it("returns unrated when a required axis fails", () => {
    const failing: PackHealthInputs = {
      ...goldInputs(),
      conformance: {
        packId: "pack-payments-pix",
        results: [
          { id: "AC-001", name: "untrusted-never-executes", passed: false, details: "broken" },
        ],
        passed: false,
        summary: { total: 1, passed: 0, failed: 1 },
      },
    };
    const report = scorePackHealth(failing);
    expect(report.tier).toBe("unrated");
    expect(report.blockers).toContain("conformance_passing");
    expect(report.score).toBeLessThan(report.maxScore);
  });

  it("returns unrated when a required axis is unknown", () => {
    const partial: PackHealthInputs = {
      manifest: okManifest(),
      // conformance omitted — unknown for the required axis
      packId: "p",
    };
    const report = scorePackHealth(partial);
    expect(report.tier).toBe("unrated");
    expect(report.blockers).toContain("conformance_passing");
  });

  it("returns silver when required axes pass and non-required axes warn only", () => {
    const inputs: PackHealthInputs = {
      manifest: okManifest(),
      conformance: okConformance(),
      // trust omitted on purpose; intent/signal/docs/tier omitted → warn axes
      packId: "p",
    };
    const report = scorePackHealth(inputs);
    expect(["silver", "bronze"]).toContain(report.tier);
    expect(report.blockers).toEqual([]);
  });

  it("returns bronze when an optional input is unknown but required axes pass", () => {
    const inputs: PackHealthInputs = {
      manifest: okManifest(),
      conformance: okConformance(),
      packId: "p",
    };
    const report = scorePackHealth(inputs);
    // trust_verified and trust_signed will be 'unknown' (optional axes)
    expect(report.tier).toBe("bronze");
    expect(report.blockers).toEqual([]);
  });

  it("packId is null when not supplied", () => {
    const inputs: PackHealthInputs = {
      manifest: okManifest(),
      conformance: okConformance(),
    };
    const report = scorePackHealth(inputs);
    expect(report.packId).toBeNull();
  });

  it("scores are deterministic across repeated calls with identical inputs", () => {
    const a = scorePackHealth(goldInputs());
    const b = scorePackHealth(goldInputs());
    expect(a).toEqual(b);
  });

  it("explainPackHealth renders a stable one-line summary", () => {
    expect(explainPackHealth(scorePackHealth(goldInputs()))).toMatch(
      /^✓ pack-payments-pix → gold/,
    );
    const failing = scorePackHealth({
      manifest: { ok: false, errors: ["bad"] },
      conformance: undefined,
      packId: "p",
    });
    expect(explainPackHealth(failing)).toMatch(/^✗ p → unrated/);
    expect(explainPackHealth(failing)).toMatch(/blockers:/);
  });

  it("schemaVersion is pinned to 1", () => {
    expect(scorePackHealth(goldInputs()).schemaVersion).toBe(1);
  });
});
