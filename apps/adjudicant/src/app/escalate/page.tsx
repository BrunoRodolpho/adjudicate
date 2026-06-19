"use client";

import { EscalatePanel } from "@/components/escalate/EscalatePanel";

export const dynamic = "force-dynamic";

/**
 * 114 — the Escalate / recommend route of the Adjudicant (Inspector-General)
 * observer plane. Renders the SOLE write surface the observer plane permits: a
 * friction-monotone escalation/recommendation (pause/review/escalate) against an
 * audited decision. It never authorizes, weakens, or overrides a decision — the
 * recorded output is a fact, not a `Decision`.
 */
export default function EscalatePage() {
  return <EscalatePanel />;
}
