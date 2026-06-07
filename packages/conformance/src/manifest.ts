/**
 * Pack manifest validation — the "is this package well-formed as an
 * adjudicate Pack?" primitive.
 *
 * The npm-convention schema is locked in `docs/pack-ecosystem/registry-foundations.md`:
 * a community Pack ships an npm package whose `package.json` carries a
 * top-level `adjudicate: { contract, packId, kernelMinVersion, intents, … }`
 * field. Tooling (the CLI, the future registry indexer, adopter install
 * hooks) all need to validate that field; today every consumer would
 * re-implement the check. This module is the canonical validator.
 *
 * The function is pure, synchronous, side-effect-free. It accepts the
 * parsed `package.json` (an `unknown` so callers can plug in whatever
 * they have) and returns either `{ ok: true, manifest }` with a typed
 * view, or `{ ok: false, errors }` with a list of human-readable
 * violations. The kernel does not enforce the manifest at runtime —
 * `assertPackConformance` validates the live Pack object. Manifest
 * validation is a *publish-time* and *install-time* concern.
 */

import semverSatisfies from "./semver-satisfies.js";

export type PackManifestContract = "v0" | "v1";
export type PackManifestQualityTier = "bronze" | "silver" | "gold";

export interface PackManifest {
  readonly contract: PackManifestContract;
  readonly packId: string;
  readonly kernelMinVersion: string;
  readonly intents: ReadonlyArray<string>;
  readonly signals?: ReadonlyArray<string>;
  readonly qualityTier?: PackManifestQualityTier;
  readonly docs?: string;
  readonly compatibility?: {
    readonly adapters?: ReadonlyArray<string>;
  };
  readonly signed?: {
    readonly sigstore?: string;
  };
  // ── AI-BOM metadata (ADR-127) — additive, optional, author-declared ──────
  /** LLM the Pack is tested against, e.g. "claude-opus-4". */
  readonly modelVersion?: string;
  /** Declared prompt-template hashes (sidecar-derived); `{ id, sha256 }`. */
  readonly promptHashes?: ReadonlyArray<{ readonly id: string; readonly sha256: string }>;
  /** Tool/handler definitions exposed to the model. */
  readonly tools?: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly version?: string;
    readonly schemaDigest?: string;
  }>;
  /** Retrieval/RAG data-source bindings. */
  readonly rag?: ReadonlyArray<{
    readonly name: string;
    readonly kind?: string;
    readonly version?: string;
    readonly embeddingModel?: string;
  }>;
}

export interface PackManifestPackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly type?: unknown;
  readonly adjudicate?: unknown;
  readonly peerDependencies?: unknown;
}

export type PackManifestValidation =
  | { readonly ok: true; readonly manifest: PackManifest }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

/**
 * Validate a parsed `package.json` against the npm-convention Pack
 * manifest schema. Returns the typed manifest on success, or a list of
 * violations on failure. Errors are operator-readable strings.
 *
 * Caller MUST pass the already-parsed JSON. `validatePackManifest` does
 * not read from disk — callers (CLI / registry indexer / install hook)
 * own the I/O so this primitive stays pure.
 */
