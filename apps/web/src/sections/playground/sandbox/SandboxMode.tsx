"use client";

import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { SandboxPackPicker } from "./SandboxPackPicker";
import { SandboxRawToggle } from "./SandboxRawToggle";
import { SandboxResult } from "./SandboxResult";
import { SchemaForm } from "./SchemaForm";
import {
  buildPayload,
  buildState,
  collectErrors,
  defaultKnobs,
  defaultPayload,
  type FieldValue,
} from "./sandbox-form-utils";
import { cn } from "@/lib/cn";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import type {
  SandboxIntentSchema,
  SandboxPackSchema,
} from "@/content/sandbox-schemas";
import { SANDBOX_SCHEMAS } from "@/content/sandbox-schemas";

/**
 * SandboxMode — the "Configure & test" surface.
 *
 * Owns all interactive state: which Pack/intent is selected, the form value
 * records (payload + state knobs), the raw-JSON escape hatch, and the run
 * result. The schema-aware form is the default; raw JSON is a demoted toggle.
 *
 * Run flow: in FORM mode we build payload/state from the form values; in RAW
 * mode (operator edited the JSON) we parse the textareas instead. Either way
 * we POST to /api/playground/adjudicate and hand the response to SandboxResult.
 *
 * Reduced-motion safe (no entrance animation; the only motion is the result
 * spinner, already gated). Determinism: initial selection is the first schema.
 */
