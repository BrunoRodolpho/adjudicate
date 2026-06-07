import { z } from "zod";

/**
 * Wire schema for an AI-BOM (ADR-127). Mirrors `@adjudicate/conformance`'s
 * `AiBom`; arrays use permissive element records so the schema tracks the
 * generator without admin-sdk depending on it.
 */
export const AiBomSchema = z.object({
  bomVersion: z.string(),
  packId: z.string(),
  packVersion: z.string(),
  contract: z.string(),
  kernelMinVersion: z.string(),
  kernelVersion: z.string().optional(),
  fingerprint: z.string(),
  model: z.object({ provider: z.string(), model: z.string(), modelVersion: z.string().optional() }).optional(),
  intents: z.array(z.string()),
  signals: z.array(z.string()),
  basisCodes: z.array(z.string()),
  tools: z.array(z.record(z.string(), z.unknown())),
  rag: z.array(z.record(z.string(), z.unknown())),
  promptHashes: z.array(z.object({ id: z.string(), sha256: z.string() })),
  guardrails: z.array(z.object({ basisCode: z.string(), category: z.string() })),
  conformance: z.object({
    passed: z.boolean(),
    total: z.number(),
    passedCount: z.number(),
    failedCount: z.number(),
    reportDigest: z.string(),
  }),
  healthTier: z.string(),
  healthScore: z.object({ score: z.number(), maxScore: z.number() }),
  frameworks: z.array(z.string()),
  bomDigest: z.string(),
  generatedAt: z.string(),
  signature: z.object({ algorithm: z.string(), keyId: z.string(), value: z.string() }).optional(),
});

export type AiBomParsed = z.infer<typeof AiBomSchema>;
