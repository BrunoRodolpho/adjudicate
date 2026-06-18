/**
 * Cross-runtime golden-vector consumer test.
 *
 * Reads `docs/specs/canonical-hash-vectors.json` (the language-neutral
 * vector file external runtimes consume) and verifies that the Node.js
 * reference implementation in `sha256Canonical` produces the same hash
 * for every listed input.
 *
 * This is the *consumer-side* check that pairs with
 * `hash-golden-vectors.test.ts` (the *producer-side* test that pins the
 * TypeScript implementation). External (Rust/Go/Python/browser) re-
 * implementations should load the same JSON file and run the same
 * assertion against their own canonicalization + SHA-256 pipeline.
 *
 * If this test fails:
 *   - EITHER the JSON file drifted from `hash-golden-vectors.test.ts`
 *     (cross-runtime consumers will now report mismatches against the TS
 *     reference) — re-sync the JSON;
 *   - OR the canonicalization algorithm changed — that is a wire-format
 *     break requiring an envelope version bump and a new vectors file at
 *     `docs/specs/canonical-hash-vectors-v3.json`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Canonical } from "../src/hash.js";
import {
  CAPABILITY_PREIMAGE_VERSION,
  capabilityPreimage,
} from "../src/capability.js";

interface VectorsFile {
  readonly algorithmVersion: string;
  readonly vectors: ReadonlyArray<{
    readonly label: string;
    readonly notes: string;
    readonly input: unknown;
    readonly expectedHash: string;
  }>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS_PATH = resolve(
  HERE,
  "..",
  "..",
  "..",
  "docs",
  "specs",
  "canonical-hash-vectors.json",
);

const vectorsFile = JSON.parse(
  readFileSync(VECTORS_PATH, "utf-8"),
) as VectorsFile;

describe("cross-runtime golden hash vectors (docs/specs/canonical-hash-vectors.json)", () => {
  it("file declares algorithmVersion v2", () => {
    expect(vectorsFile.algorithmVersion).toBe("v2");
  });

  for (const v of vectorsFile.vectors) {
    it(`${v.label} hashes to ${v.expectedHash.slice(0, 12)}…`, () => {
      const actual = sha256Canonical(v.input);
      expect(actual).toBe(v.expectedHash);
    });
  }

  it("every vector has a non-empty label and notes", () => {
    for (const v of vectorsFile.vectors) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.notes.length).toBeGreaterThan(0);
    }
  });

  it("every expectedHash is 64-char lowercase hex", () => {
    const pattern = /^[a-f0-9]{64}$/;
    for (const v of vectorsFile.vectors) {
      expect(v.expectedHash).toMatch(pattern);
    }
  });
});

describe("021 — capability pre-image reproduces identically (cross-runtime regime)", () => {
  // The capability pre-image composes the SAME shared @adjudicate/canonical
  // encoder that produces intentHash, so it reproduces byte-identically across
  // Node and the browser bundle (and any conforming external runtime). These
  // are the GENUINELY-derived literals pinned in @adjudicate/canonical's
  // golden-vectors.test.ts (021 capability pre-image lock).
  const body = {
    intentHash:
      "cd017dd347b4a8c4c748f7a064788f82eb30fd240d6667873b16cefeb4ed4bc0",
    kernelId: "kernel://prod/us-east-1",
  };
  const EXPECTED_PREIMAGE =
    "adjudicate-capability-v1\n3d99814d8a4f9be65fa840116d21e786180c9a72927e18ef2f9cf1724a03bf04";
  const EXPECTED_PREIMAGE_HASH =
    "a46e1275c0be33f5287fadfb9c21537892c3542b9c6080e93a722be91da280df";

  it("the version tag is the v1 literal", () => {
    expect(CAPABILITY_PREIMAGE_VERSION).toBe("adjudicate-capability-v1");
  });

  it("capabilityPreimage reproduces the frozen pre-image string", () => {
    expect(capabilityPreimage(body)).toBe(EXPECTED_PREIMAGE);
  });

  it("sha256Canonical over the pre-image reproduces the frozen hash", () => {
    expect(sha256Canonical(capabilityPreimage(body))).toBe(
      EXPECTED_PREIMAGE_HASH,
    );
  });
});
