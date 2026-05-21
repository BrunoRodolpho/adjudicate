/**
 * Pack manifest validation tests.
 *
 * Covers the happy path (well-formed manifest), each error class, and
 * the live-Pack vs manifest cross-check. The validator is pure — same
 * input always produces same output, so all tests run synchronously
 * with literal package.json shapes.
 */

import { describe, expect, it } from "vitest";
import {
  crossCheckPackVsManifest,
  validatePackManifest,
  type PackManifest,
} from "../src/manifest.js";

const baseManifestPkg = {
  name: "@adjudicate-community/pack-acme",
  version: "0.1.0",
  type: "module",
  adjudicate: {
    contract: "v1",
    packId: "@acme/test",
    kernelMinVersion: ">=0.5 <2",
    intents: ["acme.do_thing", "acme.do_other"],
    signals: ["acme.review_complete"],
    qualityTier: "silver",
    docs: "https://docs.example.io/pack",
  },
  peerDependencies: {
    "@adjudicate/core": ">=0.5 <2",
  },
};

describe("validatePackManifest — happy path", () => {
  it("accepts a well-formed manifest", () => {
    const result = validatePackManifest(baseManifestPkg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.packId).toBe("@acme/test");
      expect(result.manifest.intents).toEqual(["acme.do_thing", "acme.do_other"]);
      expect(result.manifest.signals).toEqual(["acme.review_complete"]);
    }
  });

  it("accepts a manifest with no signals/qualityTier/docs/compatibility", () => {
    const minimal = {
      ...baseManifestPkg,
      adjudicate: {
        contract: "v0",
        packId: "@acme/min",
        kernelMinVersion: ">=0.5",
        intents: ["a.b"],
      },
      peerDependencies: {
        // Match kernelMinVersion exactly so the consistency check passes.
        "@adjudicate/core": ">=0.5",
      },
    };
    const result = validatePackManifest(minimal);
    expect(result.ok).toBe(true);
  });
});

describe("validatePackManifest — error cases", () => {
  function expectError(pkg: unknown, substring: string): void {
    const result = validatePackManifest(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const errors = result.errors;
      expect(
        errors.some((e) => e.includes(substring)),
        `expected an error containing "${substring}", got: ${errors.join(" | ")}`,
      ).toBe(true);
    }
  }

  it("rejects non-object input", () => {
    expectError(null, "must be an object");
    expectError(42, "must be an object");
  });

  it("rejects missing name", () => {
    const pkg = { ...baseManifestPkg } as Record<string, unknown>;
    delete pkg.name;
    expectError(pkg, "name must be a non-empty string");
  });

  it("rejects non-ESM packages", () => {
    expectError(
      { ...baseManifestPkg, type: "commonjs" },
      'type must be "module"',
    );
  });

  it("rejects missing adjudicate field", () => {
    const pkg = { ...baseManifestPkg } as Record<string, unknown>;
    delete pkg.adjudicate;
    expectError(pkg, "missing the top-level");
  });

  it("rejects invalid contract", () => {
    expectError(
      {
        ...baseManifestPkg,
        adjudicate: { ...baseManifestPkg.adjudicate, contract: "v2" },
      },
      'contract must be "v0" or "v1"',
    );
  });

  it("rejects empty intents", () => {
    expectError(
      {
        ...baseManifestPkg,
        adjudicate: { ...baseManifestPkg.adjudicate, intents: [] },
      },
      "intents must be a non-empty string array",
    );
  });

  it("rejects duplicate intents", () => {
    expectError(
      {
        ...baseManifestPkg,
        adjudicate: { ...baseManifestPkg.adjudicate, intents: ["x", "x"] },
      },
      'duplicate intent "x"',
    );
  });

  it("rejects invalid qualityTier", () => {
    expectError(
      {
        ...baseManifestPkg,
        adjudicate: { ...baseManifestPkg.adjudicate, qualityTier: "platinum" },
      },
      "qualityTier must be one of",
    );
  });

  it("rejects missing peerDependencies", () => {
    const pkg = { ...baseManifestPkg } as Record<string, unknown>;
    delete pkg.peerDependencies;
    expectError(pkg, "peerDependencies must declare");
  });

  it("rejects missing @adjudicate/core peer dependency", () => {
    expectError(
      {
        ...baseManifestPkg,
        peerDependencies: { "lodash": ">=4" },
      },
      'must declare "@adjudicate/core"',
    );
  });

  it("warns when peer dep range does not match kernelMinVersion", () => {
    expectError(
      {
        ...baseManifestPkg,
        peerDependencies: { "@adjudicate/core": ">=0.1" },
      },
      "should match adjudicate.kernelMinVersion",
    );
  });
});

describe("validatePackManifest — kernelVersion option", () => {
  it("passes when running kernel matches the range", () => {
    const result = validatePackManifest(baseManifestPkg, {
      kernelVersion: "0.6.0",
    });
    expect(result.ok).toBe(true);
  });

  it("fails when running kernel is below the range", () => {
    const result = validatePackManifest(baseManifestPkg, {
      kernelVersion: "0.4.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("does not satisfy")),
      ).toBe(true);
    }
  });
});

describe("crossCheckPackVsManifest", () => {
  const manifest: PackManifest = {
    contract: "v1",
    packId: "@acme/test",
    kernelMinVersion: ">=0.5 <2",
    intents: ["acme.a", "acme.b"],
    signals: ["acme.signal"],
  };

  it("zero errors when Pack matches manifest", () => {
    const pack = {
      id: "@acme/test",
      intents: ["acme.a", "acme.b"],
      signals: ["acme.signal"],
    };
    expect(crossCheckPackVsManifest(pack, manifest)).toEqual([]);
  });

  it("flags Pack id mismatch", () => {
    const pack = {
      id: "@acme/wrong",
      intents: ["acme.a", "acme.b"],
      signals: ["acme.signal"],
    };
    const errors = crossCheckPackVsManifest(pack, manifest);
    expect(errors.some((e) => e.includes("Pack.id"))).toBe(true);
  });

  it("flags Pack intent missing from manifest", () => {
    const pack = {
      id: "@acme/test",
      intents: ["acme.a", "acme.b", "acme.extra"],
      signals: ["acme.signal"],
    };
    const errors = crossCheckPackVsManifest(pack, manifest);
    expect(errors.some((e) => e.includes("acme.extra"))).toBe(true);
  });

  it("flags manifest intent missing from Pack", () => {
    const pack = {
      id: "@acme/test",
      intents: ["acme.a"],
      signals: ["acme.signal"],
    };
    const errors = crossCheckPackVsManifest(pack, manifest);
    expect(errors.some((e) => e.includes("acme.b"))).toBe(true);
  });

  it("flags signal mismatches", () => {
    const pack = {
      id: "@acme/test",
      intents: ["acme.a", "acme.b"],
      signals: ["acme.different"],
    };
    const errors = crossCheckPackVsManifest(pack, manifest);
    expect(errors.some((e) => e.includes("acme.different"))).toBe(true);
    expect(errors.some((e) => e.includes("acme.signal"))).toBe(true);
  });
});
