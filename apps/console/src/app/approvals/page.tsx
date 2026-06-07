"use client";

import { ApprovalsArea } from "@/components/approvals/ApprovalsArea";

/**
 * Approvals — operator surface for the REQUEST_CONFIRMATION → human review flow
 * (ADR-122 + ADR-136). Pending queue + durable decision history + the audit
 * chain (request → resolved → resumed) for a selected resolved approval.
 *
 * In the reference console, resolving is DISPLAY-ONLY: it records the operator
 * decision into the persisted registry projection. The single-use token take,
 * parked-blob hash verify, kernel re-adjudication, and intent RESUME happen in
 * the adopter's adapter process (createApprovalEngine.resolve → agent.confirm).
 * The panel banner makes this explicit.
 */
export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Approvals · Human Review
        </h1>
      </header>
      <ApprovalsArea />
    </div>
  );
}
