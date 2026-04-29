"use client";

import { useMachine } from "@xstate/react";
import {
  AlertTriangle,
  Database,
  Loader2,
  Package,
  RefreshCw,
  X,
} from "lucide-react";
import { type MouseEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { PackMetadataRegistry } from "@/lib/packs/metadata";
import { replayMachine } from "@/lib/replay-machine";
import { ReplayDiffView } from "./ReplayDiffView";

interface Props {
  intentHash: string;
  /**
   * Optional intent kind from the originating record. When present,
   * the Pack badge renders immediately; when absent, it falls back to
   * the kind on the resolved replay result so the badge still appears
   * after success.
   */
  intentKind?: string;
  onClose: () => void;
}

/**
 * Replay verification modal.
 *
 * Native `<dialog>` element + XState v5 machine. Three escape paths:
 *   - X close button (top right)
 *   - Backdrop click (anywhere outside the modal box)
 *   - ESC key (native dialog cancel event)
 *
 * Header: shows the State Source chip (synthetic vs adopter) so
 * operators interpreting the diff can never confuse a demo replay with
 * a real one.
 *
 * Body: dispatches on machine state — Loader2 spinner during running,
 * AlertTriangle + RETRY button on error, ReplayDiffView on success.
 */
export function ReplayDialog({ intentHash, intentKind, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, send] = useMachine(replayMachine);

  // Open the dialog and trigger the replay on mount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    send({ type: "OPEN", intentHash });
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [intentHash, send]);

  const closeAll = () => {
    send({ type: "CLOSE" });
    onClose();
  };

  // ESC → cancel event → CLOSE
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      closeAll();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  // Backdrop click — `target === currentTarget` is true for clicks on
  // the dialog itself (backdrop or padding), false for inner content.
  const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      closeAll();
    }
  };

  const isMismatch =
    state.matches("success") &&
    state.context.result !== null &&
    state.context.result.classification !== null;

  // Resolve the active Pack via client-safe metadata. Prefer the
  // prop-supplied kind so the badge appears during loading; fall back
  // to the resolved record once the replay completes (covers callers
  // that didn't pass it).
  const resolvedKind =
    intentKind ?? state.context.result?.original.envelope.kind ?? null;
  const packMeta = resolvedKind
    ? PackMetadataRegistry.match(resolvedKind)
    : null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={cn(
        "m-auto rounded-sm border-2 bg-canvas p-0 text-ink backdrop:bg-black/70",
        isMismatch ? "border-red-500/60" : "border-edge",
      )}
    >
      <div className="flex w-[840px] max-w-[90vw] flex-col">
        <header className="flex items-center justify-between border-b border-edge px-4 py-2">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-muted" />
            <h2 className="text-sm font-semibold text-ink">Replay Decision</h2>
            {packMeta ? (
              <PackChip
                displayName={packMeta.displayName}
                version={packMeta.version}
              />
            ) : resolvedKind ? (
              <PackChip displayName="unknown Pack" version={null} />
            ) : null}
            {state.matches("success") && state.context.result ? (
              <StateSourceChip
                source={state.context.result.stateSource}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={closeAll}
            className="text-faint hover:text-ink"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-4 py-3">
          {state.matches("running") ? (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <Loader2 size={14} className="animate-spin" />
              Re-adjudicating <code className="text-ink">{intentHash.slice(0, 14)}…</code> against current policy.
            </div>
          ) : null}

          {state.matches("error") && state.context.error ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 rounded-sm border border-red-500/40 bg-red-500/5 px-2 py-1.5 text-[11px] text-red-200">
                <AlertTriangle
                  size={14}
                  className="mt-0.5 shrink-0 text-red-300"
                />
                <p>{state.context.error}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAll}
                  className="rounded-sm border border-edge bg-canvas px-3 py-1 text-[11px] uppercase tracking-wider text-muted hover:border-ink/30 hover:text-ink"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => send({ type: "RETRY" })}
                  className="rounded-sm border border-edge bg-edge/40 px-3 py-1 text-[11px] uppercase tracking-wider text-ink hover:bg-edge"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          {state.matches("success") && state.context.result ? (
            <ReplayDiffView result={state.context.result} />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function PackChip({
  displayName,
  version,
}: {
  displayName: string;
  version: string | null;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-300"
      title={version ? `Pack version ${version}` : undefined}
    >
      <Package size={10} />
      {displayName}
      {version ? <span className="text-sky-300/70">v{version}</span> : null}
    </span>
  );
}

function StateSourceChip({
  source,
}: {
  source: "synthetic" | "adopter";
}) {
  if (source === "adopter") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
        <Database size={10} /> State: adopter (live)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
      <Database size={10} /> State: synthetic (demo)
    </span>
  );
}
