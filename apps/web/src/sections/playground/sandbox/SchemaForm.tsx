"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { isNumeric, type FieldValue } from "./sandbox-form-utils";
import type {
  SandboxField,
  SandboxIntentSchema,
  StateKnob,
} from "@/content/sandbox-schemas";
import { cn } from "@/lib/cn";

/**
 * SchemaForm — the generic, schema-aware form that replaces the raw-JSON tabs.
 *
 * Renders an intent's `payloadFields` under "Inputs (payload)" and its
 * `stateKnobs` under "State (what the world looks like)". Each field maps to a
 * control by type: string→text, enum→select, number/integer/money→number input
 * (or slider when bounded), boolean→toggle. Help is inline; validation errors
 * wire to the input via `aria-describedby`.
 *
 * Fully controlled: the parent owns `payload` / `knobs` value records and the
 * `errors` map, and supplies change handlers. Pure presentational beyond that.
 */
export function SchemaForm({
  intent,
  payload,
  knobs,
  errors,
  onPayloadChange,
  onKnobChange,
}: {
  readonly intent: SandboxIntentSchema;
  readonly payload: Record<string, FieldValue>;
  readonly knobs: Record<string, FieldValue>;
  readonly errors: Record<string, string>;
  readonly onPayloadChange: (name: string, value: FieldValue) => void;
  readonly onKnobChange: (name: string, value: FieldValue) => void;
}) {
  const stateKnobs = intent.stateKnobs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup
        title="Inputs (payload)"
        hint="What the AI is asking to do."
      >
        {intent.payloadFields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            value={payload[field.name]}
            error={errors[field.name]}
            onChange={(v) => onPayloadChange(field.name, v)}
          />
        ))}
      </FieldGroup>

      {stateKnobs.length > 0 ? (
        <FieldGroup
          title="State (what the world looks like)"
          hint="Pre-existing facts the kernel reads — not part of the request."
        >
          {stateKnobs.map((knob) => (
            <FieldControl
              key={knob.name}
              field={knob}
              value={knobs[knob.name]}
              error={errors[knob.name]}
              onChange={(v) => onKnobChange(knob.name, v)}
            />
          ))}
        </FieldGroup>
      ) : null}
    </div>
  );
}

// ── Grouped section ──────────────────────────────────────────────────────

function FieldGroup({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-console-edge bg-console-canvas/40 p-4">
      <legend className="flex items-baseline gap-2 px-1">
        <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          {title}
        </span>
      </legend>
      <p className="-mt-1 text-[12px] text-console-muted">{hint}</p>
      <div className="flex flex-col gap-5">{children}</div>
    </fieldset>
  );
}

// ── Per-field control router ─────────────────────────────────────────────

