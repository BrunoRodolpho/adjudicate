# Agent-ready tasks

Each workstream decomposed into tasks an autonomous agent can execute end-to-end. Tasks follow the pattern **audit → design → implement → test → validate**. Every task lists *objective · files · acceptance criteria · tests required*. Task IDs are `<WS>.<n>`. Dependencies are noted as `needs:`.

> **Global preconditions for every implementing agent:** branch off `feat/web-marketing-refactor` (or a child); run `pnpm --filter @adjudicate/web build && lint && test` green before completing; do not regress round-2 visual craft; preserve honesty invariants (no `claustrum`/BBQ, real `IntentEnvelope` shape, illustrative/SIMULATED labels, no command text, no DB/Redis). Worktree isolation recommended for parallel WS to avoid file conflicts.

---

## WS-1 — Motion / visibility (RC-1)

**T1.1 — Audit all motion-gated visibility**
- **Objective:** enumerate every usage of `Reveal`/`Stagger`/`CountUp`/`DrawOnScroll` and every `initial="hidden"`/`whileInView`/`opacity:0` pattern; produce a usage map (file → component → what it wraps).
- **Files (read):** `components/home/Reveal.tsx`, `lib/motion.ts`, `components/motion/*`, all `sections/**`, `app/**/page.tsx`, `components/console-kit/*`, `components/comparisons/WedgeTable.tsx`.
- **Acceptance:** a markdown map listing every consumer + the content it currently hides.
- **Tests:** none (analysis). Output committed to `audit-artifacts/execution-plan/_motion-usage-map.md`.

**T1.2 — Design progressive-enhancement motion architecture**
- **Objective:** specify the new contract — visible-by-default steady state, motion as transform-only enhancement, no-JS/reduced-motion = full content, no `once:true` permanence. Decide CSS-first (`animation-timeline: view()` + `@media (prefers-reduced-motion)`) vs framer-motion with `initial={false}`.
- **Files:** design doc only.
- **Acceptance:** an API spec for the new `Reveal`/`Stagger`/`CountUp`/`DrawOnScroll` (props, SSR output, fallback behavior) that guarantees visible SSR HTML.
- **Tests:** spec includes the no-JS acceptance contract.
- **needs:** T1.1

**T1.3 — Implement the rewritten motion primitives**
- **Objective:** rewrite `Reveal` + the motion kit per T1.2; the rendered HTML is visible (`opacity:1`, no transform that hides) without JS; animation only adds on top when motion is allowed and JS runs.
- **Files:** `components/home/Reveal.tsx`, `lib/motion.ts`, `components/motion/{Stagger,CountUp,DrawOnScroll,HoverLift}.tsx`.
- **Acceptance:** server-rendered markup contains visible content for every consumer; reduced-motion renders static; animations still play for motion-OK JS clients.
- **Tests:** unit/SSR snapshot asserting no `opacity:0`/hiding transform in default render.
- **needs:** T1.2

**T1.4 — Migrate all consumers**
- **Objective:** update every surface from T1.1 to the new primitives; remove any leftover `initial="hidden"`/`once:true`.
- **Files:** all consumers from T1.1.
- **Acceptance:** grep finds no `opacity:0`-initial reveal pattern in app/sections/components.
- **Tests:** build green; e2e renders content on each migrated route.
- **needs:** T1.3

**T1.5 — Regression test + re-crawl**
- **Objective:** add the no-JS render test (hand to WS-V as `e2e/no-js.spec.ts`) and re-run the screenshot crawl to confirm no blank below-fold.
- **Files:** `e2e/no-js.spec.ts`, `audit-artifacts/crawl.spec.ts`.
- **Acceptance:** no-JS test green for all routes; re-crawl diff shows previously-blank captures now populated.
- **Tests:** the no-JS spec itself.
- **needs:** T1.4

---

## WS-2 — A11y primitives (RC-2)

**T2.1 — Audit focusable elements + landmarks**
- **Objective:** list every interactive primitive and its current focus style; confirm SkipLink unmounted + no `<main>`; document mobile-sheet semantics.
- **Files (read):** `components/ui/{Button,Card,NavBar}.tsx`, mobile sheet, `components/ui/SkipLink.tsx`, `app/layout.tsx`, `console-kit/ErrorState`.
- **Acceptance:** a gap list (element → missing focus/landmark/dialog semantic).
- **Tests:** none (analysis).

