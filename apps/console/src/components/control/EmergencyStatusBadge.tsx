"use client";

import Link from "next/link";
import { useEmergencyState } from "@/hooks/useEmergencyState";
import { cn } from "@/lib/cn";

/**
 * Compact emergency-status indicator for the top bar.
 *
 * Always linked to /control so operators reach the panel from anywhere.
 * Suppressed during loading to avoid flash; renders a discreet NORMAL
 * dot when at rest; renders a pulsing red badge when DENY_ALL is
 * engaged.
 */
export function EmergencyStatusBadge() {
  const { data: state } = useEmergencyState();
  if (!state) return null;

  const isActive = state.status === "DENY_ALL";

  return (
    <Link
      href="/control"
      className={cn(
        "flex items-center gap-1 rounded-sm border px-2 py-1 transition-colors",
        isActive
          ? "border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          : "border-edge bg-canvas text-muted hover:text-ink",
      )}
      title={
        isActive
          ? `DENY_ALL — ${state.reason}`
          : "NORMAL — kernel operating per policy"
      }
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isActive ? "animate-pulse bg-red-400" : "bg-emerald-400",
        )}
      />
      {isActive ? "DENY_ALL" : "NORMAL"}
    </Link>
  );
}
