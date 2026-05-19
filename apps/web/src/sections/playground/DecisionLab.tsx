"use client";

import { useState } from "react";
import { DECISIONS_ORDER, DECISIONS } from "@/content/decisions";
import { PACK_PRESETS, PACK_DISPLAY_NAME, type PackPreset } from "@/content/pack-presets";
import { WorkedExamplePanel } from "@/components/playground/WorkedExamplePanel";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import { useAuditLog } from "./audit-log-context";
import { PayloadSchema } from "./PayloadSchema";

export function DecisionLab() {
  const { push } = useAuditLog();
  const [intentKind, setIntentKind] = useState<string>(
    DECISIONS.EXECUTE.playgroundPreset.intentKind,
  );
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(DECISIONS.EXECUTE.playgroundPreset.payload, null, 2),
  );
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function preset(kind: typeof DECISIONS_ORDER[number]) {
    const p = DECISIONS[kind].playgroundPreset;
    setIntentKind(p.intentKind);
    setPayloadText(JSON.stringify(p.payload, null, 2));
  }

  function loadPackPreset(p: PackPreset) {
    setIntentKind(p.intentKind);
    setPayloadText(JSON.stringify(p.payload, null, 2));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setError("Payload is not valid JSON.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/playground/adjudicate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentKind, payload }),
      });
      const data = (await res.json()) as PlaygroundResponse | { error: string };
      if (!res.ok) {
        setError(
          "error" in data ? data.error : "Unexpected error",
        );
      } else if ("error" in data) {
        setError(data.error);
      } else {
        setResult(data);
        push({
          intentKind: data.record.envelope.kind,
          decision: data.decision,
          at: data.record.at,
          packName: data.packName,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-section text-muted">
            Intent kind
          </label>
          <input
            value={intentKind}
            onChange={(e) => setIntentKind(e.target.value)}
            className="w-full rounded-md border border-edge bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-section text-muted">
            Payload (JSON)
          </label>
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-edge bg-canvas px-3 py-2 font-mono text-xs text-ink focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <PayloadSchema intentKind={intentKind} />
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs uppercase tracking-section text-faint">
            By decision kind (Deployments Pack):
          </span>
          {DECISIONS_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => preset(k)}
              className={`rounded-full border ${DECISIONS[k].border} ${DECISIONS[k].bg} ${DECISIONS[k].accent} px-2.5 py-1 text-[11px] font-medium`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-section text-faint">
            By Pack (cross-domain scenarios):
          </span>
          {Object.entries(PACK_PRESETS).map(([packId, presets]) => (
            <div key={packId} className="flex flex-wrap items-baseline gap-1.5">
              <span className="self-center text-[10px] uppercase tracking-section text-muted">
                {PACK_DISPLAY_NAME[packId] ?? packId}:
              </span>
              {presets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => loadPackPreset(p)}
                  title={p.description}
                  className="rounded-full border border-edge bg-canvas px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  {p.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="self-start rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-medium text-white shadow-md transition-shadow hover:shadow-lg disabled:opacity-50"
        >
          {busy ? "Adjudicating…" : "Adjudicate →"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {error ? (
          <div className="rounded-md border border-refuse/30 bg-refuse/10 px-3 py-2 text-sm text-refuse">
            {error}
          </div>
        ) : null}
        {result ? (
          <WorkedExamplePanel result={result} />
        ) : !error ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-edge bg-surface p-4 text-center text-sm text-muted">
            Pick a preset or write your own payload, then press
            <br />
            <span className="font-mono text-ink">Adjudicate →</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
