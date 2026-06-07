# @adjudicate/pack-deployments-approval

Deployment-approval governance Pack — human approval gates (ESCALATE),
destructive-action confirmation (REQUEST_CONFIRMATION), ramp clamping (REWRITE),
CI-gate DEFER, and release gates (Item 14).

## Release gates

| Gate | Outcome | Trigger |
|---|---|---|
| Regression score | ESCALATE → human | `aiEvalScore` below `REGRESSION_ESCALATE_THRESHOLD` (80) |
| Carbon budget | REWRITE | `region` not the greenest in `REGION_CARBON_RANK` → clamped to `GREENEST_REGION` (taint preserved) |
| Model/prompt change | REQUEST_CONFIRMATION | bundled `modelId`/`promptVersion` differs from the last approved release |

Guard precedence (first non-null wins): a failed eval ESCALATEs before any
clamp; region carbon-clamp and model/prompt confirm precede the approval gates.
**Carbon ranking is a static constant** — never fetch live carbon data inside a
guard (that would be I/O in the decision path and break replay determinism).
In-memory state only; not for production as-is.
