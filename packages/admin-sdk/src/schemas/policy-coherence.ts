import { z } from "zod";

/**
 * Wire schema for a policy-coherence analysis report (ADR-125). Mirrors
 * `@adjudicate/analyze`'s AnalysisReport; `detail` is a passthrough record so
 * unknown analyzer fields flow through (admin-sdk carries no analyze dependency).
 */
export const CoherenceDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "note"]),
  message: z.string(),
  description: z.string().optional(),
  guardId: z.string().optional(),
  phase: z.enum(["state", "auth", "business"]).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const PolicyCoherenceReportSchema = z.object({
  packId: z.string(),
  diagnostics: z.array(CoherenceDiagnosticSchema),
  summary: z.object({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    note: z.number().int().nonnegative(),
  }),
  passed: z.boolean(),
  analyzedAt: z.string(),
});

export type PolicyCoherenceReportParsed = z.infer<typeof PolicyCoherenceReportSchema>;
