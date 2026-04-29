"use client";

import { AlertTriangle, X } from "lucide-react";
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { EmergencyStatus } from "@adjudicate/admin-sdk";
import { cn } from "@/lib/cn";

interface Props {
  targetStatus: EmergencyStatus;
  onClose: () => void;
  onConfirm: (input: {
    reason: string;
    confirmationPhrase: string;
  }) => void | Promise<void>;
  isPending: boolean;
}

/**
 * High-friction confirmation modal for emergency state transitions.
 *
 * Native <dialog> element — no Radix dep, modal focus trap and ESC-to-
 * close come free. Three guards before the operator can submit:
 *   1. Reason ≥ 10 chars (also enforced server-side by Zod)
 *   2. Confirmation phrase exactly equals targetStatus (case-sensitive)
 *      — also enforced server-side via the schema's .refine
 *   3. The mutation is not already pending
 *
 * Escape paths:
 *   - X close button (top right)
 *   - Cancel button
 *   - Backdrop click (anywhere outside the modal box)
 *   - ESC key (native dialog behavior)
 *
 * All escape paths are disabled while the mutation is pending — the
 * operator must wait for the server response, otherwise we risk a
 * confusing state where the dialog closes but the action took effect.
 */
export function EmergencyDialog({
  targetStatus,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");

  // Open the dialog imperatively when mounted.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Wire the native cancel event (ESC key) to our onClose, gated by
  // isPending so the operator can't bail out mid-submit.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (!isPending) onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [isPending, onClose]);

  const isDestructive = targetStatus === "DENY_ALL";
  const trimmedReason = reason.trim();
  const reasonValid =
    trimmedReason.length >= 10 && trimmedReason.length <= 500;
  const confirmationValid = confirmationPhrase === targetStatus;
  const canSubmit = reasonValid && confirmationValid && !isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void onConfirm({ reason: trimmedReason, confirmationPhrase });
  };

  // Native <dialog>: clicks on the backdrop and on the dialog's own
  // padding both target the dialog element itself. Inner content clicks
  // target inner elements. So `e.target === e.currentTarget` is the
  // canonical "clicked outside the modal content" check — operators
  // who misclicked can bail by clicking anywhere outside the modal.
  const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && !isPending) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={cn(
        "m-auto rounded-sm border-2 bg-canvas p-0 text-ink backdrop:bg-black/70",
        isDestructive ? "border-red-500/60" : "border-emerald-500/60",
      )}
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-[480px] flex-col gap-3 p-4"
      >
        <header className="flex items-center justify-between">
          <div
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              isDestructive ? "text-red-300" : "text-emerald-300",
            )}
          >
            <AlertTriangle size={16} />
            {isDestructive ? "Engage DENY_ALL" : "Restore NORMAL"}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-faint hover:text-ink disabled:opacity-50"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <p
          className={cn(
            "rounded-sm border px-2 py-1.5 text-[11px] leading-relaxed",
            isDestructive
              ? "border-red-500/40 bg-red-500/5 text-red-200"
              : "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
          )}
        >
          {isDestructive
            ? "Engaging DENY_ALL halts every kernel decision across all replicas. Every intent — including read-likes and DEFER resumes — will be REFUSEd with kill_switch_active. Use only during incidents that require immediate global stop."
            : "Restoring NORMAL re-enables kernel adjudication. Verify the underlying incident is resolved and that resuming policy-driven decisions is the right action."}
        </p>

        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-faint uppercase tracking-section">
            Reason (audited)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            required
            minLength={10}
            maxLength={500}
            rows={3}
            placeholder="Min 10 chars. Surfaced in governance event log."
            className="rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none disabled:opacity-50"
          />
          <span
            className={cn(
              "text-[10px]",
              reasonValid ? "text-faint" : "text-amber-400",
            )}
          >
            {trimmedReason.length}/500 — minimum 10
          </span>
        </label>

        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-faint uppercase tracking-section">
            Type{" "}
            <code className="rounded-sm bg-edge px-1 text-ink">
              {targetStatus}
            </code>{" "}
            to confirm
          </span>
          <input
            type="text"
            value={confirmationPhrase}
            onChange={(e) => setConfirmationPhrase(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
            placeholder={targetStatus}
            className="rounded-sm border border-edge bg-canvas px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none disabled:opacity-50"
          />
        </label>

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-sm border border-edge bg-canvas px-4 py-1.5 text-[11px] uppercase tracking-wider text-ink hover:border-ink/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors",
              isDestructive
                ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
              "disabled:cursor-not-allowed disabled:opacity-30",
            )}
          >
            {isPending ? "Working…" : `Confirm ${targetStatus}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
