"use client";

import { InvestigationsExplorer } from "@/components/cases/InvestigationsExplorer";

export const dynamic = "force-dynamic";

/**
 * 113 — the Investigations / cases route of the Adjudicant (Inspector-General)
 * observer plane. Renders the read-only case-correlation surface: pivot from an
 * audit record by `intentHash` into its correlated case (session + supersession
 * lineage). No operator control lives here — the page mounts only `.query`-backed
 * hooks over the admin SDK's READ-ONLY router.
 */
export default function InvestigationsPage() {
  return <InvestigationsExplorer />;
}