export function SandboxMode({ className }: { readonly className?: string }) {
  const firstPack = SANDBOX_SCHEMAS[0]!;
  const firstIntent = firstPack.intents[0]!;

  const [packId, setPackId] = useState(firstPack.packId);
  const [intentKind, setIntentKind] = useState(firstIntent.intentKind);
  const [payload, setPayload] = useState<Record<string, FieldValue>>(() =>
    defaultPayload(firstIntent),
  );
  const [knobs, setKnobs] = useState<Record<string, FieldValue>>(() =>
    defaultKnobs(firstIntent),
  );

  // Raw escape hatch.
  const [rawOpen, setRawOpen] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [payloadText, setPayloadText] = useState("");
  const [stateText, setStateText] = useState("");

  // Run lifecycle.
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const intent = useMemo(
    () => findIntent(packId, intentKind),
    [packId, intentKind],
  );
  const hasState =
    intent.baseState !== undefined || (intent.stateKnobs ?? []).length > 0;

  const errors = useMemo(
    () => collectErrors(intent, payload, knobs),
    [intent, payload, knobs],
  );
  const formInvalid = Object.keys(errors).length > 0;

  // Live JSON parse for raw mode (drives inline errors + run gating).
  const rawPayloadParse = useMemo(() => parseJson(payloadText), [payloadText]);
  const rawStateParse = useMemo<ParseResult>(
    () =>
      stateText.trim() === ""
        ? { ok: true, value: undefined }
        : parseJson(stateText),
    [stateText],
  );
  const rawInvalid =
    rawMode && (!rawPayloadParse.ok || (hasState && !rawStateParse.ok));

  const runDisabled = busy || (rawMode ? rawInvalid : formInvalid);

  // ── Selection changes (re-seed everything) ──────────────────────────
  function selectIntent(next: SandboxIntentSchema): void {
    setIntentKind(next.intentKind);
    setPayload(defaultPayload(next));
    setKnobs(defaultKnobs(next));
    resetRawAndResult();
  }

  function selectPack(
    pack: SandboxPackSchema,
    next: SandboxIntentSchema,
  ): void {
    setPackId(pack.packId);
    selectIntent(next);
  }

  function resetRawAndResult(): void {
    setRawOpen(false);
    setRawMode(false);
    setPayloadText("");
    setStateText("");
    setResult(null);
    setError(null);
  }

  // ── Form edits leave raw mode (form becomes authoritative again) ─────
  function editPayload(name: string, value: FieldValue): void {
    setPayload((p) => ({ ...p, [name]: value }));
    if (rawMode) setRawMode(false);
  }
  function editKnob(name: string, value: FieldValue): void {
    setKnobs((k) => ({ ...k, [name]: value }));
    if (rawMode) setRawMode(false);
  }

  // ── Raw toggle: one-way form→raw seed on open ───────────────────────
  function handleRawOpen(open: boolean): void {
    setRawOpen(open);
    if (open) {
      // Seed from the CURRENT form values, every open, so the JSON starts
      // consistent with what the form shows.
      setPayloadText(JSON.stringify(buildPayload(intent, payload), null, 2));
      const state = buildState(intent, knobs);
      setStateText(state === undefined ? "" : JSON.stringify(state, null, 2));
    }
  }
  function editRawPayload(text: string): void {
    setPayloadText(text);
    setRawMode(true);
  }
  function editRawState(text: string): void {
    setStateText(text);
    setRawMode(true);
  }

  // ── Run ──────────────────────────────────────────────────────────────
  async function run(): Promise<void> {
    if (runDisabled) return;
    setBusy(true);
    setError(null);
    setResult(null);

    let body: { intentKind: string; payload: unknown; state?: unknown };
    if (rawMode) {
      if (!rawPayloadParse.ok) {
        setBusy(false);
        setError("Fix the raw payload JSON before running.");
        return;
      }
      body = { intentKind, payload: rawPayloadParse.value };
      if (hasState && rawStateParse.ok && rawStateParse.value !== undefined) {
        body.state = rawStateParse.value;
      }
    } else {
      body = { intentKind, payload: buildPayload(intent, payload) };
      const state = buildState(intent, knobs);
      if (state !== undefined) body.state = state;
    }

    try {
      const res = await fetch("/api/playground/adjudicate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | PlaygroundResponse
        | { error: string };
      if (!res.ok || "error" in json) {
        setError(
          "error" in json ? json.error : `Request failed (${res.status}).`,
        );
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("grid gap-8 lg:grid-cols-2", className)}>
      {/* ── Left: configure ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        <SandboxPackPicker
          packId={packId}
          intentKind={intentKind}
          onPickPack={selectPack}
          onPickIntent={selectIntent}
        />

        <SchemaForm
          intent={intent}
          payload={payload}
          knobs={knobs}
          errors={errors}
          onPayloadChange={editPayload}
          onKnobChange={editKnob}
        />

        <SandboxRawToggle
          open={rawOpen}
          payloadText={payloadText}
          stateText={stateText}
          hasState={hasState}
          payloadError={
            rawMode && !rawPayloadParse.ok ? rawPayloadParse.error : null
          }
          stateError={
            rawMode && hasState && !rawStateParse.ok ? rawStateParse.error : null
          }
          onOpenChange={handleRawOpen}
          onPayloadText={editRawPayload}
          onStateText={editRawState}
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={runDisabled}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-tight transition-shadow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
              runDisabled
                ? "cursor-not-allowed bg-edge text-muted"
                : "bg-gradient-primary text-white shadow-lg hover:shadow-xl",
            )}
          >
            <Play size={15} aria-hidden="true" />
            {busy ? "Running…" : "Run the kernel"}
          </button>

          {rawMode ? (
            <span className="inline-flex items-center rounded-full border border-escalate/40 bg-escalate/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-section text-escalate">
              raw mode
            </span>
          ) : null}

          {(rawMode ? rawInvalid : formInvalid) && !busy ? (
            <span className="text-[12px] text-muted">
              Resolve the highlighted field
              {rawMode ? " JSON" : "s"} to run.
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Right: outcome ────────────────────────────────────────────── */}
      <SandboxResult
        result={result}
        error={error}
        busy={busy}
        className="lg:sticky lg:top-6 lg:self-start"
      />
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function findIntent(
  packId: string,
  intentKind: string,
): SandboxIntentSchema {
  const pack =
    SANDBOX_SCHEMAS.find((p) => p.packId === packId) ?? SANDBOX_SCHEMAS[0]!;
  return (
    pack.intents.find((i) => i.intentKind === intentKind) ?? pack.intents[0]!
  );
}

type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid JSON.",
    };
  }
}