**T2.2 — Add `focusRing` to design-system primitives**
- **Objective:** one shared focus-visible utility; apply to Button/Card/NavBar/links/ErrorState.
- **Files:** Tailwind layer / `lib/`, `components/ui/{Button,Card,NavBar}.tsx`, `console-kit/ErrorState`.
- **Acceptance:** every interactive element shows a visible ring on keyboard focus; none use bare `outline-none` without a replacement.
- **Tests:** axe `focus` rules pass; e2e tab-walk asserts a focus ring style on each stop.
- **needs:** T2.1 · **clears:** #1, #22, #51

**T2.3 — Build a real `Dialog` primitive + adopt in mobile sheet**
- **Objective:** `Dialog` with `role="dialog"`, `aria-modal`, focus trap, Escape-to-close, focus restore; mobile menu uses it.
- **Files:** new `components/ui/Dialog.tsx`, mobile sheet in `NavBar`.
- **Acceptance:** open → focus trapped; Escape closes; focus returns to trigger.
- **Tests:** e2e keyboard test (trap/Escape/restore); axe `dialog` rules pass.
- **needs:** T2.1 · **clears:** #13

**T2.4 — Mount SkipLink + `<main>` landmark + banner landmark**
- **Objective:** render `SkipLink` first in `layout.tsx`; wrap page content in `<main id="main" tabIndex={-1}>`; give the announcement banner a landmark.
- **Files:** `app/layout.tsx`, `components/ui/AnnouncementBanner.tsx`.
- **Acceptance:** Tab from page load → SkipLink is first focusable and jumps to `<main>`.
- **Tests:** axe `landmark`/`skip-link`/`region` rules pass; e2e skip-link test.
- **needs:** T2.1 · **clears:** #12, #55

**T2.5 — Keyboard-distinguishable cards**
- **Objective:** capability/recipe index cards are individually focusable with distinct accessible names (not all "Open").
- **Files:** `app/capabilities/page.tsx`, `app/recipes/page.tsx`, `Card`.
- **Acceptance:** each card has a unique accessible name; visible focus.
- **Tests:** axe; e2e accessible-name assertion.
- **needs:** T2.2 · **clears:** #33

---

## WS-3 — Contrast tokens (RC-3)

**T3.1 — Audit the token contrast matrix**
- **Objective:** compute contrast for every text/bg token pairing (light canvas + dark console); list failures.
- **Files (read):** `tailwind.config.*`, `content/decisions.ts`, consumers of `faint`/decision text/`console.*`.
- **Acceptance:** a pass/fail matrix with measured ratios.
- **Tests:** none (analysis).

