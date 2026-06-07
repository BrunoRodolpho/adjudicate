"use client";

import { ApprovalsPanel } from "@/components/approvals/ApprovalsPanel";

/**
 * Approvals — operator surface for the REQUEST_CONFIRMATION → human review flow
 * (ADR-122). Lists pending confirmations and lets an operator approve/decline;
 * resolution routes through the approval engine to adapter-core `confirm()`.
 */
export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Approvals · Human Review
        </h1>
      </header>
      <ApprovalsPanel />
    </div>
  );
}
