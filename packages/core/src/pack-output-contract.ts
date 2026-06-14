/**
 * ExecutorContract — optional, structural post-EXECUTE output validation.
 *
 * A Pack may declare, per intent kind, the structural shape its executor's
 * return value must satisfy. This is NOT on the kernel decision path: EXECUTE
 * has already happened by the time the executor runs. The adapter validates the
 * executor's output AFTER `invokeIntent` and emits an observation event on
 * mismatch; the tool result and loop control flow are unchanged.
 *
 * The shape language is closed plain data (NOT Zod) for two reasons: it must be
 * deterministic (no user-supplied refinement functions on this path), and it
 * matches the plain-data registry convention used elsewhere in `PackV0`.
 * (Registry fields are not pinned by ConfigSeal, so sealability is not the
 * reason — determinism + the convention are.)
 */

/** Closed, plain-data structural shape. `unknown` matches any value. */
export type OutputShape =
  | { readonly kind: "unknown" }
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "array"; readonly items: OutputShape }
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, OutputShape>>;
      /**
       * Field names permitted to be absent. Every other field declared in
       * `fields` is required; extra fields present on the value but absent from
       * `fields` are allowed (open structural match).
       */
      readonly optional?: ReadonlyArray<string>;
    };

/** A Pack's per-kind executor output contract. */
export interface ExecutorContract {
  /** Structural shape the executor's return value must satisfy for this kind. */
  readonly outputShape: OutputShape;
}

/** First structural mismatch found while validating a value against a shape. */
export interface StructuralMismatch {
  /** Dotted/bracketed path to the offending node ("" = root). */
  readonly path: string;
  /** Shape kind expected at that path. */
  readonly expected: string;
  /** Observed runtime type at that path (typeof, or "null"/"array"/"absent"). */
  readonly actual: string;
}

function observedType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function joinField(path: string, field: string): string {
  return path === "" ? field : `${path}.${field}`;
}

/**
 * Pure, synchronous first-mismatch walk. Returns the first
 * `StructuralMismatch` encountered (depth-first, in declared-field order), or
 * `null` if the value structurally satisfies the shape. No clock, no RNG, no
 * I/O — safe to run on every EXECUTE.
 */
export function validateOutputShape(
  value: unknown,
  shape: OutputShape,
): StructuralMismatch | null {
  return walkShape(value, shape, "");
}

function walkShape(
  value: unknown,
  shape: OutputShape,
  path: string,
): StructuralMismatch | null {
  switch (shape.kind) {
    case "unknown":
      return null;
    case "string":
    case "number":
    case "boolean":
      return typeof value === shape.kind
        ? null
        : { path, expected: shape.kind, actual: observedType(value) };
    case "array": {
      if (!Array.isArray(value)) {
        return { path, expected: "array", actual: observedType(value) };
      }
      for (let i = 0; i < value.length; i++) {
        const mismatch = walkShape(value[i], shape.items, `${path}[${i}]`);
        if (mismatch) return mismatch;
      }
      return null;
    }
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { path, expected: "object", actual: observedType(value) };
      }
      const optional = new Set(shape.optional ?? []);
      const record = value as Record<string, unknown>;
      for (const field of Object.keys(shape.fields)) {
        const fieldShape = shape.fields[field]!;
        const present = Object.prototype.hasOwnProperty.call(record, field);
        if (!present) {
          if (optional.has(field)) continue;
          return {
            path: joinField(path, field),
            expected: fieldShape.kind,
            actual: "absent",
          };
        }
        const mismatch = walkShape(record[field], fieldShape, joinField(path, field));
        if (mismatch) return mismatch;
      }
      return null;
    }
  }
}
