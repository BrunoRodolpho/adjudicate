"use client";

import { useState } from "react";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { ApprovalHistoryView } from "./ApprovalHistoryView";
import { ApprovalChainView } from "./ApprovalChainView";

/**
 * Approvals operator area (ADR-122 + ADR-136). Composes the three surfaces:
 *   - pending queue (ApprovalsPanel, with the honest display-only banner),
 *   - durable decision history (ApprovalHistoryView),
 *   - the audit chain for a selected resolved approval (ApprovalChainView).
 *
 * Selecting a history row lifts that decision's intentHash here so the chain
 * panel renders request → resolved → resumed for it.
 */
export function ApprovalsArea() {
  const [selectedHash, setSelectedHash] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4">
      <ApprovalsPanel />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ApprovalHistoryView
          selectedHash={selectedHash}
          onSelect={setSelectedHash}
        />
        <ApprovalChainView intentHash={selectedHash} />
      </div>
    </div>
  );
}
