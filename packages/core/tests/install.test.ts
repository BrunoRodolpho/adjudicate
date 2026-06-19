/**
 * installPack — pack-conformance + default sink wiring smoke tests.
 */

import {
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import { sha256Canonical } from "@adjudicate/canonical";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describePolicyBundle,
  hasLearningSink,
  hasMetricsSink,
  installPack,
  PackConformanceError,
  PackLoadVerificationError,
  setLearningSink,
  setMetricsSink,
  _resetLearningSink,
  _resetMetricsSink,
  type CapabilityPlanner,
  type Guard,
  type LearningSink,
  type LoadSealReport,
  type LoadTrustReport,
  type MetricsSink,
  type PackFingerprintLike,
  type PackV0,
  type PolicyBundle,
  type TaintPolicy,
  type VerifyOnLoadOptions,
} from "../src/index.js";

type K = "thing.do";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
const planner: CapabilityPlanner<unknown, unknown> = {
  plan() {
    return { visibleReadTools: [], allowedIntents: ["thing.do"] };
  },
};

function makePack(overrides: Partial<PackV0<K, unknown, unknown, unknown>> = {}) {
  const business: ReadonlyArray<Guard<K, unknown, unknown>> = [() => null];
  const policy: PolicyBundle<K, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business,
    default: "REFUSE",
  };
  return {
    id: "pack-test",
    version: "0.1.0-experimental",
    contract: "v0",
    intents: ["thing.do"] as const,
    policy,
    planner,
    basisCodes: ["thing.do.invalid"],
    ...overrides,
  } as const satisfies PackV0<K, unknown, unknown, unknown>;
}

describe("installPack", () => {
  beforeEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });
  afterEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });

  it("returns the pack wrapped with withBasisAudit by default", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(result.pack).not.toBe(makePack().policy);
    expect(result.pack.id).toBe("pack-test");
  });

  it("installs default metrics + learning sinks when none set and warns once each", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(hasMetricsSink()).toBe(true);
    expect(hasLearningSink()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/default console metrics sink/);
    expect(warn.mock.calls[1]![0]).toMatch(/default console learning sink/);
    expect(result.installedDefaults).toContain("metrics");
    expect(result.installedDefaults).toContain("learning");
  });

  it("does NOT install a default learning sink when one is already set", () => {
    const customLearning: LearningSink = { recordOutcome() {} };
    setLearningSink(customLearning);
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(result.installedDefaults).not.toContain("learning");
  });

  it("respects installDefaultLearning: false", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultLearning: false,
      installDefaultMetrics: false,
      warn,
    });
    expect(hasLearningSink()).toBe(false);
    expect(result.installedDefaults).not.toContain("learning");
  });

  it("does NOT install a default metrics sink when one is already set", () => {
    const customSink: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
    };
    setMetricsSink(customSink);
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultLearning: false,
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(result.installedDefaults).not.toContain("metrics");
  });

  it("respects installDefaultMetrics: false", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultMetrics: false,
      installDefaultLearning: false,
      warn,
    });
    expect(hasMetricsSink()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(result.installedDefaults).not.toContain("metrics");
  });

  it("respects auditBasisDrift: false (returns the pack unwrapped)", () => {
    const warn = vi.fn();
    const original = makePack();
    const result = installPack(original, {
      auditBasisDrift: false,
      installDefaultMetrics: false,
      warn,
    });
    expect(result.pack).toBe(original);
  });

  it("throws PackConformanceError when the pack fails conformance", () => {
    const warn = vi.fn();
    expect(() =>
      installPack(makePack({ basisCodes: [] }), {
        installDefaultMetrics: false,
        warn,
      }),
    ).toThrow(PackConformanceError);
  });

  it("does NOT install metrics if conformance fails (fails fast)", () => {
    const warn = vi.fn();
    expect(() =>
      installPack(makePack({ id: "" }), { warn }),
    ).toThrow(PackConformanceError);
    expect(hasMetricsSink()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  // ── T4 #20: default-EXECUTE rejection wired through installPack ─────
  it("throws PackConformanceError when policy.default = EXECUTE and allowDefaultExecute is not set", () => {
    const warn = vi.fn();
    const execPack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() =>
      installPack(execPack, {
        warn,
        installDefaultMetrics: false,
        installDefaultLearning: false,
      }),
    ).toThrow(PackConformanceError);
  });

  it("accepts policy.default = EXECUTE when allowDefaultExecute: true is passed", () => {
    const warn = vi.fn();
    const execPack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() =>
      installPack(execPack, {
        warn,
        installDefaultMetrics: false,
        installDefaultLearning: false,
        allowDefaultExecute: true,
      }),
    ).not.toThrow();
  });

  // 081: the extended describePolicyBundle output keeps the install/conformance
  // shape intact — metadata-only guards still describe as before (no surprise
  // codeDigest key), so nothing downstream of installPack regresses.
  it("describePolicyBundle over an installed pack keeps the canonical shape (no codeDigest on artifact-free guards)", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultMetrics: false,
      installDefaultLearning: false,
      warn,
    });
    const desc = describePolicyBundle(result.pack.policy);
    expect(desc.phases.map((p) => p.phase)).toEqual([
      "state",
      "taint",
      "auth",
      "business",
    ]);
    // The fixture's business guard is a bare `() => null` (no artifact), so its
    // descriptor must NOT carry a codeDigest key (shape unchanged).
    const business = desc.phases.find((p) => p.phase === "business")!;
    expect("codeDigest" in business.guards[0]!).toBe(false);
  });
});

