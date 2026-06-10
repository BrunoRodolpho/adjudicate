# Execution roadmap

Four waves, sequenced for **maximum score gain per unit of effort**. Wave 1 alone clears all 11 Criticals and lifts the two weakest axes. Each wave is build/lint/test-gated and ends with a WS-V validation run + re-crawl before the next begins.

**Baseline (audit):** UX 60 · Design 68 · **Accessibility 42** · **Mobile 43** · Conversion 54 · Product maturity 66.

---

## Wave 1 — Foundation: robustness + accessibility
**Target: Accessibility 42 → 75+** (and de-risk every page) · **Workstreams: WS-1, WS-2, WS-3, WS-V** · **Themes A + B**

### Why first
RC-1 is the single change that clears 8 of 11 Criticals *and* makes every later re-audit trustworthy (no more blank screenshots). RC-2 + RC-3 move the weakest axis the furthest with ~6 primitive/token edits. This wave is the highest ROI on the board.

### Contents (must include)
- **Content visibility** — WS-1 (RC-1): rewrite motion → visible-by-default. *[blocker, do day 1]*
- **Focus states** — WS-2 T2.2: `focusRing` on all primitives.
- **Skip links + landmarks** — WS-2 T2.4: mount SkipLink + `<main>`.
- **Dialog semantics** — WS-2 T2.3: real `Dialog` for the mobile sheet.
- **Contrast** — WS-3: AA-safe text token tier.
- **Validation** — WS-V: no-JS, axe, contrast specs + re-crawl.

### Sequencing inside the wave
`WS-1 (T1.1→T1.5)` first → then **parallel** `WS-2` ∥ `WS-3` (disjoint files) → `WS-V` specs land alongside and run as the gate.

