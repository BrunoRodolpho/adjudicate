import { z } from "zod";

/**
 * Wire schema for a config-seal verification report (ADR-121). Mirrors
 * `@adjudicate/conformance`'s `ConfigSealReport` structurally so admin-sdk
 * carries no dependency on that package.
 */
export const ConfigSealReportSchema = z.object({
  verified: z.boolean(),
  digestMatch: z.enum(["match", "mismatch"]),
  computedDigest: z.string(),
  expectedDigest: z.string(),
  signatureVerification: z.union([
    z.object({ verified: z.literal(true) }),
    z.object({ verified: z.literal(false), reason: z.string() }),
    z.object({ verified: z.null(), reason: z.enum(["not_supplied", "not_required"]) }),
  ]),
  errors: z.array(z.string()),
});

export type ConfigSealReportParsed = z.infer<typeof ConfigSealReportSchema>;

/**
 * Structured violation taxonomy (ADR-131). The single-pack `ConfigSealStatus`
 * card collapses every failure into opaque `errors[]` strings; this closed
 * vocabulary makes each failure mode legible and links digest mismatches to the
 * `kill.SEAL_MISMATCH` enforcement path. Closed — a new value would only ever
 * be MINOR-additive (the values are *derived* from the report, never widened by
 * an external producer).
 *
 *   digest_mismatch   — computed surface digest ≠ the sealed digest.
 *   signature_failed  — a supplied signature failed verification.
 *   signature_missing — `require_signature` policy but no signature/key supplied.
 *   policy_error      — a residual `errors[]` entry not covered above.
 */
export const SealViolationKindSchema = z.enum([
  "digest_mismatch",
  "signature_failed",
  "signature_missing",
  "policy_error",
]);

export type SealViolationKindParsed = z.infer<typeof SealViolationKindSchema>;

/**
 * One structured config-seal violation, derived deterministically from a
 * `ConfigSealReport`. `basisCode` carries the kernel linkage: a digest mismatch
 * is what flips `kill.SEAL_MISMATCH` (`"seal_mismatch"`) in adapter-core, so the
 * console can deep-link to the audit explorer; non-enforcement violations carry
 * `null`.
 */
export const SealViolationSchema = z.object({
  kind: SealViolationKindSchema,
  /** Human-readable detail — the original `errors[]` entry where one exists. */
  message: z.string(),
  /** `kill.SEAL_MISMATCH` linkage; null when not enforcement-linked. */
  basisCode: z.literal("seal_mismatch").nullable(),
});

export type SealViolationParsed = z.infer<typeof SealViolationSchema>;

/**
 * One pack's config-seal entry for the multi-pack `governance.configSealStatusAll`
 * surface (ADR-131). Wraps the existing `ConfigSealReportSchema` verbatim with a
 * `packId`/`packVersion` and a derived structured `violations[]`. Additive
 * sibling to the single-pack `configSealStatus` — that procedure is unchanged.
 */
export const PackConfigSealEntrySchema = z.object({
  packId: z.string(),
  packVersion: z.string().optional(),
  report: ConfigSealReportSchema,
  violations: z.array(SealViolationSchema),
});

export type PackConfigSealEntryParsed = z.infer<typeof PackConfigSealEntrySchema>;

/** Result of `governance.configSealStatusAll`. */
export const ConfigSealStatusAllResultSchema = z.object({
  entries: z.array(PackConfigSealEntrySchema),
});

export type ConfigSealStatusAllResultParsed = z.infer<
  typeof ConfigSealStatusAllResultSchema
>;

/**
 * Derive a structured `violations[]` from a `ConfigSealReport` (ADR-131).
 * Reference helper — pure and deterministic, with no new producer in
 * `@adjudicate/conformance`. The adopter calls this per pack when wiring
 * `ctx.configSealReports`; the console renders the result directly.
 *
 * Mapping:
 *   - `digestMatch === "mismatch"`              → `digest_mismatch`  (basisCode `seal_mismatch`)
 *   - `signatureVerification.verified === false`→ `signature_failed`  (basisCode `null`)
 *   - `verified === null & reason "not_supplied"` (require_signature) → `signature_missing` (null)
 *   - any residual `errors[]` entry not matched → `policy_error`     (basisCode `null`)
 *
 * Each `errors[]` entry is classified at most once; entries already represented
 * by a structured violation above are not re-emitted as `policy_error`.
 */
export function deriveSealViolations(
  report: ConfigSealReportParsed,
): SealViolationParsed[] {
  const violations: SealViolationParsed[] = [];
  const consumed = new Set<string>();

  if (report.digestMatch === "mismatch") {
    const message =
      report.errors.find((e) => e.includes("digest mismatch")) ??
      `config digest mismatch: expected ${report.expectedDigest}, got ${report.computedDigest}`;
    consumed.add(message);
    violations.push({ kind: "digest_mismatch", message, basisCode: "seal_mismatch" });
  }

  const sig = report.signatureVerification;
  if (sig.verified === false) {
    const message =
      report.errors.find((e) => e.includes("signature failed")) ??
      `config seal signature failed: ${sig.reason}`;
    consumed.add(message);
    violations.push({ kind: "signature_failed", message, basisCode: null });
  } else if (sig.verified === null && sig.reason === "not_supplied") {
    const message =
      report.errors.find((e) => e.includes("require_signature")) ??
      "config seal policy require_signature requires signature + publicKeyPem";
    consumed.add(message);
    violations.push({ kind: "signature_missing", message, basisCode: null });
  }

  for (const e of report.errors) {
    if (consumed.has(e)) continue;
    violations.push({ kind: "policy_error", message: e, basisCode: null });
  }

  return violations;
}
