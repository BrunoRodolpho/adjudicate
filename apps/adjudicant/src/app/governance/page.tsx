"use client";

import { GovernancePanel } from "@/components/governance/GovernancePanel";

export const dynamic = "force-dynamic";

/**
 * 115 — the Governance route of the Adjudicant (Inspector-General) observer
 * plane. Renders the read-only governance surfaces: policy-version history,
 * operational dashboards (guard-fire stats + outcome distribution), and the
 * kill-switch activation timeline. Every surface is a pure `.query` over the
 * admin SDK's READ-ONLY router — no operator control lives here, and the
 * kill-switch is READ-status only (the WRITE stays on the operator console).
 */
export default function GovernancePage() {
  return <GovernancePanel />;
}
