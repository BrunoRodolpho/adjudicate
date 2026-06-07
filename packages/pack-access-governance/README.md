# @adjudicate/pack-access-governance

Agent access-request governance Pack: request → review → grant/revoke,
exercising all six Decision outcomes.

| Outcome | Trigger |
|---|---|
| DEFER | request with no resolved review (parks on `access.review.resolved`) |
| REWRITE | over-provisioned request clamped to least privilege (`privilegeLevel`) |
| ESCALATE | sensitive-resource request without approval → human |
| REQUEST_CONFIRMATION | revoke without a confirmation token |
| REFUSE | unknown resource / rejected review / no active grant |
| EXECUTE | approved request, review resolution, confirmed revoke |

`access.review.resolve` is **system/operator-only** (TRUSTED) — an LLM cannot
self-approve. Privilege is modeled numerically (0=read, 1=write, 2=admin) so the
least-privilege REWRITE reuses the numeric `createRewriteGuard`. In-memory state
only; not for production as-is.
