"use client";

import { AuditExplorer } from "@/components/audit/AuditExplorer";

export const dynamic = "force-dynamic";

/**
 * 112 — the Audit Explorer route of the Adjudicant (Inspector-General) observer
 * plane. Renders the read-only browse / by-hash / integrity / chain-verify
 * surface. No operator control lives here: the page mounts only `.query`-backed
 * hooks over the admin SDK's READ-ONLY router.
 */
export default function AuditExplorerPage() {
  return <AuditExplorer />;
}
