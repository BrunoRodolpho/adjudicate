"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Turn-trace landing (responder-trace-admin C3). Enter a conversationId to walk
 * its per-turn LLM-call timeline (prompt manifest → model I/O → completion,
 * grouped by turn). In dev mode (no DATABASE_URL) the seeded demo conversation
 * is linked below.
 */
export default function TurnTraceLanding() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-sm font-medium text-ink">Turn trace</h1>
      <p className="max-w-prose text-[11px] text-muted">
        Walk one conversation end-to-end: every planner/responder model call,
        with its content-addressed prompt manifest (id@hash), redacted
        completion, tokens, and the decision intentHash — grouped by turn.
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = value.trim();
          if (id.length > 0) router.push(`/turn-trace/${encodeURIComponent(id)}`);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="conversationId"
          className="w-80 rounded-sm border border-edge bg-canvas px-2 py-1 text-[11px] text-ink"
        />
        <button
          type="submit"
          className="rounded-sm border border-edge bg-panel/40 px-2 py-1 text-[11px] text-muted hover:text-ink"
        >
          Open
        </button>
      </form>
      <Link
        href="/turn-trace/demo-conv-1"
        className="w-fit text-[11px] text-muted underline hover:text-ink"
      >
        Open the demo conversation →
      </Link>
    </div>
  );
}
