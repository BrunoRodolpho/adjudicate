"use client";

import { Activity, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { EmergencyStatusBadge } from "@/components/control/EmergencyStatusBadge";
import { cn } from "@/lib/cn";
import { getClientGatewayMode, modeLabel } from "@/lib/runtime-mode";

/**
 * Top bar.
 *
 * Logo: link home. Search: controlled input → form submit routes to
 * `/decisions/[hash]` when the value looks hash-shaped, otherwise filters
 * the audit list by `intentHash` (which is what an operator pasting half
 * a hash actually wants).
 *
 * Mode indicator: read once at module load. Green when live (the wire
 * contract is in use); amber when mock (static demo). Operators
 * reviewing audit data must never confuse environments — this chip is
 * the single source of truth in the chrome.
 */
export function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (/^(0x)?[0-9a-f]{16,}$/i.test(trimmed)) {
      router.push(`/decisions/${trimmed}`);
    } else {
      router.push(`/?intentHash=${encodeURIComponent(trimmed)}`);
    }
  };

  const mode = getClientGatewayMode();
  const isLive = mode === "live";

  return (
    <header className="flex h-9 items-center justify-between border-b border-edge bg-panel px-3 text-xs">
      <div className="flex items-center gap-3 text-muted">
        <Link
          href="/"
          className="font-semibold text-ink transition-opacity hover:opacity-80"
        >
          ⌘ adjudicate
        </Link>
        <span className="text-faint">/</span>
        <span>console</span>
      </div>
      <div className="flex items-center gap-3">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-sm border border-edge bg-canvas px-2 py-1 text-faint focus-within:border-ink/30"
        >
          <Search size={12} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="intentHash · sessionId"
            className="w-72 bg-transparent text-ink placeholder:text-faint focus:outline-none"
          />
        </form>
        <EmergencyStatusBadge />
        <span
          className={cn(
            "flex items-center gap-1 rounded-sm border px-2 py-1",
            isLive
              ? "border-emerald-700/40 bg-emerald-500/5 text-emerald-300"
              : "border-amber-700/40 bg-amber-500/5 text-amber-300",
          )}
          title={
            isLive
              ? "Client → /api/admin/trpc → @adjudicate/admin-sdk"
              : "Client reads ALL_MOCKS in-process; no HTTP"
          }
        >
          <Activity size={11} /> {modeLabel(mode)}
        </span>
      </div>
    </header>
  );
}