// ── 082: LOAD-TIME provenance enforcement (verifyOnLoad, fail-closed) ────────
//
// `installPack({ verifyOnLoad })` refuses to install a Pack whose signature /
// trust or config seal does not verify (§D-1: only a verified Pack reaches the
// executor; §D-6: a write-path verification failure ABORTS the install; §C:
// failure → friction, never bypass). The verifiers are INJECTED (core never
// imports @adjudicate/conformance — that would be a cycle). To keep this test
// honest, the injected verifiers below run REAL ed25519 sign/verify over a
// canonical fingerprint, mirroring the conformance verifiers' contract: an
// unsigned Pack under the strict `require_signature` default produces a
// `trusted:false` / `verified:false` report and MUST fail closed.

function ed25519() {
  const kp = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Faithful fingerprint over the declarative subset (mirrors computePackFingerprint). */
function fingerprintOf(pack: PackFingerprintLike): string {
  return sha256Canonical({
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents].sort(),
    ...(pack.signals !== undefined ? { signals: [...pack.signals].sort() } : {}),
    ...(pack.basisCodes !== undefined ? { basisCodes: [...pack.basisCodes].sort() } : {}),
  });
}

function signFp(fp: string, privateKeyPem: string): string {
  return nodeSign(null, Buffer.from(fp, "utf-8"), privateKeyPem).toString("base64");
}

/**
 * Real, strict-by-default trust verifier with the SAME contract as
 * `@adjudicate/conformance`'s `verifyPackTrust`: under `require_signature`, a
 * missing signature/publicKeyPem is an error (fail-closed); a present signature
 * is cryptographically verified against the recomputed fingerprint.
 */
function makeVerifyPackTrust() {
  return (args: {
    pack: PackFingerprintLike;
    publicKeyPem?: string;
    signature?: unknown;
    policy?: string;
  }): LoadTrustReport => {
    const errors: string[] = [];
    const policy = args.policy ?? "require_signature";
    const fp = fingerprintOf(args.pack);
    const sig = args.signature as { value?: string } | undefined;
    if (sig?.value !== undefined && args.publicKeyPem !== undefined) {
      const ok = nodeVerify(
        null,
        Buffer.from(fp, "utf-8"),
        args.publicKeyPem,
        Buffer.from(sig.value, "base64"),
      );
      if (!ok) errors.push("pack signature verification failed: signature_mismatch");
    } else if (policy === "require_signature") {
      errors.push("trust policy require_signature requires both signature and publicKeyPem");
    }
    return { trusted: errors.length === 0, errors };
  };
}

/**
 * Real seal verifier with the SAME contract as `verifyConfigSeal`: re-derives
 * the live pack's digest, compares it to the seal's, and (under
 * `require_signature`) cryptographically checks the seal signature.
 */
function makeVerifyConfigSeal() {
  return (
    pack: unknown,
    seal: unknown,
    options: { publicKeyPem?: string; policy?: string },
  ): LoadSealReport => {
    const errors: string[] = [];
    const policy = options.policy ?? "require_signature";
    const p = pack as PackFingerprintLike;
    const s = seal as { digest: string; signature?: { value: string } };
    const liveDigest = sha256Canonical({
      id: p.id,
      version: p.version,
      contract: p.contract,
      intents: [...p.intents].sort(),
    });
    if (liveDigest !== s.digest) {
      errors.push(`config digest mismatch: expected ${s.digest}, got ${liveDigest}`);
    }
    if (s.signature?.value !== undefined && options.publicKeyPem !== undefined) {
      const ok = nodeVerify(
        null,
        Buffer.from(s.digest, "utf-8"),
        options.publicKeyPem,
        Buffer.from(s.signature.value, "base64"),
      );
      if (!ok) errors.push("config seal signature failed: signature_mismatch");
    } else if (policy === "require_signature") {
      errors.push("config seal policy require_signature requires signature + publicKeyPem");
    }
    return { verified: errors.length === 0, errors };
  };
}

function sealOf(pack: PackFingerprintLike, privateKeyPem?: string) {
  const digest = sha256Canonical({
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents].sort(),
  });
  return {
    schemaVersion: 1 as const,
    digest,
    packId: pack.id,
    ...(privateKeyPem !== undefined
      ? { signature: { algorithm: "ed25519", keyId: "k", value: signFp(digest, privateKeyPem) } }
      : {}),
  };
}

