# Workstreams

Nine workstreams (WS-1…WS-8 + WS-V). Each is independently ownable. Score impact is a delta against the audit baseline (UX 60 · Design 68 · Accessibility 42 · Mobile 43 · Conversion 54). All paths are under `apps/web/`.

---

## WS-1 — Progressive-enhancement motion architecture
**Root cause:** RC-1 · **Theme:** A · **Wave:** 1 (first) · **Risk:** Medium · **Effort:** M

### Objective
Content is **visible by default** in SSR / no-JS / print / reduced-motion. Motion becomes a transform-only enhancement layered on a visible baseline. No surface ever depends on a scroll event to *exist*.

### Scope
- `src/components/home/Reveal.tsx`, `src/lib/motion.ts` (`revealVariants`)
- `src/components/motion/{Stagger,CountUp,DrawOnScroll,HoverLift}.tsx`
- All ~7 consumer surfaces: `app/page.tsx` + `sections/home/*`, `app/capabilities/page.tsx`, `app/recipes/[slug]/page.tsx`, `components/console-kit/*` charts, `app/roadmap/page.tsx`, `app/contribute/page.tsx`, `components/comparisons/WedgeTable.tsx`

### Findings addressed
#3, #4, #5, #6, #7, #8, #9, #10, #11, #42 (+ #26, #58 phantom whitespace)

### Risk
**Medium** — touches the most-used wrapper; risk is a motion *regression* (jank/no animation), not a content regression. Mitigated by the no-JS render test (WS-V) which becomes the permanent guard.

### Expected score impact
- Accessibility **+8** (content reliably in a11y tree; no opacity-hidden focus targets)
- Mobile **+12** (pages render below the fold)
- UX **+15** · Conversion **+15**

### Validation
- Disable JS in Playwright → every route's primary content is visible (no `opacity:0` computed on revealed blocks).
- `prefers-reduced-motion: reduce` → fully visible, no transform offset.
- Re-run the crawl → zero blank below-fold captures.

---

## WS-2 — Accessibility primitives (focus · dialog · landmarks · skip)
**Root cause:** RC-2 · **Theme:** B · **Wave:** 1 · **Risk:** Low · **Effort:** S–M

### Objective
Every interactive element shows a visible focus ring; the mobile menu is a real focus-trapped dialog; the page has a skip-link and `<main>` landmark. Keyboard-only users can reach and operate everything.

### Scope
- `src/components/ui/{Button,Card,NavBar}.tsx`, the mobile sheet, `components/console-kit/ErrorState`
- New `src/components/ui/Dialog.tsx` (focus trap + Escape + restore) — or adopt a headless primitive
- `src/app/layout.tsx` (mount existing `SkipLink`, add `<main id="main" tabIndex={-1}>`), `AnnouncementBanner` (landmark)
- A shared `focusRing` class in `lib/` / Tailwind layer

### Findings addressed
#1, #12, #13, #22, #33, #51, #55 (+ keyboard half of #47)

### Risk
**Low** — additive; no content/layout change. Dialog swap is the only structural change.

### Expected score impact
- Accessibility **+18** · Mobile **+3** (sheet) · UX **+3** · Conversion **+2**

### Validation
- Keyboard tab through every page → visible ring on each stop; Skip link is first focusable and jumps to `<main>`.
- Open mobile menu → focus trapped, Escape closes, focus restores to trigger.
- axe-core: 0 violations for `focus`, `dialog`, `landmark`, `skip-link` rules.

---

## WS-3 — Contrast-safe token system
**Root cause:** RC-3 · **Theme:** B · **Wave:** 1 · **Risk:** Low · **Effort:** S

### Objective
Every text/background pairing meets WCAG AA (4.5:1 body, 3:1 large/UI). Decision-color *text* uses AA-safe `*-strong` variants on both light canvas and dark console.

