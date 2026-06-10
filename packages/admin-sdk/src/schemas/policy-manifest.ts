import { z } from "zod";
import {
  GuardDescriptionSchema,
  PolicyBundleDescriptorSchema,
} from "./policy-descriptor.js";

/**
 * Wire schema for `PolicyManifest` from `@adjudicate/analyze` — the
 * rule-provenance tree's data source. Mirrors the in-memory shape (the
 * manifest is JSON-serialisable by construction). Permissive on the
 * open-ended fields (`description`, decision/taint strings) per ADR-105 so
 * unknown variants flow through; admin-sdk carries NO analyze dependency.
 */

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  endLine: z.number().int().optional(),
  endColumn: z.number().int().optional(),
});

export const GuardManifestNodeSchema = z.object({
  name: z.string(),
  nameSource: z.enum(["metadata", "function", "positional"]),
  phase: z.enum(["state", "auth", "business"]),
  index: z.number().int().nonnegative(),
  anonymous: z.boolean(),
  author: z.string().optional(),
  since: z.string().optional(),
  description: GuardDescriptionSchema.optional(),
  emits: z.string().optional(),
  appliesToKinds: z.array(z.string()).optional(),
  adopterInjected: z.boolean().optional(),
  sourceLocation: SourceLocationSchema.optional(),
}).passthrough();

export const DecisionEvidenceSchema = z.object({
  outcome: z.string(),
  source: z.string(),
  confidence: z.enum(["declared", "inferred", "default"]),
});

export const DecisionOutcomeSummarySchema = z.object({
  possible: z.array(z.string()),
  evidence: z.array(DecisionEvidenceSchema),
  hasOpaqueGuards: z.boolean(),
}).passthrough();

export const IntentManifestNodeSchema = z.object({
  kind: z.string(),
  taintFloor: z.enum(["SYSTEM", "TRUSTED", "UNTRUSTED", "unknown"]),
  systemOnly: z.boolean(),
  tools: z.array(z.string()),
  guardNames: z.array(z.string()),
  outcomes: DecisionOutcomeSummarySchema,
  default: z.enum(["REFUSE", "EXECUTE"]),
}).passthrough();

export const PackManifestNodeSchema = z.object({
  id: z.string(),
  version: z.string(),
  contract: z.string(),
  default: z.enum(["REFUSE", "EXECUTE"]),
  intents: z.array(IntentManifestNodeSchema),
  guards: z.array(GuardManifestNodeSchema),
  basisCodes: z.array(z.string()),
  signals: z.array(z.string()),
  adopterInjectedGuards: z.array(z.string()),
  policyStructure: PolicyBundleDescriptorSchema,
}).passthrough();

export const PolicyManifestSchema = z.object({
  manifestVersion: z.literal("1.0"),
  adopter: z.string(),
  kernelVersion: z.string().optional(),
  generatedAt: z.string().optional(),
  packs: z.array(PackManifestNodeSchema),
  digest: z.string(),
}).passthrough();

export type PolicyManifestParsed = z.infer<typeof PolicyManifestSchema>;
export type PackManifestNodeParsed = z.infer<typeof PackManifestNodeSchema>;
export type IntentManifestNodeParsed = z.infer<typeof IntentManifestNodeSchema>;
export type GuardManifestNodeParsed = z.infer<typeof GuardManifestNodeSchema>;
