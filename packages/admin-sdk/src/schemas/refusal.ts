import { z } from "zod";
import type { Refusal, RefusalKind } from "@adjudicate/core";

/**
 * Wire-side schemas for `RefusalKind` and `Refusal`.
 *
 * `code` is `z.string()` — the kernel's per-Pack `basisCodes` declaration
 * controls the refusal taxonomy at emission time; the wire accepts any
 * string and trusts the upstream validation.
 */

export const RefusalKindSchema = z.enum([
  "SECURITY",
  "BUSINESS_RULE",
  "AUTH",
  "STATE",
]);

export const RefusalSchema = z.object({
  kind: RefusalKindSchema,
  code: z.string(),
  userFacing: z.string(),
  detail: z.string().optional(),
});

// ─── Build-time drift guards ────────────────────────────────────────────────

const _kindCoreToSchema = (
  x: RefusalKind,
): z.infer<typeof RefusalKindSchema> => x;
const _kindSchemaToCore = (
  x: z.infer<typeof RefusalKindSchema>,
): RefusalKind => x;

const _refusalCoreToSchema = (x: Refusal): z.infer<typeof RefusalSchema> => x;
const _refusalSchemaToCore = (x: z.infer<typeof RefusalSchema>): Refusal => x;

void [
  _kindCoreToSchema,
  _kindSchemaToCore,
  _refusalCoreToSchema,
  _refusalSchemaToCore,
];
