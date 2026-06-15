"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useTurnTraceByConversation } from "@/hooks/useTurnTrace";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

interface Call {
  turnId: string;
  callIndex: number;
  conversationId: string;
  intentHash: string | null;
  model: string;
  temperature: number;
  inputTokens: number;
  outputTokens: number;
  promptManifest: readonly string[];
  completion: string;
  durationMs: number;
  recordedAt: string;
  schemaVersion: number | null;
}

/** Group the conversation's calls into per-turn buckets, preserving order. */
function groupByTurn(calls: readonly Call[]): Array<{ turnId: string; calls: Call[] }> {
  const order: string[] = [];
  const byTurn = new Map<string, Call[]>();
  for (const c of calls) {
    if (!byTurn.has(c.turnId)) {
      byTurn.set(c.turnId, []);
      order.push(c.turnId);
    }
    byTurn.get(c.turnId)!.push(c);
  }
  return order.map((turnId) => ({ turnId, calls: byTurn.get(turnId)! }));
}

function CallCard({ call }: { call: Call }) {
  const phase = call.intentHash ? "responder" : "planner";
  return (
    <div className="rounded-sm border border-edge bg-panel/40 p-3 text-[11px]">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-muted">
        <span className="rounded-sm bg-canvas px-1.5 py-0.5 font-medium text-ink">
          call #{call.callIndex} · {phase}
        </span>
        <span>{call.model}</span>
        <span>· {call.inputTokens}+{call.outputTokens} tok</span>
        <span>· {call.durationMs}ms</span>
        <span>· {call.recordedAt}</span>
      </div>
      <div className="mb-1 text-faint">prompt manifest (id@hash)</div>
      <ul className="mb-2 flex flex-col gap-0.5">
        {call.promptManifest.map((m) => (
          <li key={m} className="font-mono text-muted">
            {m}
          </li>
        ))}
      </ul>
      {call.intentHash ? (
        <div className="mb-2 text-faint">
          intentHash:{" "}
          <code className="text-muted">{call.intentHash.slice(0, 16)}…</code>
        </div>
      ) : (
        <div className="mb-2 text-faint italic">no intentHash (planner phase)</div>
      )}
      <div className="mb-1 text-faint">completion (redacted)</div>
      <pre className="whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 text-muted">
        {call.completion}
      </pre>
    </div>
  );
}

export default function TurnTracePage({ params }: PageProps) {
  const { conversationId } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useTurnTraceByConversation(conversationId);

  const groups = data ? groupByTurn(data.calls as readonly Call[]) : [];

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex w-fit items-center gap-1 text-[11px] text-muted hover:text-ink"
        >
          <ChevronLeft size={12} /> back
        </button>
        <span className="text-[11px] text-faint">
          conversation <code className="text-muted">{conversationId}</code>
        </span>
      </div>

      {isLoading ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
          Loading turn trace…
        </div>
      ) : isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Failed to load turn trace. Try refreshing.
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] italic text-faint">
          No turn-trace rows for conversation{" "}
          <code className="text-muted">{conversationId}</code>.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.turnId} className="flex flex-col gap-2">
            <div className="text-[11px] font-medium text-ink">
              turn <code className="text-muted">{g.turnId}</code> · {g.calls.length}{" "}
              model call(s)
            </div>
            {g.calls.map((c) => (
              <CallCard key={`${c.turnId}:${c.callIndex}`} call={c} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