export function validatePackManifest(
  pkg: unknown,
  options?: { readonly kernelVersion?: string },
): PackManifestValidation {
  const errors: string[] = [];

  if (pkg === null || typeof pkg !== "object") {
    return { ok: false, errors: ["package.json must be an object"] };
  }
  const pj = pkg as PackManifestPackageJson;

  if (typeof pj.name !== "string" || pj.name.length === 0) {
    errors.push("package.json.name must be a non-empty string");
  }
  if (typeof pj.version !== "string" || pj.version.length === 0) {
    errors.push("package.json.version must be a non-empty string");
  }
  if (pj.type !== "module") {
    errors.push('package.json.type must be "module" (ESM-only)');
  }
  if (pj.adjudicate === undefined) {
    errors.push(
      "package.json is missing the top-level \"adjudicate\" field — Pack manifest required",
    );
    return { ok: false, errors };
  }
  if (pj.adjudicate === null || typeof pj.adjudicate !== "object") {
    errors.push("package.json.adjudicate must be an object");
    return { ok: false, errors };
  }

  const m = pj.adjudicate as Record<string, unknown>;

  // contract
  if (m.contract !== "v0" && m.contract !== "v1") {
    errors.push(
      `package.json.adjudicate.contract must be "v0" or "v1" (got ${JSON.stringify(m.contract)})`,
    );
  }
  // packId
  if (typeof m.packId !== "string" || m.packId.length === 0) {
    errors.push(
      "package.json.adjudicate.packId must be a non-empty string (the stable Pack handle)",
    );
  }
  // kernelMinVersion
  if (typeof m.kernelMinVersion !== "string" || m.kernelMinVersion.length === 0) {
    errors.push(
      "package.json.adjudicate.kernelMinVersion must be a non-empty semver range",
    );
  }
  // intents
  if (!Array.isArray(m.intents) || m.intents.length === 0) {
    errors.push(
      "package.json.adjudicate.intents must be a non-empty string array",
    );
  } else {
    const seen = new Set<string>();
    for (const intent of m.intents) {
      if (typeof intent !== "string" || intent.length === 0) {
        errors.push("intents entries must be non-empty strings");
        break;
      }
      if (seen.has(intent)) {
        errors.push(`duplicate intent "${intent}"`);
      }
      seen.add(intent);
    }
  }
  // signals (optional)
  if (m.signals !== undefined) {
    if (!Array.isArray(m.signals)) {
      errors.push("signals must be an array of strings when present");
    } else {
      const seen = new Set<string>();
      for (const s of m.signals) {
        if (typeof s !== "string" || s.length === 0) {
          errors.push("signals entries must be non-empty strings");
          break;
        }
        if (seen.has(s)) errors.push(`duplicate signal "${s}"`);
        seen.add(s);
      }
    }
  }
  // qualityTier (optional)
  if (
    m.qualityTier !== undefined &&
    m.qualityTier !== "bronze" &&
    m.qualityTier !== "silver" &&
    m.qualityTier !== "gold"
  ) {
    errors.push(
      `qualityTier must be one of "bronze" | "silver" | "gold" (got ${JSON.stringify(m.qualityTier)})`,
    );
  }
  // docs (optional)
  if (m.docs !== undefined && typeof m.docs !== "string") {
    errors.push("docs must be a URL string when present");
  }

  // compatibility (optional, structural only)
  if (m.compatibility !== undefined) {
    if (m.compatibility === null || typeof m.compatibility !== "object") {
      errors.push("compatibility must be an object when present");
    } else {
      const c = m.compatibility as Record<string, unknown>;
      if (c.adapters !== undefined) {
        if (!Array.isArray(c.adapters)) {
          errors.push("compatibility.adapters must be an array when present");
        } else {
          for (const a of c.adapters) {
            if (typeof a !== "string" || a.length === 0) {
              errors.push("compatibility.adapters entries must be strings");
              break;
            }
          }
        }
      }
    }
  }

  // signed (optional)
  if (m.signed !== undefined) {
    if (m.signed === null || typeof m.signed !== "object") {
      errors.push("signed must be an object when present");
    } else {
      const s = m.signed as Record<string, unknown>;
      if (s.sigstore !== undefined && typeof s.sigstore !== "string") {
        errors.push("signed.sigstore must be a URL string when present");
      }
    }
  }

  // peerDependencies — must declare @adjudicate/core with a range matching kernelMinVersion
  if (pj.peerDependencies !== undefined) {
    if (pj.peerDependencies === null || typeof pj.peerDependencies !== "object") {
      errors.push("peerDependencies must be an object when present");
    } else {
      const peers = pj.peerDependencies as Record<string, unknown>;
      const corePeer = peers["@adjudicate/core"];
      if (corePeer === undefined) {
        errors.push(
          'peerDependencies must declare "@adjudicate/core" so the Pack pins the kernel range',
        );
      } else if (typeof corePeer !== "string") {
        errors.push('peerDependencies["@adjudicate/core"] must be a semver range string');
      } else if (
        typeof m.kernelMinVersion === "string" &&
        corePeer !== m.kernelMinVersion
      ) {
        errors.push(
          `peerDependencies["@adjudicate/core"] (${corePeer}) should match adjudicate.kernelMinVersion (${m.kernelMinVersion}) for consistency`,
        );
      }
    }
  } else {
    errors.push(
      'package.json.peerDependencies must declare "@adjudicate/core"',
    );
  }

  // Optional kernel-version compatibility check.
  if (
    options?.kernelVersion !== undefined &&
    typeof m.kernelMinVersion === "string"
  ) {
    if (!semverSatisfies(options.kernelVersion, m.kernelMinVersion)) {
      errors.push(
        `running kernel ${options.kernelVersion} does not satisfy Pack's kernelMinVersion ${m.kernelMinVersion}`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    manifest: {
      contract: m.contract as PackManifestContract,
      packId: m.packId as string,
      kernelMinVersion: m.kernelMinVersion as string,
      intents: m.intents as ReadonlyArray<string>,
      ...(m.signals !== undefined
        ? { signals: m.signals as ReadonlyArray<string> }
        : {}),
      ...(m.qualityTier !== undefined
        ? { qualityTier: m.qualityTier as PackManifestQualityTier }
        : {}),
      ...(m.docs !== undefined ? { docs: m.docs as string } : {}),
      ...(m.compatibility !== undefined
        ? {
            compatibility: m.compatibility as PackManifest["compatibility"],
          }
        : {}),
      ...(m.signed !== undefined
        ? { signed: m.signed as PackManifest["signed"] }
        : {}),
    },
  };
}

/**
 * Cross-check the live Pack against its declared manifest. Catches drift
 * between what the manifest claims (`intents`, `signals`) and what the
 * Pack actually declares at runtime — a common authoring bug when the
 * Pack gains a new intent kind but the manifest is not updated.
 */
export function crossCheckPackVsManifest(
  pack: {
    readonly id: string;
    readonly intents: ReadonlyArray<string>;
    readonly signals?: ReadonlyArray<string>;
  },
  manifest: PackManifest,
): ReadonlyArray<string> {
  const errors: string[] = [];
  if (pack.id !== manifest.packId) {
    errors.push(
      `Pack.id (${pack.id}) does not match manifest.adjudicate.packId (${manifest.packId})`,
    );
  }
  const declaredIntents = new Set(manifest.intents);
  for (const i of pack.intents) {
    if (!declaredIntents.has(i)) {
      errors.push(
        `Pack declares intent "${i}" not present in manifest.adjudicate.intents`,
      );
    }
  }
  for (const i of manifest.intents) {
    if (!pack.intents.includes(i)) {
      errors.push(
        `manifest.adjudicate.intents lists "${i}" but Pack does not declare it`,
      );
    }
  }
  if (manifest.signals !== undefined && pack.signals !== undefined) {
    const declaredSignals = new Set(manifest.signals);
    for (const s of pack.signals) {
      if (!declaredSignals.has(s)) {
        errors.push(
          `Pack declares signal "${s}" not present in manifest.adjudicate.signals`,
        );
      }
    }
    for (const s of manifest.signals) {
      if (!pack.signals.includes(s)) {
        errors.push(
          `manifest.adjudicate.signals lists "${s}" but Pack does not declare it`,
        );
      }
    }
  }
  return errors;
}