describe("installPack — 082 verifyOnLoad (fail-closed provenance gate)", () => {
  beforeEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });
  afterEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });

  const noSinks = { installDefaultMetrics: false, installDefaultLearning: false } as const;

  it("REFUSES an unsigned Pack under the strict require_signature default (fail-closed)", () => {
    const verify: VerifyOnLoadOptions = { verifyPackTrust: makeVerifyPackTrust() };
    expect(() =>
      installPack(makePack(), { ...noSinks, verifyOnLoad: verify }),
    ).toThrow(PackLoadVerificationError);
  });

  it("the refusal carries the trust axis and require_signature error", () => {
    const verify: VerifyOnLoadOptions = { verifyPackTrust: makeVerifyPackTrust() };
    try {
      installPack(makePack(), { ...noSinks, verifyOnLoad: verify });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PackLoadVerificationError);
      const e = err as PackLoadVerificationError;
      expect(e.axis).toBe("trust");
      expect(e.errors.join(" ")).toMatch(/require_signature/);
    }
  });

  it("REFUSES a Pack signed with the WRONG key (trust mismatch)", () => {
    const signer = ed25519();
    const wrong = ed25519();
    const pack = makePack();
    const sig = { algorithm: "ed25519", keyId: "k", value: signFp(fingerprintOf(pack), signer.privateKeyPem) };
    const verify: VerifyOnLoadOptions = {
      verifyPackTrust: makeVerifyPackTrust(),
      publicKeyPem: wrong.publicKeyPem, // verifying against a different key fails
      signature: sig,
    };
    expect(() =>
      installPack(pack, { ...noSinks, verifyOnLoad: verify }),
    ).toThrow(PackLoadVerificationError);
  });

  it("INSTALLS a validly signed Pack and returns the InstalledPack", () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const pack = makePack();
    const sig = { algorithm: "ed25519", keyId: "k", value: signFp(fingerprintOf(pack), privateKeyPem) };
    const verify: VerifyOnLoadOptions = {
      verifyPackTrust: makeVerifyPackTrust(),
      publicKeyPem,
      signature: sig,
    };
    const result = installPack(pack, { ...noSinks, verifyOnLoad: verify });
    expect(result.pack.id).toBe("pack-test");
  });

  it("does NOT install default sinks when load verification fails (fail-fast, no destructive install)", () => {
    const verify: VerifyOnLoadOptions = { verifyPackTrust: makeVerifyPackTrust() };
    expect(() =>
      installPack(makePack(), { verifyOnLoad: verify }), // sinks default ON
    ).toThrow(PackLoadVerificationError);
    // The gate runs BEFORE sink wiring, so an unverified Pack installs nothing.
    expect(hasMetricsSink()).toBe(false);
    expect(hasLearningSink()).toBe(false);
  });

  it("REFUSES on config-seal mismatch (tampered live surface) even when trust passes", () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const pack = makePack();
    const sig = { algorithm: "ed25519", keyId: "k", value: signFp(fingerprintOf(pack), privateKeyPem) };
    // Seal was minted over a DIFFERENT intent set — the live pack drifts from it.
    const staleSeal = sealOf({ ...pack, intents: ["thing.OTHER"] }, privateKeyPem);
    const verify: VerifyOnLoadOptions = {
      verifyPackTrust: makeVerifyPackTrust(),
      verifyConfigSeal: makeVerifyConfigSeal(),
      publicKeyPem,
      signature: sig,
      seal: staleSeal,
    };
    try {
      installPack(pack, { ...noSinks, verifyOnLoad: verify });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PackLoadVerificationError);
      expect((err as PackLoadVerificationError).axis).toBe("config_seal");
    }
  });

  it("INSTALLS when both trust AND a matching signed config seal verify", () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const pack = makePack();
    const sig = { algorithm: "ed25519", keyId: "k", value: signFp(fingerprintOf(pack), privateKeyPem) };
    const seal = sealOf(pack, privateKeyPem);
    const verify: VerifyOnLoadOptions = {
      verifyPackTrust: makeVerifyPackTrust(),
      verifyConfigSeal: makeVerifyConfigSeal(),
      publicKeyPem,
      signature: sig,
      seal,
    };
    const result = installPack(pack, { ...noSinks, verifyOnLoad: verify });
    expect(result.pack.id).toBe("pack-test");
  });

  it("REFUSES a config seal that is present but UNSIGNED under the strict default", () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const pack = makePack();
    const sig = { algorithm: "ed25519", keyId: "k", value: signFp(fingerprintOf(pack), privateKeyPem) };
    const unsignedSeal = sealOf(pack); // digest matches but no signature
    const verify: VerifyOnLoadOptions = {
      verifyPackTrust: makeVerifyPackTrust(),
      verifyConfigSeal: makeVerifyConfigSeal(),
      publicKeyPem,
      signature: sig,
      seal: unsignedSeal,
    };
    expect(() =>
      installPack(pack, { ...noSinks, verifyOnLoad: verify }),
    ).toThrow(PackLoadVerificationError);
  });

  it("verifyOnLoad ABSENT ⇒ unchanged pre-082 behavior (installs without provenance)", () => {
    const result = installPack(makePack(), noSinks);
    expect(result.pack.id).toBe("pack-test");
  });
});
