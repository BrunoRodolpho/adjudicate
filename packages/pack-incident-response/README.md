# @adjudicate/pack-incident-response

Incident-remediation governance Pack. AI-driven incident response is high-risk —
exactly where the kernel's six outcomes shine.

| Outcome | Trigger |
|---|---|
| DEFER | target incident has a `down` dependency (parks on `incident.dependency.restored`) |
| REWRITE | auto (UNTRUSTED, LLM-proposed) remediation clamped to `AUTO_REMEDIATION_BLAST_CAP` (5) |
| ESCALATE | operator (TRUSTED) blast radius ≥ `ESCALATE_BLAST_RADIUS` (25) → supervisor |
| REQUEST_CONFIRMATION | operator blast radius ≥ `CONFIRM_BLAST_RADIUS` (10) |
| REFUSE | unknown / already-resolved incident, invalid blast radius |
| EXECUTE | in-bounds remediation, manual escalation, monitor callback |

`incident.monitor.callback` is **system-only** (requires TRUSTED) — the LLM can't
forge it. The blast-radius ladder (clamp < confirm < escalate) is gated so that
operator-initiated (TRUSTED) remediations bypass the auto-clamp and reach
confirm/escalate, while LLM-proposed (UNTRUSTED) over-scope is always clamped.
In-memory state only; not for production as-is.
