"use client";

import { Code2 } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * SandboxRawToggle — the DEMOTED expert escape hatch.
 *
 * Collapsed by default inside a native <details>. When the operator opens it,
 * the parent does a ONE-WAY form→raw sync (it fills `payloadText` / `stateText`
 * from the current form values) so the textareas start consistent with the
 * form. From then on the raw text is authoritative: typing here and running
 * sends the parsed JSON and flips the parent into "raw mode" (shown as a badge
 * near the Run button). The form above is intentionally NOT kept in sync — raw
 * mode is the override.
 *
 * JSON parse errors are surfaced inline per textarea; the parent reuses the
 * same parse to decide whether Run is allowed.
 */
export function SandboxRawToggle({
  open,
  payloadText,
  stateText,
  hasState,
  payloadError,
  stateError,
  onOpenChange,
  onPayloadText,
  onStateText,
}: {
  readonly open: boolean;
  readonly payloadText: string;
  readonly stateText: string;
  /** Whether this intent carries a state object (hides the state box if not). */
  readonly hasState: boolean;
  readonly payloadError?: string | null;
  readonly stateError?: string | null;
  /** Fires on toggle; `true` means the parent should seed the textareas. */
  readonly onOpenChange: (open: boolean) => void;
  readonly onPayloadText: (text: string) => void;
  readonly onStateText: (text: string) => void;
}) {
  const reactId = useId();
  const payloadId = `raw-payload-${reactId}`;
  const stateId = `raw-state-${reactId}`;
  const payloadErrId = `${payloadId}-err`;
  const stateErrId = `${stateId}-err`;

  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange((e.target as HTMLDetailsElement).open)}
      className="rounded-xl border border-edge bg-canvas/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-muted transition hover:text-ink">
        <Code2 size={15} aria-hidden="true" className="text-faint" />
        Advanced: edit raw JSON
        <span className="ml-auto font-mono text-[10px] uppercase tracking-section text-faint">
          {open ? "hide" : "expert"}
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-edge px-4 py-4">
        <p className="text-[11px] leading-snug text-muted">
          Editing here overrides the form above — runs send this JSON verbatim
          and a &ldquo;raw mode&rdquo; badge appears on the Run button.
        </p>

        <RawBox
          id={payloadId}
          label="payload"
          value={payloadText}
          error={payloadError}
          errId={payloadErrId}
          onChange={onPayloadText}
        />

        {hasState ? (
          <RawBox
            id={stateId}
            label="state"
            value={stateText}
            error={stateError}
            errId={stateErrId}
            onChange={onStateText}
          />
        ) : null}
      </div>
    </details>
  );
}

function RawBox({
  id,
  label,
  value,
  error,
  errId,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error?: string | null;
  readonly errId: string;
  readonly onChange: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-section text-faint"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        spellCheck={false}
        rows={8}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full resize-y rounded-lg border bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
          error ? "border-refuse/60" : "border-edge",
        )}
      />
      {error ? (
        <p id={errId} role="alert" className="text-[11px] font-medium text-refuse">
          {error}
        </p>
      ) : null}
    </div>
  );
}
