"use client";

import { Activity, AlertCircle, Info, Shield } from "lucide-react";
import { useState } from "react";
import type { EmergencyStatus } from "@adjudicate/admin-sdk";
import { useEmergencyState } from "@/hooks/useEmergencyState";
import { useUpdateEmergencyState } from "@/hooks/useUpdateEmergencyState";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import {
  coordinationLabel,
  getEmergencyCoordinationMode,
} from "@/lib/runtime-mode";
import { EmergencyDialog } from "./EmergencyDialog";
import { EmergencyHistoryList } from "./EmergencyHistoryList";

export function KillSwitchPanel() {
  const { data: state, isLoading } = useEmergencyState();
  const update = useUpdateEmergencyState();
  const [dialogTarget, setDialogTarget] = useState<EmergencyStatus | null>(
    null,
  );

  if (isLoading || !state) {
    return (
      <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
        Loading emergency state…
      </div>
    );
  }

  const isActive = state.status === "DENY_ALL";

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-sm border-2 p-4",
        isActive
          ? "border-red-500/60 bg-red-500/5"
          : "border-edge bg-panel/40",
      )}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive ? (
            <AlertCircle className="text-red-300" size={20} />
          ) : (
            <Shield className="text-emerald-300" size={20} />
          )}
          <h2
            className={cn(
              "text-sm font-semibold",
              isActive ? "text-red-200" : "text-ink",
            )}
          >
            {isActive
              ? "DENY_ALL — kernel refusing all intents"
              : "NORMAL — operating per policy"}
          </h2>
        </div>
        <StatusBadge status={state.status} />
      </header>

      <CoordinationNotice />


      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-faint">last toggled</dt>
        <dd className="text-muted">
          <time
            dateTime={state.toggledAt}
            title={state.toggledAt}
            className="tabular-nums"
          >
            {formatRelative(state.toggledAt)}
          </time>
        </dd>
        <dt className="text-faint">by</dt>
        <dd className="text-muted">
          {state.toggledBy.displayName ?? state.toggledBy.id}
          <span className="ml-1 text-faint">({state.toggledBy.id})</span>
        </dd>
        <dt className="text-faint">reason</dt>
        <dd className="italic text-ink/90">{state.reason}</dd>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-edge pt-3">
        <p className="text-[10px] text-faint">
          Pack-level overrides require Kernel v1.x compatible runtime. Phase 2a
          ships global only — DENY_ALL halts the entire kernel.
        </p>
        {isActive ? (
          <button
            type="button"
            onClick={() => setDialogTarget("NORMAL")}
            className="shrink-0 rounded-sm border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/10"
          >
            Restore NORMAL
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDialogTarget("DENY_ALL")}
            className="shrink-0 rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-red-300 hover:bg-red-500/10"
          >
            Engage DENY_ALL
          </button>
        )}
      </div>

      {dialogTarget ? (
        <EmergencyDialog
          targetStatus={dialogTarget}
          onClose={() => setDialogTarget(null)}
          onConfirm={async ({ reason, confirmationPhrase }) => {
            await update.mutateAsync({
              newStatus: dialogTarget,
              reason,
              confirmationPhrase,
            });
            setDialogTarget(null);
          }}
          isPending={update.isPending}
        />
      ) : null}

      <EmergencyHistoryList />
    </article>
  );
}

function CoordinationNotice() {
  const mode = getEmergencyCoordinationMode();
  const label = coordinationLabel(mode);
  if (mode === "redis") {
    return (
      <div className="flex items-start gap-2 rounded-sm border border-emerald-700/40 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-200">
        <Activity size={12} className="mt-0.5 shrink-0 text-emerald-300" />
        <p>
          <span className="font-semibold">{label}.</span> Toggles write to the
          shared Redis key the kernel's{" "}
          <code className="rounded-sm bg-edge/40 px-1">
            DistributedKillSwitch
          </code>{" "}
          polls — every replica converges within ~1s. Requires the kernel to
          be running its{" "}
          <code className="rounded-sm bg-edge/40 px-1">
            startDistributedKillSwitch
          </code>{" "}
          poller against the same Redis key.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-sm border border-amber-700/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200">
      <Info size={12} className="mt-0.5 shrink-0 text-amber-300" />
      <p>
        <span className="font-semibold">{label}.</span> Status is volatile and
        local to this console process. Set{" "}
        <code className="rounded-sm bg-edge/40 px-1">REDIS_URL</code> +{" "}
        <code className="rounded-sm bg-edge/40 px-1">EMERGENCY_REDIS_KEY</code>{" "}
        on the server and{" "}
        <code className="rounded-sm bg-edge/40 px-1">
          NEXT_PUBLIC_ADJUDICATE_EMERGENCY_COORDINATION=redis
        </code>{" "}
        on the client to coordinate with the kernel runtime. Governance events
        ARE durable when{" "}
        <code className="rounded-sm bg-edge/40 px-1">DATABASE_URL</code> is
        set.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: EmergencyStatus }) {
  if (status === "NORMAL") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        NORMAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
      DENY_ALL
    </span>
  );
}