function FieldControl({
  field,
  value: rawValue,
  error,
  onChange,
}: {
  readonly field: SandboxField | StateKnob;
  readonly value: FieldValue | undefined;
  readonly error?: string;
  readonly onChange: (value: FieldValue) => void;
}) {
  // A controlled input must never receive `undefined`; fall back per type.
  const value: FieldValue =
    rawValue ?? (field.type === "boolean" ? false : isNumeric(field) ? 0 : "");
  const reactId = useId();
  const inputId = `sf-${field.name}-${reactId}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(" ") || undefined;

  const useSlider =
    field.control === "slider" ||
    (isNumeric(field) && field.min !== undefined && field.max !== undefined);
  const useSelect = field.type === "enum";
  const useToggle = field.type === "boolean";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={useToggle ? undefined : inputId}
          id={useToggle ? `${inputId}-label` : undefined}
          className="text-[13px] font-medium text-console-ink"
        >
          {field.label}
          {field.required ? (
            <span className="ml-1 text-refuse" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {field.type === "money-centavos" ? (
          <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
            centavos
          </span>
        ) : null}
      </div>

      {useToggle ? (
        <ToggleControl
          inputId={inputId}
          labelId={`${inputId}-label`}
          value={Boolean(value)}
          describedBy={describedBy}
          invalid={Boolean(error)}
          onChange={onChange}
        />
      ) : useSelect ? (
        <SelectControl
          inputId={inputId}
          value={String(value)}
          options={field.enumValues ?? []}
          describedBy={describedBy}
          invalid={Boolean(error)}
          onChange={onChange}
        />
      ) : useSlider ? (
        <SliderControl
          inputId={inputId}
          field={field}
          value={Number(value)}
          describedBy={describedBy}
          onChange={onChange}
        />
      ) : isNumeric(field) ? (
        <NumberControl
          inputId={inputId}
          field={field}
          value={value}
          describedBy={describedBy}
          invalid={Boolean(error)}
          onChange={onChange}
        />
      ) : (
        <TextControl
          inputId={inputId}
          value={String(value)}
          describedBy={describedBy}
          invalid={Boolean(error)}
          onChange={onChange}
        />
      )}

      {field.help ? (
        <p id={helpId} className="text-[11px] leading-snug text-console-muted">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-[11px] font-medium text-refuse">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────

const INPUT_BASE = cn(
  "w-full rounded-lg border bg-console-panel px-3 py-2 text-sm text-console-ink placeholder:text-console-faint",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40",
);

function TextControl({
  inputId,
  value,
  describedBy,
  invalid,
  onChange,
}: {
  readonly inputId: string;
  readonly value: string;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <input
      id={inputId}
      type="text"
      value={value}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(INPUT_BASE, invalid ? "border-refuse/60" : "border-console-edge")}
    />
  );
}

function NumberControl({
  inputId,
  field,
  value,
  describedBy,
  invalid,
  onChange,
}: {
  readonly inputId: string;
  readonly field: SandboxField;
  readonly value: FieldValue;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <input
      id={inputId}
      type="number"
      inputMode="numeric"
      value={typeof value === "number" || typeof value === "string" ? value : ""}
      min={field.min}
      max={field.max}
      step={field.type === "number" ? "any" : 1}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className={cn(
        INPUT_BASE,
        "font-mono",
        invalid ? "border-refuse/60" : "border-console-edge",
      )}
    />
  );
}

function SliderControl({
  inputId,
  field,
  value,
  describedBy,
  onChange,
}: {
  readonly inputId: string;
  readonly field: SandboxField;
  readonly value: number;
  readonly describedBy?: string;
  readonly onChange: (value: number) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  return (
    <div className="flex items-center gap-3">
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={field.type === "number" ? "any" : 1}
        value={value}
        aria-describedby={describedBy}
        aria-valuetext={String(value)}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-console-edge accent-escalate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40"
      />
      <span className="min-w-[4rem] rounded-md border border-console-edge bg-console-panel px-2 py-1 text-right font-mono text-[12px] tabular-nums text-console-ink">
        {value}
      </span>
    </div>
  );
}

function SelectControl({
  inputId,
  value,
  options,
  describedBy,
  invalid,
  onChange,
}: {
  readonly inputId: string;
  readonly value: string;
  readonly options: ReadonlyArray<string>;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        id={inputId}
        value={value}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          INPUT_BASE,
          "appearance-none pr-9",
          invalid ? "border-refuse/60" : "border-console-edge",
        )}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-console-faint"
      />
    </div>
  );
}

function ToggleControl({
  inputId,
  labelId,
  value,
  describedBy,
  invalid,
  onChange,
}: {
  readonly inputId: string;
  readonly labelId: string;
  readonly value: boolean;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <button
      id={inputId}
      type="button"
      role="switch"
      aria-checked={value}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40",
        value ? "border-transparent bg-execute" : "border-console-edge bg-console-edge",
      )}
    >
      <span
        className={cn(
          "ml-0.5 size-5 rounded-full bg-white shadow transition motion-reduce:transition-none",
          value ? "translate-x-5" : "translate-x-0",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
