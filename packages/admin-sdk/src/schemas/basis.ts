import { z } from "zod";
import type { BasisCategory, DecisionBasis } from "@adjudicate/core";

/**
 * Wire-side schemas for `BasisCategory` and `DecisionBasis`.
 *
 * Note: `code` is `z.string()`, not a vocabulary-narrowed enum. The kernel's
 * `withBasisAudit` already validates `code` against `BASIS_CODES[category]`
 * at emission time. Re-validating at the wire would create a second source
 * of truth for the basis vocabulary that drifts whenever the kernel adds a
 * code. The wire stays loose; the kernel owns vocabulary purity.
 */

export const BasisCategorySchema = z.enum([
  "state",
  "auth",
  "taint",
  "ledger",
  "schema",
  "business",
  "validation",
  "kill",
  "deadline",
]);

export const DecisionBasisSchema = z.object({
  category: BasisCategorySchema,
  code: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

// ─── Build-time drift guards ────────────────────────────────────────────────

const _categoryCoreToSchema = (
  x: BasisCategory,
): z.infer<typeof BasisCategorySchema> => x;
const _categorySchemaToCore = (
  x: z.infer<typeof BasisCategorySchema>,
): BasisCategory => x;

// `DecisionBasis` is a distributive conditional in core (per-category
// narrow code type). The wire schema accepts any string for `code`, so
// the assignability guards are one-way: every kernel-emitted basis fits
// the schema, but not every schema-valid basis fits the kernel type.
// We only assert the kernel-to-schema direction.
const _basisCoreToSchema = (
  x: DecisionBasis,
): z.infer<typeof DecisionBasisSchema> => x;

void [_categoryCoreToSchema, _categorySchemaToCore, _basisCoreToSchema];
