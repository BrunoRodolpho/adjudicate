"use client";

import { useState } from "react";
import type { AuditRecord, Decision } from "@adjudicate/core";
import { DECISIONS_ORDER, DECISIONS } from "@/content/decisions";
import { DecisionBadge } from "@/components/motion/DecisionBadge";
import { CodeBlock } from "@/components/ui/CodeBlock";

interface PlaygroundResponse {
  decision: Decision;
  record: AuditRecord;
  packId: string;
  packName: string;
}

export function DecisionLab() {
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
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs uppercase tracking-section text-faint">
            Presets:
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
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="self-start rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-medium text-white shadow-md transition-shadow hover:shadow-lg disabled:opacity-50"
        >
          {busy ? "Adjudicating…" : "Adjudicate →"}
        </button>
      </div>

      <div className="flex min-h-[320px] flex-col gap-3 rounded-lg border border-edge bg-surface p-4">
        {error ? (
          <div className="rounded-md border border-refuse/30 bg-refuse/10 px-3 py-2 text-sm text-refuse">
            {error}
          </div>
        ) : null}
        {result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <DecisionBadge kind={result.decision.kind} size="lg" />
              <span className="text-xs text-muted">{result.packName}</span>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-section text-faint">
                Basis
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {result.decision.basis.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink"
                  >
                    {b.category}:{b.code}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-section text-faint">
                AuditRecord (truncated)
              </div>
              <CodeBlock
                code={JSON.stringify(
                  {
                    version: result.record.version,
                    intentHash: result.record.intentHash.slice(0, 12) + "…",
                    decision: { kind: result.decision.kind },
                    at: result.record.at,
                    durationMs: result.record.durationMs,
                  },
                  null,
                  2,
                )}
              />
            </div>
          </div>
        ) : !error ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted">
            Pick a preset or write your own payload, then press
            <br />
            <span className="font-mono text-ink">Adjudicate →</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
