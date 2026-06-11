# Stage 1 — Read-like Mutations (Risk: Low)

> **Note:** This runbook uses IbateXas commerce intent kinds as examples.
> Substitute your domain's intent kinds and deployment CLI. The 4-stage
> shadow → enforce pattern applies to any adjudicate adopter.

> **TL;DR** — first kernel-authoritative stage. Idempotent / reversible mutations that don't commit money or block flows. 7-day zero-divergence window before flipping ENFORCE.

## Divergence taxonomy and where the names come from

adjudicate core classifies every shadow comparison into one of four classes,
defined in `packages/core/src/kernel/shadow.ts` (`DivergenceClass`):

| Class | Meaning | Core sink method (`ShadowTelemetrySink`) | Policy |
|---|---|---|---|
| `NONE` | Same kind, same basis | (no emission) | — |
| `BASIS_ONLY` | Same outcome, different basis | `recordBasisOnly` | metric only |
| `DECISION_KIND` | Kernel would change the outcome | `alertDecisionKind` | page on-call |
| `PAYLOAD_REWRITE` | Kernel returned REWRITE | `alertPayloadRewrite` | page on-call |

Core does **not** mint analytics/observability event names. The sink is a port
(`setShadowTelemetrySink`, routed through `MetricsSink.recordShadowDivergence`
in `metrics.ts`); the adopter's wiring decides what events fire. The
`audit_kernel_shadow_diverged_*` and `kernel_authoritative_decision` names below
are **adopter-defined** (this runbook's example adopter), keyed off the class —
substitute your own:

| Core class | Example adopter PostHog/Sentry event |
|---|---|
| `BASIS_ONLY` | `audit_kernel_shadow_diverged_basis` |
| `DECISION_KIND` | `audit_kernel_shadow_diverged_kind` |
| `PAYLOAD_REWRITE` | `audit_kernel_shadow_diverged_rewrite` |
| (enforced authoritative decision) | `kernel_authoritative_decision` |

## Scope

Intent kinds covered in this stage:

| Intent kind | Tool name | Why "read-like" |
|---|---|---|
| `preference.update` | `update_preferences` | Toggle on a customer record; reversible, idempotent |
| `coupon.apply` | `apply_coupon` | Reversible: removes cleanly if customer changes mind |
| `review.submit` | `submit_review` | Free text + rating; no financial impact |
| `followup.schedule` | `schedule_follow_up` | Reminder scheduling; no order state change |
| `order.note.add` | `add_order_note` | Note appended to existing order; no financial impact |

`order.tool.propose` envelopes whose underlying `toolName` is in this list count as Stage 1 traffic.

`IBX_KERNEL_SHADOW` / `IBX_KERNEL_ENFORCE` are per-intent-class config (comma list, or `*` for all), read by `enforceConfigFor` in `packages/core/src/kernel/enforce-config.ts`. `adjudicate()` itself never reads them.

## Pre-flight checklist

- [ ] B0 baseline complete: `IBX_KERNEL_SHADOW=*` ran in staging ≥48h with divergence telemetry verified flowing to your observability backend
- [ ] No open alerts for the `DECISION_KIND` / `PAYLOAD_REWRITE` divergence events
- [ ] On-call briefed; this runbook open in shared tab
- [ ] Rollback procedure rehearsed against staging (≤2 min from flip to revert)
- [ ] `pnpm test --filter @adjudicate/core/kernel --filter @adjudicate/runtime` clean on the deployed SHA

## Shadow flip (if not already covered by `IBX_KERNEL_SHADOW=*`)

If running narrow shadow rather than wildcard:

```bash
IBX_KERNEL_SHADOW=preference.update,coupon.apply,review.submit,followup.schedule,order.note.add
ibx svc restart api
```

**Smoke test (5 min):** trigger one example of each intent kind via WhatsApp test number; confirm one `BASIS_ONLY` divergence (or no event) per intent — never `DECISION_KIND` or `PAYLOAD_REWRITE` on a clean smoke.

## Observation window — 7 days

Watch the divergence events your adopter sink emits, filtered to Stage 1 intents:

| Class | Expected | Action threshold |
|---|---|---|
| `BASIS_ONLY` | Non-zero is OK (vocab differences) | Flag for review only if rate >5%/intent |
| `DECISION_KIND` | **Zero** | Any occurrence pages on-call; fix policy bug before flip |
| `PAYLOAD_REWRITE` | **Zero** | Any occurrence pages on-call; manual review per event |

Recommended alerts (configure in your sink):
- `DECISION_KIND` rate >0.1% per intent class for >5 min → page
- `PAYLOAD_REWRITE` any occurrence → page

### Expected divergence patterns for this stage

- **`apply_coupon` BASIS_ONLY drift:** legacy returns generic basis; kernel returns vocabulary-controlled `coupon.eligible` / `coupon.exhausted`. **OK** — vocab upgrade artifact.
- **`update_preferences` BASIS_ONLY:** legacy elides basis when no-op; kernel always emits `preference.unchanged`. **OK.**
- **`submit_review` PAYLOAD_REWRITE:** kernel may strip URLs from review text via the validation-layer REWRITE path. **Investigate** — should be rare; if pattern, tighten the LLM prompt rather than relying on REWRITE.

## Go/no-go for ENFORCE

All must hold for ≥7 consecutive days:
- Zero `DECISION_KIND` events
- Zero `PAYLOAD_REWRITE` events
- All `BASIS_ONLY` patterns explained and signed off in the Stage 1 review doc

If any criterion fails: stay in shadow, fix the policy bug or vocab gap, reset the 7-day clock.

## Enforce flip

```bash
IBX_KERNEL_ENFORCE=preference.update,coupon.apply,review.submit,followup.schedule,order.note.add
# IBX_KERNEL_SHADOW remains as-is (covers later-stage intents)
ibx svc restart api
```

**24h watchlist:**
- Zero new errors from the enforced (authoritative) decision path
- Tool-call success rate per intent kind unchanged (±2%) vs prior week
- Customer-support inbox: no spike in "preferences not saving" / "coupon not applying" tickets

**7d watchlist:**
- Tool-call success rate stable
- Refusal rate by `refusalCode` matches baseline (no surprise denials)

**30d watchlist:**
- File post-stage report (template below) and proceed to Stage 2 pre-flight

## Rollback

```bash
# 1. revert ENFORCE list — drop Stage 1 intents
IBX_KERNEL_ENFORCE=  # or whatever subset was previously stable
# 2. restart
ibx svc restart api
# 3. verify
ibx infra status
```

Verify in your observability backend: the enforced-decision event (`kernel_authoritative_decision` in the example adopter) drops for Stage 1 intent kinds within ~2 min of restart.

If a customer was mid-flow during rollback, their session may see one anomalous decision; the legacy path is idempotent so retry resolves cleanly.

## Escalation

| Severity | Trigger | Page | Channel |
|---|---|---|---|
| S3 | `BASIS_ONLY` rate >5%/intent | No | Slack `#ibx-rollout` |
| S2 | Single `DECISION_KIND` event in shadow | Yes | PagerDuty (intent-kernel) |
| S2 | Single `PAYLOAD_REWRITE` event | Yes | PagerDuty (intent-kernel) |
| S1 | `DECISION_KIND` rate >0.1% intent for >5 min in shadow | Yes | PagerDuty + WhatsApp owner |
| S1 | Tool-call success rate drops >5% post-enforce | Yes | PagerDuty + WhatsApp owner; trigger rollback |

## Post-stage report template

File at `docs/ops/runbooks/reports/stage-01-<YYYY-MM-DD>.md`:

- Total `BASIS_ONLY` events: <count>; top 3 patterns
- Total `DECISION_KIND` events during shadow: <count> (must be 0 to flip)
- Total `PAYLOAD_REWRITE` events during shadow: <count> (must be 0 to flip)
- Date shadow started / date enforce flipped
- Surprises: <free form>
- Open questions for Stage 2: <free form>
- Sign-offs: on-call lead, intent-kernel maintainer
