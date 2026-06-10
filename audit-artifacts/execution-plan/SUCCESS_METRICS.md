# Success metrics

Every metric is **measurable and automatable** — a green/red test, a numeric threshold, or a crawl diff. No vague goals. Each maps to a WS-V spec or a tool run so the roadmap is self-certifying. "Definition of done" = all of a wave's metrics pass.

---

## Global gates (every wave must keep these green)
| Metric | Threshold | How measured |
|---|---|---|
| Build | passes | `pnpm --filter @adjudicate/web build` |
| Lint | 0 errors | `pnpm --filter @adjudicate/web lint` |
| Unit/e2e | 100% pass | `pnpm --filter @adjudicate/web test` + `e2e` |
| Honesty invariants | intact | grep guard: no `claustrum`/BBQ; real `IntentEnvelope` shape; illustrative/SIMULATED labels present; no command text; no DB/Redis creds |

---

## Wave 1 — Foundation (Accessibility 42 → 75+)

### Content visibility (RC-1)
- **All pages render with JS disabled.** `e2e/no-js.spec.ts`: for every route, primary below-fold content is present and not `opacity:0`/hidden-transform. **Threshold: 0 routes blank.**
- **Reduced-motion = full content.** With `prefers-reduced-motion: reduce`, every route shows the same content as motion-on (no hidden blocks). **Threshold: 0 hidden blocks.**
- **Re-crawl diff:** previously-blank below-fold captures (home, capabilities, recipe detail, console charts, roadmap, contribute) are now populated. **Threshold: 0 blank-below-fold captures** across 58 routes × 3 viewports.

### Accessibility semantics (RC-2)
- **Visible keyboard focus everywhere.** axe `focus`/`focus-order-semantics` = 0 violations; e2e tab-walk asserts a focus-ring computed style at every interactive stop. **Threshold: 0 elements without a visible focus indicator.**
- **Skip link works.** First Tab focuses the skip link; activating it moves focus to `<main>`. **Threshold: pass on all routes.**
- **Mobile menu is a real dialog.** Focus trapped while open, Escape closes, focus restores to trigger. axe `dialog` = 0 violations. **Threshold: pass.**
- **Landmarks present.** Each page has `<main>`, banner region, nav landmark. axe `landmark-*` = 0 violations.

### Contrast (RC-3)
- **WCAG AA on all text.** `e2e/contrast.spec.ts` over the token matrix: body text ≥ 4.5:1, large/UI ≥ 3:1, on light canvas *and* dark console. **Threshold: 0 failing pairings.**
- **Lighthouse a11y ≥ 90** on the 6 representative routes (home, capabilities index, a capability, a console replica, a recipe, blog). **Threshold: ≥ 90 each.**

### Wave-1 done when
11/11 Criticals closed · no-JS spec green · axe 0 critical/serious sitewide · contrast matrix AA · Lighthouse a11y ≥ 90 (×6) · re-crawl 0 blank captures.

---

## Wave 2 — Mobile & responsive (Mobile 43 → 72+)

- **No horizontal scrolling.** `e2e/mobile-overflow.spec.ts`: `document.scrollingElement.scrollWidth ≤ window.innerWidth` at 390px and 360px on every route. **Threshold: 0 routes overflow.**
- **No clipped content.** No table/diagram exceeds the viewport without a scroll affordance; AI-BOM detail pane present on mobile. **Threshold: 0 clipped surfaces** (visual crawl check on `/console/*`, `/architecture/data-flow`, `/introspection`, `/transparency/*`).
- **Touch targets ≥ 44×44px.** Audit all nav/links/CTAs via computed box size. **Threshold: 0 targets < 44px.**
- **No phantom whitespace.** Footer sits within one viewport height of the last content block; no inter-section gap exceeds the rhythm-scale max. **Threshold: trailing gap < 1 viewport** on all routes.
- **Install command intact.** Hero shows the full `pnpm add @adjudicate/core` at ≥390px. **Threshold: full string visible.**

