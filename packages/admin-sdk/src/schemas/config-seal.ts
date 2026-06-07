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
