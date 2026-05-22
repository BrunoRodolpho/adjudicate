/**
 * @adjudicate/conformance — public Pack conformance harness.
 *
 * Reframes the kernel's internal invariant suite (taint protection,
 * replay safety, intent-hash determinism, basis-vocabulary purity,
 * guard ordering, default polarity) as a one-shot check adopters can
 * call against their own Pack:
 *
 * ```ts
 * import { runConformance } from "@adjudicate/conformance";
 * import { myPack } from "./my-pack";
 *
 * const report = runConformance(myPack);
 * if (!report.passed) process.exit(1);
 * ```
 *
 * The harness is deterministic — same `(pack, options)` always produces
 * the same `ConformanceReport`. No `Math.random()`, no `Date.now()`
 * within the check logic; envelope sampling is driven by a seeded LCG
 * threaded through every check.
 *
 * The harness is also non-destructive: it does not install audit sinks,
 * does not mutate the Pack, and does not call into any external
 * service. Adopters who want runtime drift telemetry combine this with
 * `withBasisAudit()` from `@adjudicate/core` separately.
 */

export { runConformance } from "./runner.js";
export { DEFAULT_CHECKS } from "./checks.js";
export {
  type ConformanceCheck,
  type ConformanceOptions,
  type ConformanceReport,
  type ConformanceResult,
} from "./types.js";

// Pack manifest validation primitive (Phase 5 — Pack ecosystem).
export {
  crossCheckPackVsManifest,
  validatePackManifest,
  type PackManifest,
  type PackManifestContract,
  type PackManifestPackageJson,
  type PackManifestQualityTier,
  type PackManifestValidation,
} from "./manifest.js";

// Pack trust primitives — fingerprinting + signature verification (v0.7).
export {
  computePackFingerprint,
  signPackFingerprint,
  verifyPackSignature,
  verifyPackTrust,
  type PackFingerprintInput,
  type PackSignature,
  type PackSignatureAlgorithm,
  type PackSignatureVerification,
  type PackTrustReport,
  type TrustPolicy,
  type VerifyPackTrustOptions,
} from "./pack-trust.js";

// Pack health diagnostics — post-v1 composable scoring over the
// existing primitives. Pure; closed vocabulary; additive over time.
export {
  scorePackHealth,
  explainPackHealth,
  type PackHealthAxis,
  type PackHealthAxisName,
  type PackHealthAxisOutcome,
  type PackHealthInputs,
  type PackHealthReport,
  type PackHealthTier,
} from "./pack-health.js";

// Individual checks are exported by id so adopters who want to assemble
// a partial set (e.g., omit default-polarity for a read-only Pack
// without using `allowDefaultExecute`) can pass `{ checks: [...] }`.
export { untrustedNeverExecutesCheck } from "./checks/untrusted-never-executes.js";
export { replayDeterminismCheck } from "./checks/replay-determinism.js";
export { intentHashDeterministicCheck } from "./checks/intent-hash-deterministic.js";
export { basisVocabularyPurityCheck } from "./checks/basis-vocabulary-purity.js";
export { guardOrderingCheck } from "./checks/guard-ordering.js";
export { defaultPolarityCheck } from "./checks/default-polarity.js";
