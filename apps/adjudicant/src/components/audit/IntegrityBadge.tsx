"use client";

import { CheckCircle2, HelpCircle, ShieldAlert } from "lucide-react";
import type { AuditRecordVerification } from "@adjudicate/core";
import { cn } from "@/lib/cn";

export interface IntegrityBadgeProps {
  /**
   * The per-record verdict from `verifyAuditRecord` (surfaced by the SDK's
   * integrity-on-read read DTOs). `undefined` means the store did not verify on
   * read — rendered DENY-BY-DEFAULT as "unverified" rather than implying intact.
   */
  verification: AuditRecordVerification | undefined;
  className?: string;
}

/**
 * 112 — renders an audit record's integrity verdict as a DENY-BY-DEFAULT badge.
 *
 * The §C monotonicity law applies to the read plane too: a read only ever ADDS
 * friction, never removes it. So this badge is conservative —
 *   - ONLY `{verified:true}` renders the green "verified" affordance;
 *   - any `{verified:false}` (tampered / forged envelope / invalid signature)
 *     renders a loud red TAMPER badge so a forged `REFUSE→EXECUTE` row is never
 *     mistaken for authoritative;
 *   - `{verified:null, missing_hash}` (pre-v4) and an ABSENT verdict render an
 *     amber "unverified" badge — we never paint an unchecked record as intact.
 *
 * Pure presentational; it makes NO decision and changes NO record. It only
 * surfaces the verdict the pure kernel-side verifier already produced.
 */
export function IntegrityBadge({ verification, className }: IntegrityBadgeProps) {
  const tone = badgeTone(verification);

  return (
    <span
      data-testid="integrity-badge"
      data-verdict={tone.verdict}
      role="status"
      aria-label={tone.aria}
      title={tone.title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-section",
        tone.className,
        className,
      )}
    >
      <tone.Icon aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />
      {tone.label}
    </span>
  );
}

function badgeTone(verification: AuditRecordVerification | undefined): {
  verdict: "verified" | "tampered" | "unverified";
  label: string;
  aria: string;
  title: string;
  className: string;
  Icon: typeof CheckCircle2;
} {
  if (verification === undefined) {
    return {
      verdict: "unverified",
      label: "unverified",
      aria: "Integrity not verified on read",
      title: "The store did not verify this record on read.",
      className: "border-amber-400/40 text-amber-300",
      Icon: HelpCircle,
    };
  }
  if (verification.verified === true) {
    return {
      verdict: "verified",
      label: "verified",
      aria: "Integrity verified — record intact",
      title: "auditHash + envelope intentHash re-derive; record intact.",
      className: "border-emerald-400/40 text-emerald-300",
      Icon: CheckCircle2,
    };
  }
  if (verification.verified === null) {
    return {
      verdict: "unverified",
      label: "pre-v4",
      aria: "Pre-v4 record — no auditHash to verify",
      title: "Legacy record with no auditHash; integrity not applicable.",
      className: "border-amber-400/40 text-amber-300",
      Icon: HelpCircle,
    };
  }
  // verified === false — TAMPER, deny-by-default loud badge.
  return {
    verdict: "tampered",
    label: verification.reason.replace(/_/g, " "),
    aria: `Integrity FAILED: ${verification.reason}`,
    title:
      verification.reason === "invalid_signature"
        ? `Signature not authentic (keyId ${verification.keyId}, alg ${verification.alg}).`
        : `Record content does not re-derive (${verification.reason}). Investigate immediately.`,
    className: "border-red-400/60 bg-red-500/10 text-red-300 font-medium",
    Icon: ShieldAlert,
  };
}
