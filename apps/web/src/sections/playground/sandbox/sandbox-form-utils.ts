/**
 * Shared form helpers for SANDBOX mode.
 *
 * Pure functions (no React) so `SandboxMode`, `SchemaForm`, and the raw toggle
 * all derive defaults / coerce values / set deep state paths the same way.
 */

import type {
  SandboxField,
  SandboxIntentSchema,
  StateKnob,
} from "@/content/sandbox-schemas";

export type FieldValue = string | number | boolean;

/** Seed a flat record of payload values from the intent's field defaults. */
export function defaultPayload(
  intent: SandboxIntentSchema,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of intent.payloadFields) {
    out[f.name] = defaultFor(f);
  }
  return out;
}

/** Seed a flat record of state-knob values from their defaults. */
export function defaultKnobs(
  intent: SandboxIntentSchema,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const k of intent.stateKnobs ?? []) {
    out[k.name] = defaultFor(k);
  }
  return out;
}

function defaultFor(f: SandboxField): FieldValue {
  if (f.default !== undefined) return f.default as FieldValue;
  switch (f.type) {
    case "boolean":
      return false;
    case "number":
    case "integer":
    case "money-centavos":
      return f.min ?? 0;
    case "enum":
      return f.enumValues?.[0] ?? "";
    default:
      return "";
  }
}

/** Is this field rendered with a numeric control? */
export function isNumeric(f: SandboxField): boolean {
  return (
    f.type === "number" || f.type === "integer" || f.type === "money-centavos"
  );
}

/**
 * Coerce a raw control value into the JSON type the kernel payload expects.
 * Numeric fields become numbers; everything else passes through. A missing
 * value falls back to the field's default so the kernel never sees holes.
 */
export function coerce(f: SandboxField, raw: FieldValue | undefined): FieldValue {
  const v = raw ?? defaultFor(f);
  if (isNumeric(f)) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}

/** Per-field validation message, or null when the value is acceptable. */
export function fieldError(
  f: SandboxField,
  raw: FieldValue | undefined,
): string | null {
  if (f.required) {
    if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      return "Required.";
    }
  }
  if (raw === undefined) return null;
  if (isNumeric(f)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return "Enter a number.";
    if (f.type === "integer" && !Number.isInteger(n)) {
      return "Whole number only.";
    }
    if (f.min !== undefined && n < f.min) return `Minimum is ${f.min}.`;
    if (f.max !== undefined && n > f.max) return `Maximum is ${f.max}.`;
  }
  return null;
}

/**
 * Build the kernel `payload` object from the form's flat value record,
 * coercing each field to its JSON type.
 */
export function buildPayload(
  intent: SandboxIntentSchema,
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of intent.payloadFields) {
    out[f.name] = coerce(f, values[f.name]);
  }
  return out;
}

/**
 * Build the kernel `state` object by cloning the intent's `baseState` and
 * writing each knob's coerced value into its dot `statePath`. Returns
 * `undefined` when the intent has no base state and no knobs.
 */
export function buildState(
  intent: SandboxIntentSchema,
  knobValues: Record<string, FieldValue>,
): unknown {
  const knobs = intent.stateKnobs ?? [];
  if (intent.baseState === undefined && knobs.length === 0) return undefined;
  const state = structuredClone(intent.baseState ?? {});
  for (const k of knobs) {
    setDeep(state, k.statePath, coerce(k, knobValues[k.name]));
  }
  return state;
}

/** Set `obj[a][b][c] = value` from a dot path, creating objects as needed. */
function setDeep(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) return;
  let cursor = obj as Record<string, unknown>;
  for (const key of keys) {
    if (typeof cursor[key] !== "object" || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[last] = value;
}

/** Collect every validation error for the intent, keyed by field name. */
export function collectErrors(
  intent: SandboxIntentSchema,
  payload: Record<string, FieldValue>,
  knobs: Record<string, FieldValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of intent.payloadFields) {
    const err = fieldError(f, payload[f.name]);
    if (err) errors[f.name] = err;
  }
  for (const k of intent.stateKnobs ?? []) {
    const err = fieldError(k, knobs[k.name]);
    if (err) errors[k.name] = err;
  }
  return errors;
}

export type { StateKnob };
