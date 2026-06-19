"use client";

import { Link, Unlink } from "lucide-react";
import type { AuditQueryResult } from "@adjudicate/admin-sdk";

export interface ChainVerifyStatusProps {
  /**
   * The 093 inter-record hash-chain continuity over the rendered page, surfaced
   * by `audit.query`. `undefined` when the store did not compute it; an object
   * with `checked` (links assessable against an in-window predecessor) and
   * `breaks` (links that did NOT match — a deleted/reordered record).
   */
  chainIntegrity: AuditQueryResult["chainIntegrity"];
}

/**
 * 112 — chain-integrity (hash-chain continuity) verdict for the Audit Explorer.
 *
 * This is a READ-only continuity SIGNAL over the rendered page: a `break` is a
 * record whose `prevAuditHash` does not equal its in-window predecessor's
 * `auditHash` (a deleted or reordered record). It is window-scoped (out-of-window
 * predecessors are not flagged), so it is a per-page signal, not a global proof —
 * the full-chain proof is the external signed checkpoint (CI/batch), never run on
 * this live read plane. DENY-BY-DEFAULT: any break renders the loud red state.
 */
export function ChainVerifyStatus({ chainIntegrity }: ChainVerifyStatusProps) {
  if (chainIntegrity === undefined) {
    return (
      <div
        data-testid="chain-status"
        data-state="unverified"
        className="flex items-center gap-1.5 rounded-sm border border-amber-400/40 bg-panel/30 px-3 py-1.5 text-[10px] text-amber-300"
      >
        <Link aria-hidden="true" className="h-3 w-3" />
        Chain continuity not computed by this store.
      </div>
    );
  }

  const breakCount = chainIntegrity.breaks.length;
  const intact = breakCount === 0;

  return (
    <div
      data-testid="chain-status"
      data-state={intact ? "intact" : "broken"}
      role="status"
      className={
        intact
          ? "flex items-center gap-1.5 rounded-sm border border-emerald-400/40 bg-panel/30 px-3 py-1.5 text-[10px] text-emerald-300"
          : "flex items-center gap-1.5 rounded-sm border border-red-400/60 bg-red-500/10 px-3 py-1.5 text-[10px] font-medium text-red-300"
      }
    >
      {intact ? (
        <Link aria-hidden="true" className="h-3 w-3" />
      ) : (
        <Unlink aria-hidden="true" className="h-3 w-3" />
      )}
      {intact
        ? `Chain intact · ${chainIntegrity.checked} link${chainIntegrity.checked === 1 ? "" : "s"} verified`
        : `${breakCount} broken chain link${breakCount === 1 ? "" : "s"} — deleted or reordered record. Investigate.`}
    </div>
  );
}
