# Strategic themes

Six themes group the 8 root causes into coherent bodies of work. Each theme names the **one architectural change** that collapses its findings, so we fix causes once instead of patching pages. Themes map to waves (see `EXECUTION_ROADMAP.md`): A+B = Wave 1, D = Wave 2, C+E = Wave 3, F = Wave 4.

---

## Theme A — Foundational robustness & content visibility
**Root cause:** RC-1 · **Workstream:** WS-1 · **Wave:** 1 (first)

**The problem in one line:** the motion layer decides whether content *exists*, not just how it animates.

**Includes:**
- Reveal/Stagger/CountUp/DrawOnScroll architecture rewrite
- Progressive enhancement (visible baseline; motion as a layer)
- SSR / no-JS / print / crawler compatibility
- `viewport once:true` permanence removal

**The single architectural change:** rewrite the motion primitives so the **steady (visible) state is the SSR/no-JS default** and animation is an opt-in transform-only enhancement. Prefer CSS-first (`@media (prefers-reduced-motion: no-preference)` + scroll-driven `animation-timeline: view()` where supported, graceful no-op otherwise) over JS-gated `initial="hidden"`. Content must be in the DOM **visible** regardless of JS.

**Findings cleared:** #3, #4, #5, #6, #7, #8, #9, #10, #11, #42 (+ phantom-whitespace contributions to #26, #58).

**Why it leads:** it's the prerequisite that makes every other theme's validation trustworthy, and it's a single-component rewrite — maximum score-per-effort on the board.

---

## Theme B — Accessibility foundation
**Root causes:** RC-2 + RC-3 · **Workstreams:** WS-2 (semantics) + WS-3 (contrast) · **Wave:** 1

**The problem in one line:** accessibility was never baked into the primitives or the color tokens.

**Includes:**
- `:focus-visible` rings on all interactive primitives
- A real `Dialog` primitive (focus trap, Escape, focus restore) for the mobile sheet
- Skip-link + `<main>` landmark + banner landmark
- Keyboard operability + scan-distinguishable cards
- WCAG AA contrast tokens (text tier) for light canvas *and* dark console

**The single architectural change (×2):**
1. **Semantics into the design system:** one `focusRing` utility applied to `Button`/`Card`/`NavBar`/links; one `<Dialog>` primitive the mobile sheet uses; mount `SkipLink` + `<main id="main">` once in `layout.tsx`.
2. **Contrast into the tokens:** split tokens into *decorative* vs *text* tiers; every text token meets AA; decision *text* uses `*-strong`; a contrast test forbids regressions.

**Findings cleared:** #1, #2, #12, #13, #22, #28, #29, #31, #33, #36, #41, #51, #55, #56 (+ keyboard half of #47).

**Why it pairs with A:** Theme A makes content *exist*; Theme B makes it *operable and perceivable*. Together they convert the weakest axis (Accessibility 42) into a strength and clear all 11 Criticals.

---

## Theme C — Design-system single source of truth
**Root cause:** RC-4 (+ RC-7 rhythm tokens) · **Workstream:** WS-4 (+ part of WS-7) · **Wave:** 3

**The problem in one line:** the load-bearing vocabulary (six outcomes), palette, taxonomy, chips, and type scale are duplicated and drift.

**Includes:**
- One canonical `outcomes.ts` (kind → name, order, gloss, color, icon)
- One outcome chip component (kill the duplicate)
- One maturity taxonomy (retire Tier 1/2 *or* Live/Illustrative — pick one)
- One type scale (collapse the ~8 ad-hoc pixel sizes)
- Copy consistency: hero names all six; how-it-works uses canonical names

**The single architectural change:** a canonical content+token module that *every* copy string and chip imports; the build fails if an outcome is referenced by a non-canonical name. Drift becomes structurally impossible.

**Findings cleared:** #16, #17, #21, #23, #24, #34, #39, #40 (+ #43 copy).

---

## Theme D — Responsive & mobile experience
**Root cause:** RC-5 (+ RC-7 mobile layout) · **Workstream:** WS-5 (+ part of WS-7) · **Wave:** 2

**The problem in one line:** dense desktop-first surfaces have no defined mobile behavior.

**Includes:**
- A `ResponsiveTable`/overflow primitive (horizontal scroll + edge fade + affordance)
- Diagram-reflow pattern for `DataFlowDiagram` / force-graph
- AI-BOM mobile (restore the detail pane via tabs/accordion)
- Touch targets ≥44px; no horizontal page scroll at 390px
- Trailing-whitespace cleanup (post-RC-1 remeasure)

**The single architectural change:** one responsive-overflow primitive + one diagram-reflow pattern, applied to every dense surface — instead of bespoke media queries per page.

**Findings cleared:** #15, #18, #19, #25, #30, #36 (density), #46, #47, #52, #58, #60.

---

## Theme E — Navigation & discoverability
**Root cause:** RC-6 · **Workstream:** WS-6 · **Wave:** 3

**The problem in one line:** nav and internal links aren't derived from — or validated against — the real route set.

**Includes:**
- One nav source feeding header + footer + breadcrumbs
- Promote Blog / Roadmap / Contribute into the header IA
- Kill the six dead `#playground` anchors (point at real targets)
- Link-integrity test (CI fails on any dead internal href/anchor)
- Console-gallery wayfinding (breadcrumb/back-link consistency)

**The single architectural change:** a typed nav/route registry as the *only* place links are defined, plus an automated link-integrity test that makes dead anchors and orphans impossible to ship.

**Findings cleared:** #14, #20, #38, #54, #57.

---

## Theme F — Layout rhythm, content depth & system states
**Root causes:** RC-7 + RC-8 · **Workstreams:** WS-7 + WS-8 · **Wave:** 4 (polish)

**The problem in one line:** after the foundations land, what's left is spacing rhythm, a few real layout bugs, editorial depth, and missing default states.

**Includes:**
- Shared `Section` vertical-rhythm scale (kills oversized gaps)
- Targeted bug fixes: install-chip truncation (#27), hero CTA hierarchy (#48, #60), console-hub video size (#35), workflow-family overload (#53)
- Bespoke `not-found` / empty / error / loading states
- Editorial depth: blog tags/RSS (#37), transparency depth (#30), OutcomesBento inline depth (#59)
- Reduced-motion hero parity (#45); homepage length/threading (#44)

**The single architectural change (where one exists):** a shared `Section` rhythm scale + a shared set of system-state components. The rest is targeted bug + editorial work that's only correctly scoped *after* RC-1 removes phantom whitespace.

**Findings cleared:** #26, #27, #30, #32, #35, #37, #43, #44, #45, #48, #49, #50, #53, #59, #60.

---

## Theme → wave → score summary

| Theme | RCs | Workstreams | Wave | Primary axis moved |
|---|---|---|---|---|
| **A** Robustness & visibility | RC-1 | WS-1 | 1 | UX, Conversion, Mobile (all, via render) |
| **B** Accessibility foundation | RC-2, RC-3 | WS-2, WS-3 | 1 | **Accessibility 42→75** |
| **D** Responsive & mobile | RC-5, RC-7m | WS-5, WS-7 | 2 | **Mobile 43→72** |
| **C** Design-system SSOT | RC-4 | WS-4 | 3 | **Conversion / Design** |
| **E** Nav & discoverability | RC-6 | WS-6 | 3 | **Conversion 54→78** |
| **F** Rhythm, depth, states | RC-7, RC-8 | WS-7, WS-8 | 4 | Polish / Product maturity |

Cross-cutting: **WS-V** (validation harness) underpins all themes and is the permanent regression guard.
