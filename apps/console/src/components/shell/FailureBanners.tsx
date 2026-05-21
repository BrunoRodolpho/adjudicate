"use client";

import { AlertTriangle, Clock, GitBranch } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useLiveTailContext } from "./LiveTailContext";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { useDLQStatus } from "@/hooks/useDLQStatus";

/**
 * Failure-state banners (T-086).
 *
 * Three independent banners stack at the top of every page when their
 * trigger condition is met:
 *
 *   1. Postgres lag — the most recent audit row is older than 5 minutes.
 *      Threshold chosen to ride out small batch-flush delays; below 5min
 *      operators usually don't want a banner. The live-tail clock is
 *      the truth: "audit query is N seconds behind. Live tail is current."
 *
 *   2. DLQ — any in-memory dead-letter queue has pending entries. Backed
 *      by {@link useDLQStatus}, currently a stub returning `{ pending: 0 }`
 *      until the admin-sdk surfaces a `dlqStatus` procedure.
 *
 *   3. Drift — any drift refusal code fired in the last hour. Cheap
 *      derivation from the audit table; reuses the same drift-code list
 *      DriftPanel uses.
 *
 * Banners are color-coded — amber for "investigate", red for "act now".
 */
const DRIFT_CODES = new Set([
  "basis_code_drift",
  "rewrite_taint_regression",
  "defer_signal_drift",
  "rewrite_scope_violation",
  "guard_panic",
  "park_blob_tampered",
]);

const POSTGRES_LAG_THRESHOLD_MS = 5 * 60 * 1000;

export function FailureBanners() {
  const since = useMemo(
    () => new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    [],
  );
  const { data } = useAuditQuery({ since, limit: 200 });
  const dlq = useDLQStatus();
  const liveTail = useLiveTailContext();

  // Postgres lag: derive from the most recent record's `at`. Skip when
  // there are no records at all (test environments / fresh installs).
  const banners: BannerSpec[] = [];
  const mostRecentAt = data?.records[0]?.at;
  if (mostRecentAt) {
    const lagMs = Date.now() - new Date(mostRecentAt).getTime();
    if (lagMs > POSTGRES_LAG_THRESHOLD_MS) {
      banners.push({
        key: "lag",
        tone: "amber",
        icon: Clock,
        text: `Audit query is ${Math.round(lagMs / 1000)}s behind.${
          liveTail.enabled ? " Live tail is current." : ""
        }`,
      });
    }
  }

  // DLQ. Stub returns 0 today — banner only fires when wired up.
  if (dlq.data.pending > 0) {
    banners.push({
      key: "dlq",
      tone: "red",
      icon: AlertTriangle,
      text: `Audit DLQ has ${dlq.data.pending} pending record${
        dlq.data.pending === 1 ? "" : "s"
      }. Sink flush is stalled.`,
    });
  }

  // Drift in the last hour.
  const driftCount = (data?.records ?? []).reduce((n, r) => {
    if (r.decision.kind !== "REFUSE") return n;
    return DRIFT_CODES.has(r.decision.refusal.code) ? n + 1 : n;
  }, 0);
  if (driftCount > 0) {
    banners.push({
      key: "drift",
      tone: "red",
      icon: GitBranch,
      text: `Pack drift detected — ${driftCount} drift event${
        driftCount === 1 ? "" : "s"
      } in the last hour.`,
      action: { href: "/dashboard", label: "View drift" },
    });
  }

  if (banners.length === 0) {
    // Render nothing — no extra DOM means no surprises in screenshot tests.
    return null;
  }

  return (
    <div className="flex flex-col gap-px border-b border-edge">
      {banners.map((b) => {
        const Icon = b.icon;
        return (
          <div
            key={b.key}
            className={
              b.tone === "red"
                ? "flex items-center gap-2 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-200"
                : "flex items-center gap-2 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-200"
            }
          >
            <Icon
              size={12}
              className={
                b.tone === "red" ? "text-red-300" : "text-amber-300"
              }
            />
            <span>{b.text}</span>
            {b.action ? (
              <Link
                href={b.action.href}
                className="ml-auto text-[11px] underline decoration-current decoration-dotted underline-offset-2 hover:text-ink"
              >
                {b.action.label}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface BannerSpec {
  readonly key: string;
  readonly tone: "amber" | "red";
  readonly icon: React.ComponentType<{ size?: number; className?: string }>;
  readonly text: string;
  readonly action?: { href: string; label: string };
}
