# Root-cause analysis

**60 findings → 8 root causes.** Most of the 11 Criticals are a *single* architectural bug. Each finding below is tagged correct? · symptom/root · duplicate-of. Assumes no users, no backward-compat — we fix causes, not pages.

> Headline: **of 11 Criticals, 8 are the same root cause (RC-1).** One architectural change clears most of the "blank page" crisis.

---

## RC-1 — The motion system gates content *existence*, not just animation
**Severity: Critical · The dominant root cause.**

`components/home/Reveal.tsx` + the motion kit (`Stagger`, `CountUp`, `DrawOnScroll`) animate from framer-motion `initial="hidden"` (`revealVariants.hidden = {opacity:0,y:12}` in `lib/motion.ts`) and only reach the visible state via `whileInView`. Because framer-motion writes the `initial` style into SSR HTML, **content is `opacity:0` until a client IntersectionObserver callback fires** — so no-JS, print, throttled clients, some crawlers, and (the audit's own) full-page captures render blank. `viewport={{once:true}}` makes a missed trigger permanent.

**Findings caused (all consequences, not separate problems):** #3, #4, #5, #6, #7, #8, #9, #10, #11, #42 (10 — incl. 8 of 11 Criticals), plus contributing to #26, #32, #46, #58.

**Why architectural, not page-level:** the bug lives in *one wrapper used on ~7 surfaces*. Fixing pages individually is wrong; **rewrite the motion primitive once** so content is visible by default and motion is a transform-only enhancement layered on a visible baseline (CSS `@starting-style`/`animation-timeline: view()` or framer-motion with `initial={false}` + a no-JS-safe steady state).

---

## RC-2 — Accessibility was never baked into the design-system primitives
**Severity: Critical.**

The shared interactive primitives (`Button`, `Card`, `NavBar`, the mobile sheet, console `ErrorState`) ship **no `:focus-visible` ring, no dialog semantics, no landmark/skip wiring**. The `SkipLink` component exists but is never mounted; there is no focusable `<main>`; the mobile menu is a `div`, not a focus-trapped `role="dialog"`.

**Findings caused:** #1, #12, #13, #22, #33, #51, #55 (and the keyboard half of #47).

**Why architectural:** "add a focus ring to 40 components" is the wrong frame. **Bake focus-visible + landmarks + a real `Dialog` primitive into the design system once**, and mount `SkipLink` + `<main id>` in `layout.tsx`. ~5 primitive edits fix the entire site.

---

## RC-3 — Color tokens were chosen aesthetically, not for text contrast
**Severity: Critical.**

The Tailwind palette (`muted` #71717A, `faint` #A1A1AA, the six decision colors, the `console.*` dark tokens) is used for **body and label text** but several combinations fall below WCAG AA 4.5:1 (e.g. `faint` on `canvas`, decision-color text on light, `console.faint` on near-black, 10–11px gray-on-dark). The AA-safe `rewrite.strong` exists but isn't used for the REWRITE chip text.

**Findings caused:** #2, #28, #29, #31, #36, #41, #56.

**Why architectural:** **define an AA-safe text-color tier in the token system** (split "decorative" vs "text" tokens; map all decision *text* to `*-strong`), then forbid the failing combos via a lint/test. Don't recolor pages.

---

## RC-4 — No single source of truth for the outcome vocabulary, palette, and taxonomy
**Severity: High.**

The six outcomes' **names, order, gloss, and color** are duplicated across copy and **two** chip components (`DecisionChip` + the motion `DecisionBadge`) and drift: the hero lists 5 of 6 (#23), `/how-it-works` renames three to modify/wait/ask (#24), the palette has two sources (#21), two chip components with divergent scales (#40), and a *second* maturity taxonomy (Tier 1/2 vs Live/Illustrative) overlaps confusingly (#17, #34).

**Findings caused:** #17, #21, #23, #24, #34, #40 (+ the copy half of #16, #43).

**Why architectural:** **one canonical `content/outcomes.ts`** (kind → name, order, one-line gloss, color, icon) consumed by *every* copy string and *one* chip component; **one** maturity taxonomy. Drift becomes impossible.

---

## RC-5 — Dense data surfaces have no responsive/overflow architecture
**Severity: High.**

Tables and diagrams ported desktop-first from the dark operator console (`console-tour/*`, `WedgeTable`, `DataFlowDiagram`) **clip right-most columns at 390px with no scroll affordance** (#18, #25), **drop entire panes** (AI-BOM detail, #19), or become **gap-ridden vertical stacks** (#15). There is no shared "what dense content does on small screens" pattern.

**Findings caused:** #15, #18, #19, #25, #30 (+ density part of #36, #52).

**Why architectural:** **a `ResponsiveTable`/overflow-scroll primitive** (horizontal scroll + edge fades + "scroll for more" affordance) and a **diagram-reflow pattern**, applied across all dense surfaces.

---

## RC-6 — Navigation/IA isn't derived from a single validated source
**Severity: High.**

Internal links and the nav graph aren't validated against the real route set: **six dead `#playground` anchors on /comparisons** (#14), **blog/roadmap/contribute are footer-only** (orphaned from the header, #20), the header IA is one thin dropdown + a flat list (#38).

**Findings caused:** #14, #20, #38 (+ wayfinding #54).

**Why architectural:** **one nav source** (`content/nav.ts`) feeding header + footer + breadcrumbs, plus a **link-integrity test** (every internal `href`/anchor resolves; CI fails on a dead link). Dead anchors and orphans become impossible.

---

## RC-7 — Layout rhythm + a few specific layout bugs
**Severity: Mixed (High→Low).**

Partly a shared section-rhythm issue (oversized gaps, trailing whitespace — much of which is actually RC-1's blank revealed space) and partly **specific one-off bugs**: the hero install chip is width-clipped to `pnpm add @adjudicate/cor` (#27), the hero CTA hierarchy is muddy (#48, #60), the homepage is 14 sections/~13k px and loses the thread (#44), the console-hub video is too small (#35).

**Findings caused:** #26 (mostly RC-1), #27, #32, #35, #44, #46, #48, #53, #60.

**Why mostly architectural + a few bugs:** tighten the shared `Section` rhythm once; fix the install-chip and CTA-hierarchy as targeted bugs. Re-measure after RC-1 (much "empty space" disappears once content renders).

---

## RC-8 — Content depth & missing system states
**Severity: Medium→Low.**

The site has **no bespoke 404 / empty / loading / error states** (Next defaults), the **blog is structurally bare** (4 posts, no tags/RSS, #37), **transparency sub-views are single-screen/thin** (#30), the OutcomesBento hides its differentiator behind a click (#59), the reduced-motion hero is degraded vs the animated one (#45), and the "5-min demo" CTA over-promises (#43).

**Findings caused:** #30, #37, #43, #45, #49, #50, #59 (+ copy #16).

**Why mostly content + a small state-component set:** add shared `NotFound`/`Empty`/`Error` components once; the rest is editorial depth + copy alignment (folds into RC-4 for messaging).

---

## Collapse summary

| Root cause | Findings | Crit | Architectural fix (once) |
|---|---|---:|---|
| **RC-1 Motion gates visibility** | #3-11, #42 (+26,32,46,58) | 8 | Rewrite `Reveal`/motion kit → visible-by-default, motion as enhancement |
| **RC-2 A11y not in primitives** | #1,12,13,22,33,51,55 | 2 | Focus-visible + `Dialog` + SkipLink/landmark in the design system |
| **RC-3 Non-AA text tokens** | #2,28,29,31,36,41,56 | 1 | AA-safe text-token tier + forbid failing combos |
| **RC-4 No canonical outcomes/taxonomy** | #17,21,23,24,34,40 | 0 | One `outcomes.ts` + one chip + one maturity taxonomy |
| **RC-5 No responsive data architecture** | #15,18,19,25,30 | 0 | `ResponsiveTable`/overflow primitive + diagram reflow |
| **RC-6 Nav not single-sourced/validated** | #14,20,38,54 | 0 | One nav source + link-integrity test |
| **RC-7 Layout rhythm + bugs** | #27,32,35,44,46,48,53,60 | 0 | `Section` rhythm + targeted bug fixes |
| **RC-8 Content depth + system states** | #30,37,43,45,49,50,59 | 0 | Shared state components + editorial depth |

**11 Critical findings → effectively 3 root causes (RC-1, RC-2, RC-3).** Wave 1 targets exactly those.