### Wave-2 done when
mobile-overflow spec green · 0 clipped/dropped surfaces · all touch targets ≥ 44px · trailing-whitespace check pass · install chip full.

---

## Wave 3 — Messaging, navigation & conversion (Conversion 54 → 75+)

- **One outcome vocabulary.** grep guard: no `modify`/`wait`/`ask` as outcome labels; hero renders all **6/6** canonical names; `/how-it-works` matches. **Threshold: 0 non-canonical references.**
- **No inconsistent primitives.** Exactly one chip component, one outcome palette source, one maturity taxonomy, one type scale. **Threshold: grep finds 1 of each.**
- **No dead links.** `e2e/link-integrity.spec.ts`: every internal `href` + `#anchor` resolves. **Threshold: 0 dead links/anchors** (kills the six `#playground` CTAs).
- **Discoverability.** Blog, Roadmap, Contribute reachable from the **header** in ≤2 clicks. **Threshold: all 3 in header nav.**
- **Key actions above the fold.** Primary CTA + install present in the first viewport on `/`; one visually-dominant primary CTA. **Threshold: pass on home `__fold` capture.**
- **Trust signals coherent.** Version reads `v1 · core API frozen` everywhere; production banner consistent; signed-receipt/provenance proof present. **Threshold: 0 version contradictions.**

### Wave-3 done when
6/6 outcomes in hero · 0 non-canonical names · 1 chip/palette/taxonomy/type-scale · link-integrity green · 3 community pages in header · CTA/trust checks pass.

---

## Wave 4 — Polish & refinement

- **Bespoke system states.** Unknown route → branded 404 with working nav; Empty/Error/Loading components used where applicable. **Threshold: branded 404 renders; default Next states eliminated on audited paths.**
- **Editorial depth.** Blog has tags/categories + a valid `/blog/rss.xml`; OutcomesBento shows depth without a click; reduced-motion hero matches animated content. **Threshold: RSS validates; bento depth visible by default.**
- **All findings resolved.** Every one of the 60 findings is closed or explicitly deferred-with-reason in a tracking table. **Threshold: 60/60 accounted for; 0 open Critical/High.**
- **Final re-score.** Full re-crawl + re-run the 9-lens scoring (or Lighthouse + axe + manual heuristic pass) and record deltas. **Threshold: all axes ≥ 80.**

### Wave-4 done when
60/60 findings closed/deferred · branded states shipped · blog tags+RSS · final re-crawl clean · re-score recorded with all axes ≥ 80.

---

## The one-page dashboard (target end state)

| Metric | Tool | Baseline | Target |
|---|---|---:|---:|
| Pages rendering with JS off | `no-js.spec` | ~0% | **100%** |
| Lighthouse Accessibility (×6 routes) | Lighthouse CI | est. <60 | **> 90** |
| axe critical/serious violations | `a11y.spec` | many | **0** |
| Text pairings failing AA | `contrast.spec` | several | **0** |
| Routes with horizontal scroll @390 | `mobile-overflow.spec` | several | **0** |
| Clipped/dropped mobile surfaces | visual crawl | several | **0** |
| Touch targets < 44px | computed-box audit | several | **0** |
| Dead internal links/anchors | `link-integrity.spec` | 6+ (`#playground`) | **0** |
| Non-canonical outcome references | grep guard | ≥3 | **0** |
| Duplicate design primitives (chip/palette/taxonomy) | grep guard | 2× each | **1× each** |
| Blank below-fold captures (58×3) | re-crawl diff | dozens | **0** |
| Open Critical/High findings | tracking table | 27 | **0** |
| Score axes ≥ 80 | re-score | 0 of 6 | **6 of 6** |

Every row is a CI-checkable gate. When all rows hit target, the audit is *provably* closed — not asserted closed.