**T3.2 — Define AA-safe text token tier**
- **Objective:** split decorative vs text tokens; darken `muted`/`faint` to AA; add/route decision *text* to `*-strong`; replace one-off `indigo-600` (#56) and integrity dark-on-light pills (#31) with system tokens.
- **Files:** token source, `content/decisions.ts`, `components/blog/*`, integrity badge components.
- **Acceptance:** all text pairings ≥ AA (4.5:1 / 3:1 large); REWRITE chip uses AA-safe orange (#41).
- **Tests:** contrast test (T3.3) green.
- **needs:** T3.1 · **clears:** #2, #28, #31, #36, #41, #56

**T3.3 — Contrast regression test + hero headline check**
- **Objective:** automated token-matrix AA test (hand to WS-V); verify the gradient hero headline (#29) meets contrast or add a solid fallback.
- **Files:** `e2e/contrast.spec.ts`, `sections/Hero.tsx`.
- **Acceptance:** test green; Lighthouse contrast audit passes on home/console/blog/capability.
- **Tests:** the contrast spec.
- **needs:** T3.2 · **clears:** #29

---

## WS-4 — Outcomes SSOT (RC-4)

**T4.1 — Define canonical `outcomes.ts`**
- **Objective:** one module: the six outcomes with `kind`, `name`, `order`, `gloss`, `color` (AA-safe, from WS-3), `icon`.
- **Files:** new/normalized `content/outcomes.ts`; reconcile with `content/decisions.ts` (single palette source — #21).
- **Acceptance:** one exported canonical list; old palette source re-exports or is deleted.
- **Tests:** unit asserting six entries, canonical names.
- **needs:** T3.2 (AA colors) · **clears:** #21

**T4.2 — Unify the chip component**
- **Objective:** merge `DecisionChip` + motion `DecisionBadge` into one chip consuming `outcomes.ts`; delete the duplicate; collapse the ad-hoc type scale to named sizes (#39).
- **Files:** `components/ui/DecisionChip.tsx`, motion `DecisionBadge`, all consumers.
- **Acceptance:** one chip component repo-wide; grep finds no second chip.
- **Tests:** build green; visual snapshot of the chip set.
- **needs:** T4.1 · **clears:** #40, #39

**T4.3 — Fix outcome copy everywhere**
- **Objective:** hero names all six (#23); `/how-it-works` uses canonical names, not modify/wait/ask (#24); remove verbatim duplicate paragraph on capability pages (#16); align "5-min demo" copy (#43).
- **Files:** `sections/Hero.tsx`, `app/how-it-works/*`, `components/capabilities/*`.
- **Acceptance:** hero lists 6/6; no non-canonical outcome name anywhere; no duplicate subtitle/body.
- **Tests:** e2e asserts six outcome names in hero; grep guard forbids `modify|wait|ask` as outcome labels.
- **needs:** T4.1

**T4.4 — Pick one maturity taxonomy**
- **Objective:** choose Tier 1/2 **or** Live/Illustrative and apply across capabilities + recipes; retire the other (#17); de-stack the triple honesty framing on console replicas (#34).
- **Files:** `content/capabilities.ts`, `content/recipes.ts`, capability/recipe/console layouts.
- **Acceptance:** one maturity vocabulary site-wide.
- **Tests:** grep guard for the retired vocabulary; e2e spot-check.
- **needs:** T4.1 · **clears:** #17, #34

---

## WS-5 — Responsive data surfaces (RC-5)

**T5.1 — Audit dense surfaces at 390/360px**
- **Objective:** catalog every table/diagram and its mobile failure mode (clip / drop / gap-stack).
- **Files (read):** `console-kit/*`, `components/architecture/DataFlowDiagram.tsx`, introspection graph, `WedgeTable`, transparency tables.
- **Acceptance:** surface → failure-mode → chosen strategy (scroll vs reflow) list.
- **Tests:** none (analysis).

**T5.2 — Build `ResponsiveTable` primitive**
- **Objective:** overflow-x scroll container with edge fades + "scroll for more" affordance + sticky first column.
- **Files:** new `components/ui/ResponsiveTable.tsx`.
- **Acceptance:** wraps any table; at 390px no clip, horizontal scroll works with a visible affordance.
- **Tests:** mobile-overflow spec on a sample table.
- **needs:** T5.1

**T5.3 — Apply to console tables + AI-BOM**
- **Objective:** audit-explorer + replica tables use `ResponsiveTable` (#18, #25); AI-BOM restores the detail pane via tabs/accordion on mobile (#19).
- **Files:** `console-kit/*`, AI-BOM page.
- **Acceptance:** no clipped columns; AI-BOM shows detail pane on mobile.
- **Tests:** mobile-overflow spec green for `/console/*`.
- **needs:** T5.2 · **clears:** #18, #19, #25

**T5.4 — Reflow diagrams for mobile**
- **Objective:** `DataFlowDiagram` + introspection graph reflow to a clean mobile layout (no gap-ridden stack — #15); transparency tables responsive (#30).
- **Files:** `DataFlowDiagram.tsx`, introspection graph, transparency.
- **Acceptance:** diagrams legible at 390px without overflow.
- **Tests:** mobile-overflow spec green for `/architecture/data-flow`, `/introspection`, `/transparency/*`.
- **needs:** T5.2 · **clears:** #15, #30

---

## WS-6 — Nav + link integrity (RC-6)

**T6.1 — Single nav source + header IA**
- **Objective:** `content/nav.ts` is the only link source for header/footer/breadcrumbs; promote Blog/Roadmap/Contribute into the header (#20, #38).
- **Files:** `content/nav.ts`, `components/ui/{NavBar,SiteFooter}.tsx`.
- **Acceptance:** Blog/Roadmap/Contribute reachable from header; nav data centralized.
- **Tests:** e2e asserts the three links in header.
- **clears:** #20, #38

**T6.2 — Kill dead anchors**
- **Objective:** the six `#playground` CTAs on `/comparisons` point at real `/playground` presets (#14); remove the stray roadmap date-link (#57).
- **Files:** `app/comparisons/*`, `app/roadmap/*`.
- **Acceptance:** no `#playground` anchor; every comparisons CTA resolves.
- **Tests:** link-integrity spec (T6.3) green.
- **clears:** #14, #57

**T6.3 — Link-integrity test**
- **Objective:** crawl every internal `href` + `#anchor`; fail on any unresolved target; standardize console back-link/breadcrumb (#54).
- **Files:** new `e2e/link-integrity.spec.ts`, console layout.
- **Acceptance:** 0 dead internal links/anchors; consistent console wayfinding.
- **Tests:** the link-integrity spec.
- **needs:** T6.1, T6.2 · **clears:** #54

---

## WS-7 — Layout rhythm & bugs (RC-7)

**T7.1 — Fix install-chip truncation + hero CTA hierarchy**
- **Objective:** hero shows full `pnpm add @adjudicate/core` (#27); one clear primary CTA, de-emphasized secondary/tertiary (#48, #60).
- **Files:** `sections/Hero.tsx`.
- **Acceptance:** full command visible at ≥390px; visually-dominant single primary CTA.
- **Tests:** e2e asserts full install string present; screenshot diff.
- **clears:** #27, #48, #60

**T7.2 — Shared Section rhythm (post-RC-1)**
- **Objective:** a vertical-rhythm scale applied to all sections; kill oversized gaps + trailing whitespace remaining after RC-1 (#26, #32, #46, #58); right-size console-hub video (#35); balance workflow family (#53); tighten homepage threading (#44).
- **Files:** shared `Section` component, `app/console/page.tsx`, `app/capabilities/page.tsx`, `app/page.tsx`.
- **Acceptance:** no gap exceeds the scale max; footer within one viewport of last content; homepage scannable.
- **Tests:** screenshot crawl shows no large empty bands.
- **needs:** T1.4 (must re-measure after RC-1) · **clears:** #26, #32, #35, #44, #46, #53, #58

---

## WS-8 — Content depth & system states (RC-8)

**T8.1 — Bespoke system states**
- **Objective:** branded `not-found` + shared `Empty`/`Error`/`Loading` components.
- **Files:** `app/not-found.tsx`, `components/ui/{Empty,Error,Loading}.tsx`.
- **Acceptance:** unknown route → branded 404 with nav back.
- **Tests:** e2e hits a bad route → branded 404.

**T8.2 — Editorial depth**
- **Objective:** blog tags/categories + RSS (#37); transparency depth (#30); OutcomesBento inline depth, no click-gating (#59); reduced-motion hero parity (#45).
- **Files:** `content/blog.ts`, `app/blog/*`, new `app/blog/rss.xml`, transparency pages, `sections/home/OutcomesBento.tsx`, `sections/Hero.tsx`.
- **Acceptance:** blog has tags + RSS; reduced-motion hero matches animated content; bento depth visible without a click.
- **Tests:** RSS validates; e2e reduced-motion hero parity check.
- **needs:** T1.4 (reduced-motion contract)

---

## WS-V — Validation harness (cross-cutting)

**TV.1 — no-JS render spec** (`e2e/no-js.spec.ts`) — JS disabled → primary content visible per route. *Guards RC-1.* (Built in T1.5.)
**TV.2 — axe a11y spec** (`e2e/a11y.spec.ts`) — 0 critical/serious per route. *Guards RC-2/RC-3.*
**TV.3 — contrast spec** (`e2e/contrast.spec.ts`) — token matrix ≥ AA. *Guards RC-3.* (Built in T3.3.)
**TV.4 — mobile-overflow spec** (`e2e/mobile-overflow.spec.ts`) — `scrollWidth ≤ innerWidth` @390/360 per route. *Guards RC-5.*
**TV.5 — link-integrity spec** — built in T6.3. *Guards RC-6.*
**TV.6 — Lighthouse CI** — a11y > 90, perf budget, SEO; on the 6 representative routes (home, capabilities index, a capability, a console replica, a recipe, blog).
- **Acceptance (all TV):** every spec green in CI; full re-crawl shows no blank/clipped captures.
- **Tests:** the specs themselves are the deliverable.
