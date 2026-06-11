# @adjudicate/pack-deployments-approval

Deployment-approval governance Pack — human approval gates (ESCALATE),
destructive-action confirmation (REQUEST_CONFIRMATION), ramp clamping (REWRITE),
CI-gate DEFER, and release gates (Item 14).

## Release gates

| Gate | Outcome | Trigger |
|---|---|---|
| Regression score | ESCALATE → human | `aiEvalScore` below `REGRESSION_ESCALATE_THRESHOLD` (80) |
| Carbon budget | REWRITE | `region` not the greenest *in its own data-residency zone* → clamped via `greenestRegionInZone` (taint preserved, zone never crossed) |
| Model/prompt change | REQUEST_CONFIRMATION | bundled `modelId`/`promptVersion` differs from the last approved release |

Guard precedence (first non-null wins): a failed eval ESCALATEs before any
clamp; region carbon-clamp and model/prompt confirm precede the approval gates.
**Carbon ranking is a static constant** — never fetch live carbon data inside a
guard (that would be I/O in the decision path and break replay determinism).
In-memory state only; not for production as-is.

## Known limitations — read before adopting

These are deliberate gaps in the reference gates; an adopter MUST address them:

- **The regression gate is opt-in per request (fail-open if the score is
  omitted).** `aiEvalScore` is optional; a `deployment.approval.request` that
  does not carry it bypasses `escalateRegressionScore` entirely (the threshold
  guard returns null on an absent value). If eval is mandatory for your release
  process, add a state guard that REFUSEs/ESCALATEs when the score is missing.
- **The carbon clamp is residency-bounded — but you must classify your regions.**
  `clampToGreenestRegion` clamps to the greenest region *within the request
  region's data-residency zone* (`REGION_RESIDENCY`), so an `eu-*` deploy is only
  ever moved to a greener `eu-*` region, never to `us-west-1`. A region absent
  from `REGION_RESIDENCY` is left untouched (fail-safe). Adopters MUST populate
  `REGION_RESIDENCY` for every region they deploy to, or those regions are never
  carbon-optimized (and never wrongly relocated).
- **The model/prompt-change gate fires on the first deploy.** With no prior
  approved release, any request that supplies a `modelId`/`promptVersion`
  REQUEST_CONFIRMATIONs (there is nothing to diff against). Treat the first
  confirmation as the baseline-establishing approval.
