"use client";

import type { AuditRecord } from "@adjudicate/core";
import { cn } from "@/lib/cn";

/**
 * Command-Risk badge (ADR-123). Renders when a decision carries a command-risk
 * validation basis (command_blocked / command_flag_stripped), reading the
 * category + command + stripped flags from `basis.detail`. No new endpoint —
 * the data rides on the existing audit record.
 */
const COMMAND_CODES = new Set(["command_blocked", "command_flag_stripped", "command_sanitized"]);

const CATEGORY_STYLE: Record<string, string> = {
  destructive: "text-red-300 border-red-500/40",
  network: "text-amber-300 border-amber-500/40",
  credential: "text-fuchsia-300 border-fuchsia-500/40",
};

export function CommandRiskBadge({ record }: { record: AuditRecord }) {
  const basis = record.decision_basis.find(
    (b) => b.category === "validation" && COMMAND_CODES.has(b.code),
  );
  if (!basis) return null;
  const detail = (basis.detail ?? {}) as {
    category?: string;
    command?: string;
    stripped?: string[];
    matchedRuleIds?: string[];
  };
  const category = detail.category ?? "destructive";

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="command-risk-badge">
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">Command Risk · ADR-123</span>
      </header>
      <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
        <span
          className={cn(
            "inline-block w-fit rounded-sm border px-1.5 py-0.5 uppercase tracking-section",
            CATEGORY_STYLE[category] ?? "text-muted border-edge",
          )}
        >
          {category} · {basis.code === "command_blocked" ? "blocked" : "sanitized"}
        </span>
        {detail.command ? (
          <code className="text-muted">{detail.command}</code>
        ) : null}
        {detail.stripped && detail.stripped.length > 0 ? (
          <span className="text-faint">stripped flags: {detail.stripped.join(", ")}</span>
        ) : null}
      </div>
    </section>
  );
}
