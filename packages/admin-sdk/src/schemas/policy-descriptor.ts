import { z } from "zod";

/**
 * Wire schema for `PolicyBundleDescriptor` from `@adjudicate/core`. Drives
 * the console's governance visualiser. The descriptor is JSON-serialisable
 * by construction (`describePolicyBundle` strips function references and
 * symbols), so the wire shape mirrors the in-memory shape one-to-one.
 *
 * `GuardDescription` is open-ended per ADR-105 (tooling MUST tolerate
 * unknown variants for forward compatibility); we model it as
 * `z.record(z.string(), z.unknown())` to stay permissive on the wire.
 */

export const GuardDescriptionSchema = z
  .object({
    kind: z.string(),
  })
  .passthrough();

export const GuardMetadataSchema = z.object({
  name: z.string().optional(),
  author: z.string().optional(),
  since: z.string().optional(),
  description: GuardDescriptionSchema.optional(),
});

export const GuardDescriptorSchema = z.union([
  z.object({ kind: z.literal("named"), metadata: GuardMetadataSchema }),
  z.object({ kind: z.literal("anonymous") }),
]);

export const PolicyPhaseSchema = z.enum([
  "state",
  "taint",
  "auth",
  "business",
]);

export const PolicyPhaseDescriptorSchema = z.object({
  phase: PolicyPhaseSchema,
  guards: z.array(GuardDescriptorSchema),
});

export const PolicyBundleDescriptorSchema = z.object({
  default: z.enum(["REFUSE", "EXECUTE"]),
  phases: z.array(PolicyPhaseDescriptorSchema),
});

export type PolicyBundleDescriptorParsed = z.infer<
  typeof PolicyBundleDescriptorSchema
>;