### Scope
- `tailwind.config.*` / token source (`muted`, `faint`, `console.*`, decision colors)
- `src/content/decisions.ts` (text vs fill color split)
- Consumers using `faint`/decision colors for text; `components/blog/*` (#56 indigo-600); integrity badges (#31)

### Findings addressed
#2, #28, #29, #31, #36, #41, #56

### Risk
**Low** — color-value changes; verify visual harmony stays intact (round-2 craft must not regress).

### Expected score impact
- Accessibility **+12** · UX **+3** · Design **+2**

### Validation
- Automated contrast test (WS-V) over the token matrix → all text pairings ≥ AA.
- Lighthouse a11y "contrast" audit = pass on home, console replica, blog, capability.

---

## WS-4 — Canonical outcomes, taxonomy & chip unification
**Root cause:** RC-4 · **Theme:** C · **Wave:** 3 · **Risk:** Low · **Effort:** M

### Objective
One source of truth for the six outcomes (name, order, gloss, color, icon) and one maturity taxonomy. Every copy string and chip derives from it; drift is impossible.

### Scope
- New/normalized `src/content/outcomes.ts` (canonical six)
- Merge `DecisionChip` + motion `DecisionBadge` → one chip; delete the duplicate
- `sections/Hero.tsx` (name all six — #23), `/how-it-works` (canonical names — #24)
- Pick one maturity vocabulary (Tier 1/2 **or** Live/Illustrative) across capabilities + recipes (#17, #34)
- Collapse the ad-hoc type scale into the named tokens (#39)
- Kill verbatim duplication on capability pages (#16)

### Findings addressed
#16, #17, #21, #23, #24, #34, #39, #40 (+ #43 copy)

### Risk
**Low** — mostly data/copy centralization; build-time guard prevents future drift.

### Expected score impact
- Conversion **+8** · UX **+5** · Design **+6**

### Validation
- Build/lint rule: outcome references resolve to canonical names (no `modify/wait/ask`).
- Grep test: one chip component, one palette import, one maturity vocabulary.
- Hero renders all six outcome names; `/how-it-works` matches.

---

## WS-5 — Responsive data-surface primitives
**Root cause:** RC-5 · **Theme:** D · **Wave:** 2 · **Risk:** Medium · **Effort:** M–L

### Objective
Every dense surface (tables, diagrams) has a defined mobile behavior: horizontal scroll with affordance, or reflow — no clipping, no dropped panes, no horizontal page scroll.

### Scope
- New `src/components/ui/ResponsiveTable.tsx` (overflow-x scroll, edge fades, "scroll for more" hint)
- `components/console-kit/*` tables (audit-explorer #18, #25), AI-BOM detail pane (#19 → tabs/accordion)
- `components/architecture/DataFlowDiagram.tsx` + introspection force-graph mobile reflow (#15)
- `WedgeTable`, transparency tables (#30)

### Findings addressed
#15, #18, #19, #25, #30, #36 (density), #52

### Risk
**Medium** — reflow logic per surface type; validate on real device widths (390/360px).

### Expected score impact
- Mobile **+15** · UX **+4**

### Validation
- At 390px and 360px: no element exceeds viewport width; `document.scrollingElement.scrollWidth <= innerWidth` on every route (WS-V mobile-overflow test).
- AI-BOM mobile shows the detail pane (via tab/accordion); audit table scrolls horizontally with a visible affordance.

---

## WS-6 — Navigation single-source + link integrity
**Root cause:** RC-6 · **Theme:** E · **Wave:** 3 · **Risk:** Low · **Effort:** S–M

### Objective
All navigation derives from one typed source; Blog/Roadmap/Contribute are reachable from the header; no dead internal links or anchors ship — ever (enforced by test).

### Scope
- `src/content/nav.ts` (single source → header + footer + breadcrumbs)
- `components/ui/{NavBar,SiteFooter}.tsx`
- `/comparisons` CTAs (#14 — point `#playground` at real `/playground` presets)
- New `e2e/link-integrity.spec.ts` (crawl every internal href + `#anchor`; fail on unresolved)
- Console gallery back-link/breadcrumb consistency (#54)

### Findings addressed
#14, #20, #38, #54, #57

### Risk
**Low** — additive nav + a test; the dead-anchor fix is a target swap.

### Expected score impact
- Conversion **+5** · UX **+4**

### Validation
- Link-integrity test green (0 dead internal links/anchors).
- Blog, Roadmap, Contribute appear in the header nav and are reachable in ≤2 clicks.

---

## WS-7 — Layout rhythm & targeted layout bugs
**Root causes:** RC-7 · **Theme:** F (+ mobile parts feed Wave 2) · **Wave:** 2 (bugs) + 4 (rhythm) · **Risk:** Low · **Effort:** S–M

### Objective
A consistent vertical-rhythm scale; the specific layout bugs fixed (install chip shows the full command, clean CTA hierarchy, right-sized media). Scoped **after** RC-1 removes phantom whitespace.

### Scope
- Shared `Section` spacing scale (kill ad-hoc gaps — #32, #46)
- `sections/Hero.tsx` install chip width/wrap (#27) + CTA hierarchy (#48, #60)
- `app/console/page.tsx` hub video size (#35); capabilities workflow-family balance (#53)
- Homepage length/threading (#44)

### Findings addressed
#26, #27, #32, #35, #44, #46, #48, #53, #60

### Risk
**Low** — visual/layout polish on rendered content.

### Expected score impact
- Conversion **+6** (install + CTA) · Mobile **+5** · UX **+4**

### Validation
- Hero shows full `pnpm add @adjudicate/core` at 390px+; one clear primary CTA.
- No section gap exceeds the rhythm scale's max; footer sits within one viewport of last content.

---

## WS-8 — Content depth & system states
**Root cause:** RC-8 · **Theme:** F · **Wave:** 4 · **Risk:** Low · **Effort:** M

### Objective
Bespoke 404/empty/error/loading states; editorial depth where the audit flagged thin content; copy promises match reality.

### Scope
- New `app/not-found.tsx`, shared `Empty`/`Error`/`Loading` state components
- Blog: tags/categories + RSS (#37); transparency depth (#30)
- OutcomesBento inline depth (#59); reduced-motion hero parity (#45); "5-min demo" copy (#43)

### Findings addressed
#30, #37, #43, #45, #49, #50, #59

### Risk
**Low** — additive content + components.

### Expected score impact
- UX **+4** · Conversion **+3** · Product maturity **+4**

### Validation
- Hitting an unknown route renders a branded 404 with nav back.
- Blog has working tags + `/blog/rss.xml`; reduced-motion hero matches the animated one in content.

---

## WS-V — Validation & regression harness (cross-cutting)
**Themes:** all · **Wave:** built in 1, run every wave · **Risk:** Low · **Effort:** M

### Objective
Automated, repeatable proof for every success metric — and permanent regression guards so fixed root causes stay fixed.

### Scope
- `e2e/no-js.spec.ts` (JS disabled → content visible) — guards RC-1
- `e2e/a11y.spec.ts` (axe-core per route; 0 critical/serious) — guards RC-2/RC-3
- `e2e/contrast.spec.ts` (token-matrix AA check) — guards RC-3
- `e2e/mobile-overflow.spec.ts` (no horizontal scroll @390/360) — guards RC-5
- `e2e/link-integrity.spec.ts` (no dead internal links) — guards RC-6 (built in WS-6)
- Lighthouse CI config (a11y/perf/SEO budgets); re-runnable crawl (`audit-artifacts/crawl.spec.ts`)

### Findings addressed
All — this is the measurement layer; it doesn't fix findings, it proves and protects them.

### Risk
**Low.**

### Expected score impact
Indirect — prevents regressions of every other workstream's gains.

### Validation
- All five spec files green in CI; Lighthouse a11y > 90 on the 6 representative routes; full re-crawl shows no blank/clipped captures.

---

## Workstream summary

| WS | Root cause | Wave | Risk | Effort | Top axis impact |
|---|---|---|---|---|---|
| **WS-1** Motion/visibility | RC-1 | 1 | Med | M | UX +15, Conv +15, Mobile +12 |
| **WS-2** A11y primitives | RC-2 | 1 | Low | S–M | **A11y +18** |
| **WS-3** Contrast tokens | RC-3 | 1 | Low | S | **A11y +12** |
| **WS-4** Outcomes SSOT | RC-4 | 3 | Low | M | Conv +8, Design +6 |
| **WS-5** Responsive data | RC-5 | 2 | Med | M–L | **Mobile +15** |
| **WS-6** Nav + link integrity | RC-6 | 3 | Low | S–M | Conv +5 |
| **WS-7** Layout rhythm/bugs | RC-7 | 2+4 | Low | S–M | Conv +6, Mobile +5 |
| **WS-8** Content/states | RC-8 | 4 | Low | M | UX +4 |
| **WS-V** Validation harness | all | 1+ | Low | M | regression guard |