### Estimate
- **Effort:** M (≈ the audit's "1–2 days" foundation) — WS-1 M, WS-2 S–M, WS-3 S.
- **Impact:** **Highest.** Clears 11/11 Criticals; Accessibility +30+, plus large UX/Mobile/Conversion lift from content rendering.
- **Confidence:** **High** — these are well-understood, mostly mechanical, single-architectural-change fixes (several are bugs we introduced and understand precisely).

### Exit criteria
All 11 Criticals closed · no-JS spec green · axe 0 critical/serious · contrast matrix AA · Lighthouse a11y > 90 on the 6 representative routes · re-crawl shows zero blank below-fold.

---

## Wave 2 — Mobile & responsive
**Target: Mobile 43 → 72+** · **Workstreams: WS-5, WS-7 (bug + rhythm), WS-V** · **Theme D**

### Why second
Now that content renders (Wave 1), mobile failures are *measurable and real* (not blank-page artifacts). Dense-surface clipping is the next-largest concentration of High findings.

### Contents (must include)
- **Responsive tables** — WS-5 T5.2/T5.3: `ResponsiveTable` + AI-BOM detail pane.
- **Overflow** — WS-5 T5.4: diagram reflow; no horizontal page scroll @390/360.
- **Touch targets** — WS-2 carryover + WS-7: ≥44px nav/links/CTAs (#47).
- **Layout bugs + rhythm** — WS-7 T7.1 (install chip, CTA hierarchy) + T7.2 (Section rhythm, trailing-whitespace cleanup *after* RC-1 remeasure).

### Estimate
- **Effort:** M–L (WS-5 M–L is the bulk; WS-7 S–M).
- **Impact:** High on Mobile (+29 target), plus Conversion +6 (install/CTA) and UX +4.
- **Confidence:** **Medium–High** — `ResponsiveTable` is a clean primitive; per-diagram reflow carries the only real uncertainty.

### Exit criteria
mobile-overflow spec green (no horizontal scroll any route @390/360) · no clipped columns/dropped panes · all touch targets ≥44px · install chip shows full command · footer within one viewport of last content.

---

## Wave 3 — Messaging consistency, navigation & conversion
**Target: Conversion 54 → 75+** · **Workstreams: WS-4, WS-6, WS-7 (conversion bits), WS-V** · **Themes C + E**

### Why third
With the page robust and mobile-clean, the remaining conversion drag is *credibility wobble* (contradictory outcome counts/vocabulary) and *discoverability* (orphan pages, dead anchors). These are low-risk centralizations.

### Contents (must include)
- **Messaging consistency** — WS-4: canonical `outcomes.ts`, one chip, one maturity taxonomy, hero names 6/6, how-it-works canonical names, kill duplicate paragraph.
- **Navigation discoverability** — WS-6: single nav source, Blog/Roadmap/Contribute in header, kill dead `#playground` anchors, link-integrity test.
- **CTA optimization** — WS-7 T7.1 (already in Wave 2 if not done): one clear primary CTA, aligned "5-min demo" copy.
- **Trust signals** — surface real proof (signed receipts, ADR/source provenance, npm-published v1) consistently; ensure the production banner + version are coherent.

### Estimate
- **Effort:** M (WS-4 M, WS-6 S–M).
- **Impact:** Conversion +13 (consistency + discoverability + CTA), Design +6, UX +9.
- **Confidence:** **High** — mostly data/copy centralization with build-time guards; very low regression risk.

### Exit criteria
hero lists 6/6 outcomes · no non-canonical outcome name anywhere · one chip + one palette + one maturity vocabulary (grep-guarded) · link-integrity spec green (0 dead links/anchors) · Blog/Roadmap/Contribute in header.

---

## Wave 4 — Polish & refinement
**Target: lift UX/Design/Product-maturity to 80+; close all remaining Medium/Low** · **Workstreams: WS-8, WS-7 tail, WS-V** · **Theme F**

### Why last
These depend on everything above being measured; their scope *shrank* once RC-1 removed phantom whitespace and RC-4 removed copy churn. Pure additive quality.

### Contents
- **System states** — WS-8 T8.1: branded 404 + Empty/Error/Loading.
- **Editorial depth** — WS-8 T8.2: blog tags/RSS, transparency depth, OutcomesBento inline depth, reduced-motion hero parity.
- **Remaining rhythm/polish** — WS-7 tail: console-hub video size, workflow-family balance, homepage threading.
- **Final sweep** — close every remaining Medium/Low; full re-crawl + re-score.

### Estimate
- **Effort:** M.
- **Impact:** UX +4, Conversion +3, Product maturity +4; clears the Medium/Low tail.
- **Confidence:** **High** — additive, low-risk.

### Exit criteria
all 60 findings resolved or explicitly deferred-with-reason · branded 404/empty/error states · blog tags + RSS · full re-crawl clean · final re-score recorded.

---

## Projected scorecard by wave

| Axis | Baseline | After W1 | After W2 | After W3 | After W4 (target) |
|---|---:|---:|---:|---:|---:|
| **Accessibility** | 42 | **78** | 80 | 82 | **85+** |
| **Mobile** | 43 | 55 | **74** | 76 | **80+** |
| **Conversion** | 54 | 69 | 72 | **78** | **80+** |
| **UX** | 60 | 75 | 79 | 84 | **88+** |
| **Design** | 68 | 70 | 72 | 78 | **82+** |
| **Product maturity** | 66 | 74 | 78 | 82 | **86+** |

> Accessibility jumps in **Wave 1** (RC-1 visibility + RC-2 semantics + RC-3 contrast all land there). Mobile jumps in **Wave 2**, Conversion in **Wave 3**. Wave 4 lifts every axis past 80.

---

## Parallelization & ownership

- **Wave 1:** 1 agent on WS-1 (critical path, day 1), then 2 agents in parallel (WS-2, WS-3) once WS-1 lands; 1 agent threads WS-V specs throughout. Use **worktree isolation** for the parallel pair.
- **Waves 2–3:** WS-5, WS-6, WS-4 touch disjoint file sets → up to 3 parallel agents (worktree-isolated); WS-7 bug-fixes fold into whichever wave touches the hero.
- **Wave 4:** single agent (additive, low-conflict) + final WS-V re-crawl.

**Critical-path length:** WS-1 (Wave 1) is the only hard serialization point; after it, the program is largely parallel. The whole roadmap is well within the audit's implied "~1 week" envelope if waves 2–3 fan out.

---

## Suggested orchestration (if running agents)

Each wave maps cleanly to a `Workflow` run: a `pipeline()` over the wave's tasks (audit → implement → test stages), with `parallel()` only where the dependency graph allows (WS-2 ∥ WS-3; WS-4 ∥ WS-5 ∥ WS-6). Gate each wave on the WS-V specs before starting the next. This is a *planning* artifact — execution is a separate, explicitly-requested step.
