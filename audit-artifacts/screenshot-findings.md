# Screenshot-based findings

> 60 findings from 9 specialist agents reading the actual screenshots + source. Numbered, severity-sorted, each tied to a real screenshot. **Brutally honest; assumes no users / no backward-compat.**

**Severity counts:** Critical 11 · High 16 · Medium 23 · Low 10

> ⚠️ Many full-page screenshots show blank space below the hero. That is **not** a capture glitch — it is Finding #1 (scroll-reveal gates content visibility). The blanks are evidence.

## Finding #1 — No focus-visible styles on the shared Button or NavBar — keyboard focus is invisible on every CTA and nav link

**Severity:** Critical  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 98%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** apps/web/src/components/ui/Button.tsx defines zero focus styles (the variant STYLES map has only bg/hover entries; the base class string has no focus-visible:ring). apps/web/src/components/ui/NavBar.tsx links, wordmark, dropdown trigger, mobile menu button, and DropdownItem also have no focus styles. apps/web/src/app/globals.css has no global :focus-visible rule (grep confirmed 'NO global focus rule'). So the gradient 'Try the 5-min demo' / 'GitHub' / 'Open console' buttons and all 'How it works / Capabilities / Recipes / Console / Playground / Docs' nav links fall back to the browser default outline only. On the bg-gradient-primary button (indigo→fuchsia) the thin UA outline is barely perceptible against the saturated fill.

**Why it matters:** Keyboard and switch users cannot reliably see where focus is on the site's primary conversion path and entire top-level navigation. This is a WCAG 2.4.7 Focus Visible failure on the most important interactive elements and makes the site effectively un-navigable by keyboard at a glance.

**Evidence:** Button.tsx lines 16-23 STYLES have no focus token; class string line 34 has none. NavBar.tsx DesktopEntry className (line 144-147), DropdownItem (264-267), mobile trigger (116), wordmark (79) — none contain 'focus'. globals.css grep for 'focus' returns nothing. Contrast: the Playground tabs DO use focus-visible:ring-2 focus-visible:ring-ink/40 (Playground.tsx line 102), proving the gap is an inconsistency, not a system limitation.

**Recommendation:** Add a consistent focus-visible ring to the Button base class (e.g. 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas') and to every NavBar link/trigger/wordmark. Reuse the exact ring token already used by Playground tabs so the whole site shares one focus idiom. Optionally add a globals.css :focus-visible fallback as a safety net.

**Expected impact:** Restores visible keyboard focus across 100% of CTAs and nav, closing a WCAG 2.4.7 A failure on the conversion path. Single shared token means one change covers the whole site.

---

## Finding #2 — Decision-color text and faint text fail WCAG AA on the light marketing canvas

**Severity:** Critical  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 97%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** On the white/off-white marketing surfaces, decision colors are used as standalone text (not only inside chips with a tinted background). Measured WCAG ratios against #FAFAF9 canvas: text-defer #F59E0B = 2.06:1, text-execute #10B981 = 2.43:1, text-confirm #0EA5E9 = 2.65:1, text-rewrite #F97316 = 2.68:1, text-refuse #EF4444 = 3.6:1 — all below the 4.5:1 AA threshold for normal text (defer is below even the 3:1 large-text/UI floor). Separately, text-faint #A1A1AA = 2.45:1 and is used ~105 times across sections (grep count: 105) for genuine secondary copy. In capabilities.png the tiny outcome chips on each card (REWRITE/EXECUTE/REFUSE) and the muted card descriptions read as low-contrast against white.

**Why it matters:** Low-vision users and anyone in bright light cannot read the very labels that communicate the product's core value proposition (the six outcomes) or the supporting copy. This is a WCAG 1.4.3 Contrast (Minimum) AA failure repeated across HowItWorks, WedgeTable, ComparisonPreamble, Positioning, PacksSection, and the capabilities cards.

**Evidence:** tailwind.config.ts defines defer:#F59E0B, execute:#10B981, confirm:#0EA5E9, rewrite.DEFAULT:#F97316, refuse:#EF4444, faint:#A1A1AA, canvas:#FAFAF9. Computed ratios above. Standalone text-* usage confirmed: HowItWorks.tsx:196/373 (text-rewrite), WedgeTable.tsx:12/24/29 (text-execute/defer/confirm), ComparisonPreamble.tsx:151-181 accents, Positioning.tsx:25. The config even comments rewrite.strong #C2410C as 'AA contrast for body-weight on white' (5.18:1) and StepReceipt.tsx uses text-rewrite-strong — so an AA-safe variant exists but is applied inconsistently.

**Recommendation:** Introduce a `-strong` (≈700-weight) AA variant for every decision color as already done for rewrite, and swap all standalone `text-execute/defer/refuse/confirm/escalate` body/label usages on light surfaces to the strong variant. Darken `faint` for any text role (zinc-400→zinc-500/600) or reserve faint strictly for non-text decoration; for the small uppercase chips, either bump to large-text size or add the tinted bg+border so they meet 3:1 as UI components.

**Expected impact:** Brings the six-outcome labels and ~105 faint-text instances to AA, fixing the most repeated contrast failure and making the core value prop legible to low-vision users.

---

## Finding #3 — The most persuasive content (data-flow pipeline, wedge table, decision grid) renders as blank voids

**Severity:** Critical  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** M  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/comparisons.png`

**Problem:** The core value-communication elements are wrapped in opacity:0 scroll-reveal containers and appear completely empty in the captured pages. In comparisons.png, the area under 'Six outcomes, not two' (the 6-card DecisionsGrid) is blank, and the WedgeTable shows its header row (CAPABILITY / OPA/CEDAR / ADJUDICATE) over an entirely empty table body. The same voids appear in architecture.png (the 'Underneath the kernel' section is blank) and architecture_data-flow.png (the DataFlowDiagram below 'fans out to two destinations' and the entire TrustBoundaryPanel grid are blank). Root cause in code: DecisionsGrid.tsx (initial={{opacity:0}} whileInView), WedgeTable.tsx (Stagger as='tbody'), DataFlowDiagram.tsx and TrustBoundaryPanel.tsx (Stagger/StaggerItem), all using lib/motion.ts revealVariants where hidden={opacity:0,y:12} and visibility only flips on whileInView.

**Why it matters:** These are the literal 'wedge' — the OPA/Cedar comparison table and the six-outcome algebra are the entire reason a technical buyer visits /comparisons, and the annotated pipeline is the proof-of-rigor on /architecture/data-flow. If they are invisible to any non-scrolling render path (HTML crawlers/SEO, social previews, no-JS, very slow hydration, or any reader who lands deep-linked and reads top-down before the IntersectionObserver fires), the page communicates nothing and looks broken. For an OSS infra product whose whole pitch is determinism and trustworthiness, shipping pages that can render empty is uniquely damaging.

**Evidence:** comparisons.png shows a 3-column table header with zero data rows beneath it; architecture_data-flow.png shows the 'The trust boundary' heading and column-less empty grid; code: WedgeTable.tsx wraps tbody in <Stagger> whose children carry revealVariants (opacity:0 initial), and lib/motion.ts REVEAL_VIEWPORT={once:true,margin:'-50px'}.

**Recommendation:** Do not gate load-bearing content on scroll visibility. Either (a) render all of this content visible by default and treat motion as a progressive enhancement that only animates when JS+observer are present (e.g. start at opacity:1 and let framer override to animate-in), or (b) for tables/diagrams, drop the per-row reveal entirely and animate only a container fade. At minimum, ensure the no-JS / pre-hydration HTML contains the fully visible table rows, diagram nodes, and panel rows. Add a Playwright/visual test that asserts the WedgeTable body and DataFlowDiagram nodes are present without scrolling.

**Expected impact:** Eliminates the single largest conversion and trust risk on the entire cluster; makes /comparisons and /architecture/data-flow actually communicate their value on first paint and to crawlers.

---

## Finding #4 — Scroll-reveal animation hides 3 of 4 capability families — the index looks broken

**Severity:** Critical  ·  **Area:** Capabilities + Recipes  ·  **Effort:** S  ·  **Confidence:** 92%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** On /capabilities, only the first family ('Content & data safety') renders its 3 cards. The headers 'Adversarial & behavioral', 'Budget & integrity', and 'Workflow & governance' appear with completely empty content areas — large blank bands where 3+5+3 = 11 of the 14 capability cards should be. The page literally reads 'four families' but shows one populated family. Same on mobile (capabilities.png mobile: families 2-4 are empty headers).

**Why it matters:** This is the catalogue that proves product depth to AI-platform/regulated buyers. A page that promises 14 capabilities but shows 3, with three empty section headers, reads as a broken/unfinished build and destroys the trust the rest of the site works hard to earn. It also means crawlers, link-preview bots, and any reduced-JS client see an empty catalogue — direct SEO and shareability damage for an OSS-discovery-dependent product.

**Evidence:** capabilities/page.tsx wraps each family's grid in <Stagger> (Stagger.tsx) which sets initial='hidden' + whileInView='visible' with REVEAL_VIEWPORT={once:true, margin:'-50px'} (lib/motion.ts). revealVariants.hidden = {opacity:0, y:12}. Cards below the first viewport are opacity:0 until scrolled into view; the screenshot (and any above-the-fold/crawler render) captures them invisible. content/capabilities.ts confirms 14 caps: content-safety 3, adversarial 3, budget-integrity 3, workflow 5.

**Recommendation:** Stop gating content visibility on scroll. Either (a) drop the opacity:0 initial state for these index grids and animate only a subtle y-rise/once, or (b) use a CSS-only IntersectionObserver reveal that keeps content visible when JS hasn't run, or (c) only apply Stagger to the first viewport and render later families statically. The reveal must never leave real content at opacity:0 when un-scrolled. Add a Playwright/visual test asserting all 14 cards have non-zero opacity on load.

**Expected impact:** Restores the entire catalogue (14 cards across 4 families) to immediate visibility; removes the single most damaging 'looks broken' impression and recovers SEO/crawler/link-preview rendering of the catalogue.

---

## Finding #5 — Recipe deep-dives hide their entire payload (install, code, live outcome) below an unrevealed fold on mobile

**Severity:** Critical  ·  **Area:** Capabilities + Recipes  ·  **Effort:** S  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/mobile/recipes_over-refund-clamp.png`

**Problem:** The mobile over-refund-clamp recipe shows only the header and a duplicated 'The problem' paragraph, then ~3000px of pure white space. The entire reason to visit the page — 'The guard' (INSTALL command + the real TypeScript guard CodeBlock), 'The outcome' (live kernel ReceiptCard), 'Try it', and 'Related' — is completely missing from the captured render.

**Why it matters:** Recipes are the SEO landing pages ('how to stop an AI agent from over-refunding') and the DX proof. A visitor (or Google) who lands and sees only a problem restatement followed by a blank page gets zero of the value and bounces. The code snippet IS the product on a recipe page; rendering it invisible defeats the surface's whole purpose.

**Evidence:** RecipeLayout.tsx wraps every block ('The guard', 'The outcome', 'Try it') in <Reveal> (Reveal.tsx) using whileInView + REVEAL_VIEWPORT (once:true). On the narrow mobile viewport everything past 'The problem' is below the fold and stays at opacity:0. recipes_over-refund-clamp__fold.png (desktop) confirms the same pattern: below the fold the install card is only just appearing. Desktop full page renders because the taller viewport puts more in view, but mobile is catastrophic.

**Recommendation:** Same fix as the capabilities reveal: never initialize real content to opacity:0 in a way that survives without scroll. For deep-dive bodies, drop the hidden-opacity gate (keep at most a one-time y-rise that starts visible) so the install command, code, and outcome are present on first paint regardless of scroll/JS. Verify on a 390px viewport that the CodeBlock is visible without scrolling past the fold.

**Expected impact:** Recovers the core DX content on every recipe deep-dive on mobile (and any crawler), turning a blank-looking SEO page into a complete, code-first answer.

---

## Finding #6 — Core data visualizations render as empty boxes — reveal animation gates the chart, once:true makes it permanent

**Severity:** Critical  ·  **Area:** Console replicas  ·  **Effort:** M  ·  **Confidence:** 83%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_drift.png`

**Problem:** The 'Timeline · decision.kind TVD over time' panel on Drift is a large empty bordered box. The same blank-chart pattern appears across the showcase: console_red-team.png (TREND · DEFENDED VS ESCAPED chart is empty above the dot axis), console_tokens.png (BUDGET-EXHAUSTION TIMELINE empty, SESSION BUDGETS table empty, BURN bars mostly empty), console_approvals.png (AUDIT CHAIN empty box), console_integrity.png (KILL-SWITCH ACTIVATION TIMELINE area below the stat cards empty), console_command-risk.png (BLOCKED COMMANDS list area empty). Root cause is in code: charts/tables are wrapped in ChartReveal (apps/web/src/components/console-tour/ChartReveal.tsx), which sets initial='hidden' (opacity 0 + rise) and only reveals whileInView with REVEAL_VIEWPORT = { once: true, margin: '-50px' } (apps/web/src/lib/motion.ts). The token burn bars use whileInView={{scaleX:1}} (TokenGovernanceReplica.tsx:427) so they start at scaleX 0 = invisible. Because the dashboard chart sits higher and DID render (console_dashboard.png), this is confirmed as a reveal-timing issue, not a data issue.

**Why it matters:** These charts ARE the product demo. A blank box reads as a broken page or a failed load on the single surface meant to prove the product works. With once:true, if the IntersectionObserver fails to fire even once (fast scroll, deep-link + jump, reduced-perf devices, prerender snapshot, certain screenshot/embed contexts) the chart never appears — there is no recovery. For a 'guardrails / determinism / audit' product, shipping demo panels that look broken is maximally off-message.

**Evidence:** console_drift.png shows a ~180px empty box under 'TIMELINE · DECISION.KIND TVD OVER TIME'. console_tokens.png shows empty SESSION BUDGETS rows, empty BURN bars, and an empty BUDGET-EXHAUSTION TIMELINE box. console_approvals.png shows an empty AUDIT CHAIN box. console_red-team.png shows an empty trend region above the axis dots. ChartReveal.tsx uses initial='hidden' + whileInView; motion.ts: REVEAL_VIEWPORT = { once: true, margin: '-50px' }.

**Recommendation:** Do not gate data-bearing content on scroll reveal. Either (a) render charts/tables visible by default and animate only an accent (never opacity:0/scaleX:0 as the resting state), or (b) keep the reveal but guarantee a visible fallback: set initial to the visible state on SSR and let motion enhance, and drop once:true for content panels so a missed trigger self-heals. At minimum, treat prefers-reduced-motion's already-visible branch as the default for all chart containers.

**Expected impact:** Removes the single biggest credibility risk on the showcase; every replica reliably shows live-looking data instead of empty frames, restoring the 'alive, not a dead screenshot' goal across all 10 pages.

---

## Finding #7 — Roadmap & Contribute render blank below the first viewport — scroll-reveal animation never fires in capture

**Severity:** Critical  ·  **Area:** Content + community + global chrome  ·  **Effort:** M  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/roadmap.png`

**Problem:** In desktop/roadmap.png the page shows the hero, the two badges, and the 'v1 — shipped & frozen' heading + one paragraph, then ~3,500px of pure empty canvas to the footer. Every content block below — the 4 frozen-invariant cards, the 'disciplined additive evolution' section, all 9 'Recently shipped' cards, the 'What's next' numbered timeline, both Callouts, and the four doc links — is completely invisible. The identical failure appears in tablet/roadmap.png and mobile/roadmap.png, and in desktop/contribute.png / mobile/contribute.png (only 'The layered architecture' heading + intro show; the L1–L5 cards, setup/workflow code blocks, placement grid, and PR cards are all blank). Code confirms the cause: roadmap/page.tsx and contribute/page.tsx wrap essentially all body content in <Reveal> and <Stagger>, which set framer-motion initial='hidden' (opacity:0, y:12) and only animate to visible via whileInView with viewport={ once:true, margin:'-50px' } (lib/motion.ts, components/home/Reveal.tsx, components/motion/Stagger.tsx). When the IntersectionObserver does not fire as expected, the content stays at opacity:0. The blog index does NOT exhibit this (its cards sit high enough to be in-view at load), which proves it is a real reveal-trigger problem, not a uniform capture quirk.

**Why it matters:** These are the two highest-effort, highest-quality content pages on the site (the roadmap copy is genuinely best-in-class), yet a visitor — especially one deep-linking to /roadmap or /contribute from the footer, or on a tall monitor — can land on what looks like a broken, empty page. For an OSS project whose entire pitch is 'deterministic, trustworthy, production-grade', shipping pages that render blank is a direct credibility hit. This is the single biggest issue in this area.

**Evidence:** desktop/roadmap.png: heading 'v1 — shipped & frozen' + one paragraph visible at ~y=350, then empty canvas bands to the footer at the very bottom. tablet/roadmap.png and mobile/roadmap.png show the same truncation. desktop/contribute.png: only 'The layered architecture' + intro render; the rest is blank. Code: every <Reveal>/<Stagger> in roadmap/page.tsx (lines 214–472) and contribute/page.tsx (lines 167–409) relies on whileInView; revealVariants.hidden = { opacity: 0, y: 12 } in lib/motion.ts line 25.

**Recommendation:** Stop gating primary content visibility on scroll. Options, best first: (1) Render content visible by default and treat the reveal as progressive enhancement — e.g. animate from opacity:0 only when JS+IntersectionObserver confirm in-view, but never leave it stuck invisible; add a fallback that forces opacity:1 after a short timeout or on observer-unsupported. (2) Widen the trigger (e.g. viewport margin so blocks just below the fold reveal immediately) and add amount:'some'. (3) For these dense informational pages, drop whileInView entirely and use a one-shot on-mount animate, or no animation. Verify with a full-page screenshot in CI so a blank-page regression is caught.

**Expected impact:** Restores 100% of roadmap/contribute content for all visitors and capture tools; removes a 'broken page' impression on two flagship trust pages.

---

## Finding #8 — Mobile home renders almost entirely blank below the hero — same reveal-trigger failure on the flagship page

**Severity:** Critical  ·  **Area:** Content + community + global chrome  ·  **Effort:** M  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** mobile/home.png is a ~7,100px-tall capture that shows the announcement banner, nav, and the hero (headline, subhead, 4-step strip, 'Try the 5-min demo' CTA, install snippet, and the top of a blank product frame) in the first ~600px, then is essentially pure white for the remaining ~6,500px down to a faint footer line at the very bottom. Like roadmap/contribute, the entire body of the homepage below the hero appears unrendered in capture — consistent with the same whileInView reveal pattern (the home page uses <Reveal> wrappers per Reveal.tsx's documented usage on 'the four homepage Step sections').

**Why it matters:** This is the single most important page on the site, on the most common device class. If the homepage body is blank on mobile in a real session (deep-link, slow IO observer, or any environment the capture reproduces), a first-time visitor on a phone sees a hero and then nothing — catastrophic for conversion. Even if some real browsers reveal-on-scroll correctly, the fact that the capture reproduces a fully blank body means the failure mode is reachable and must be made impossible.

**Evidence:** mobile/home.png: hero content in the top band, then a continuous white field for the vast majority of the 7,110px page height; only a faint footer hairline near the bottom. This mirrors the roadmap/contribute blank-region behavior and the shared whileInView mechanism in Reveal.tsx / Stagger.tsx / lib/motion.ts.

**Recommendation:** Same fix as the roadmap/contribute finding, applied site-wide: never leave content stuck at opacity:0 if the reveal does not trigger. Make visibility the default and animation the enhancement (force visible on no-JS, on reduced-motion — already handled — and via a fallback timeout/observer-unsupported guard). Add a mobile full-page screenshot to CI as a regression gate.

**Expected impact:** Guarantees the homepage body is visible on mobile for every visitor and capture path; protects the primary conversion surface.

---

## Finding #9 — Entire homepage below the hero renders blank in static capture (opacity:0 Reveal wrappers)

**Severity:** Critical  ·  **Area:** Home + conversion  ·  **Effort:** M  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/desktop/home.png`

**Problem:** The desktop home.png is 13,240px tall but only the hero (~top 1,300px) plus a faint hero-video frame render; everything from MagicMoment through FinalCTA is solid white. Cropped slices confirm it: /tmp/home_slice2.png (offset 2800-4700px) is 100% blank. Mobile home.png (19,888px) shows the same — only the hero paints. Cause is structural, not a capture glitch: in app/page.tsx every section (MagicMoment, StepActs, OutcomesBento, StepReceipt, StepConsole, RecipesTeaser, WhoItsFor, Positioning, SocialProof, PlaygroundEntry, GetStarted, FAQ, DepthLinks, FinalCTA) is wrapped in <Reveal>, which in components/home/Reveal.tsx sets initial="hidden" with revealVariants.hidden = {opacity:0, y:12} (lib/motion.ts) and only animates to visible whileInView. Stagger-based strips (HeroOutcomeStrip) behave the same. Any environment where scroll/IntersectionObserver doesn't fire — OG/social-card screenshotters, some crawlers, print, reader modes, JS-throttled mobile — sees an empty body.

**Why it matters:** The homepage is the single highest-value conversion surface. If it can render as a blank page outside a normal scrolling browser, link previews, search snapshots, and any non-standard client show nothing — a catastrophic first impression and an SEO/shareability liability for a pre-auth OSS launch that depends on organic discovery.

**Evidence:** home.png is 13,240px with only the hero painted; /tmp/home_slice2.png fully blank; Reveal.tsx initial='hidden' + revealVariants.hidden={opacity:0,y:12}; page.tsx wraps all 14 sections in <Reveal>.

**Recommendation:** Do not gate content visibility on scroll. Make Reveal animate only transform/opacity FROM a visible baseline that is the steady state, or render content at full opacity and animate a decorative layer instead. Simplest robust fix: in revealVariants set hidden.opacity to a non-zero floor for SSR / use framer-motion's `whileInView` with `initial={false}` for above-trigger sections, or add a no-JS/`@media (scripting: none)` and reduced-data CSS fallback that forces opacity:1. At minimum, never let a section's only painted state depend on an IntersectionObserver callback.

**Expected impact:** Guarantees the homepage body is visible to crawlers, social cards, print, and throttled clients; removes a class of silent blank-page failures.

---

## Finding #10 — Scroll-reveal animations leave most of every page blank on mobile capture (and for any user whose reveal never triggers)

**Severity:** Critical  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** The mobile home screenshot is 19888px tall but only the hero (~the top 10%) is painted; everything from MagicMoment down to the footer is blank white. The same pattern produces large empty regions on comparisons.png (the wedge table is a 'CAPABILITY' header over empty rows), architecture_data-flow.png (empty bands under 'THE PIPELINE' and 'THE TRUST BOUNDARY'), and transparency.png (huge blanks under 'Risk & compliance' and 'Operations'). Root cause in code: apps/web/src/app/page.tsx wraps every section in <Reveal>, and WedgeTable.tsx / DataFlowDiagram.tsx / RevealGrid.tsx use framer-motion initial='hidden' (opacity 0) with whileInView. Off-screen content stays at opacity 0 in a static full-page capture, and any real user on a device where the in-view observer mis-fires sees the same emptiness.

**Why it matters:** This is the homepage and every key marketing page. A prospect who lands and sees a hero over an ocean of white space concludes the site is broken and leaves. It nukes value communication, trust, and the entire scroll-to-CTA funnel — the single highest-impact issue on the site.

**Evidence:** page.tsx wraps Hero's siblings in <Reveal>; Reveal.tsx and Stagger.tsx set initial='hidden'/opacity 0 with whileInView + REVEAL_VIEWPORT once:true; home.png shows ~18000px of blank below a painted hero; comparisons.png shows the wedge table header with no rows; transparency.png shows two empty widget bands.

**Recommendation:** Do not gate first-meaningful content on scroll-reveal. Either (a) render content fully visible by default and animate only as an enhancement (e.g. CSS @starting-style / IntersectionObserver that adds a class, with the un-revealed state still visible), or (b) treat reveal as opacity 1 -> subtle rise only, never 0 -> 1, so content is always painted. At minimum, sections at/near the top of each route should not start at opacity 0. Verify with JS disabled and with a long-page screenshot that all content paints.

**Expected impact:** Restores visibility of ~90% of every marketing page on mobile; directly recovers the scroll funnel and trust.

---

## Finding #11 — All below-the-fold content is invisible until client JS fires (no SSR/no-JS fallback) — verified root cause of every blank screenshot

**Severity:** Critical  ·  **Area:** Nielsen heuristics + competitive benchmark  ·  **Effort:** S  ·  **Confidence:** 95%

**Screenshot:** `audit-artifacts/screenshots/desktop/home.png`

**Problem:** The home page screenshot is a ~13,000px-tall canvas where only the hero (top ~14%) is painted; everything below — MagicMoment, the four spine steps, OutcomesBento, RecipesTeaser, Positioning, SocialProof, FAQ, FinalCTA — is blank. The identical failure appears on tablet (home.png, 14,842px) and mobile (home.png, 19,888px), and on the comparisons page the vs-OPA/Cedar table renders its header row but ZERO data rows (comparisons.png). Source confirms the cause: apps/web/src/app/page.tsx wraps every section in <Reveal>, which (apps/web/src/components/home/Reveal.tsx + apps/web/src/lib/motion.ts) sets initial='hidden' = {opacity:0,y:12} and only animates to visible via framer-motion whileInView (IntersectionObserver). WedgeTable.tsx uses the same whileInView Stagger for table rows. A grep for 'noscript' across apps/web/src returns nothing — there is no static fallback. The server-rendered HTML therefore ships the real content at opacity:0; it becomes visible ONLY after client JS hydrates and the observer fires on scroll.

**Why it matters:** This is a marketing site whose entire job is to convert AI-platform teams who have never heard of the product. If JS is slow, blocked, or errors during hydration, the visitor sees a blank page below a single hero. SEO/AI crawlers and social-card/link-preview bots that don't execute scroll-driven IntersectionObservers index/preview an empty page — catastrophic for an OSS launch that lives on shared links and search. It also hurts perceived performance: content that exists in the DOM is needlessly withheld.

**Evidence:** home.png / tablet+mobile home.png show only the hero painted over thousands of px of whitespace; comparisons.png shows an empty table body; page.tsx wraps 14 sections in <Reveal>; Reveal.tsx uses initial='hidden' + whileInView with no fallback; grep 'noscript' = 0 matches.

**Recommendation:** Decouple content visibility from motion. Render all section content at full opacity in SSR/initial HTML and let Reveal apply ONLY the transform/transition as an enhancement (e.g. animate from y:12→0 with opacity already 1, or gate the opacity:0 behind a 'js-loaded' class so no-JS keeps it visible). At minimum, never let opacity:0 be the initial server state for primary content. Verify by disabling JS and by capturing a static (non-scrolled) render — the full page must be readable.

**Expected impact:** Restores content visibility for crawlers, slow/blocked JS, and previews; eliminates the empty-page risk that currently undermines every shared link and the core conversion narrative.

---

## Finding #12 — Shipped SkipLink is never rendered and no main landmark is focusable

**Severity:** High  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 95%

**Screenshot:** `audit-artifacts/screenshots/desktop/home.png`

**Problem:** apps/web/src/components/console-kit/a11y/SkipLink.tsx exists and is exported from the a11y index, but grep shows it is never imported/rendered anywhere outside its own file — the marketing site has NO skip link. apps/web/src/app/layout.tsx renders AnnouncementBanner + NavBar + content with no skip link as the first focusable element. Additionally every page's <main> (page.tsx:42, transparency/*, capabilities, playground, etc.) is a bare <main> with no id='main-content' and no tabIndex={-1} — so even if the SkipLink were added, its default href #main-content target does not exist and is not focusable.

**Why it matters:** Keyboard users must tab through the dismissible banner, the full primary nav, and both header CTAs on every single page before reaching content — exactly the bypass the team built SkipLink to solve. This is a WCAG 2.4.1 Bypass Blocks failure, made worse because the fix is already written and just not wired up.

**Evidence:** grep 'SkipLink' returns only the component file and the index export — no render site. grep '<main' returns ~35 bare <main> tags with no id/tabIndex (e.g. page.tsx:42 '<main>'). SkipLink.tsx line 28 defaults targetId='main-content' and its doc-comment (lines 5-7) explicitly requires '<main id="main-content" tabIndex={-1}>', which no page provides. Note also SkipLink styles use console.* DARK tokens (focus:bg-console-panel zinc-900, focus:text-console-ink) — when revealed on the light marketing header that yields a dark pill, acceptable but it was clearly designed for the dark console, not this surface.

**Recommendation:** Render <SkipLink targetId='main-content'> as the first child of <body> in layout.tsx, and make the shared layout/main wrapper carry id='main-content' tabIndex={-1} (or add a single shared <Main> component). Verify the revealed link's contrast on the light header, or give the marketing SkipLink light-surface token classes.

**Expected impact:** Adds a working Bypass Blocks mechanism site-wide for keyboard users, using code that already exists — high value for low effort.

---

## Finding #13 — Mobile sheet is not a real dialog — no focus trap, Escape, or focus restoration

**Severity:** High  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** apps/web/src/components/ui/NavBar.tsx MobileSheet renders a full-screen fixed overlay (fixed inset-0 z-50) that locks body scroll, but it has no role='dialog', no aria-modal='true', no focus trap, no Escape-to-close handler, and does not move focus into the sheet on open or restore focus to the menu trigger on close. The desktop dropdown DOES handle Escape (line 211) but the mobile sheet does not.

**Why it matters:** On open, keyboard/screen-reader focus stays behind the overlay, so users can tab into the visually-hidden page underneath the menu; there is no Escape to dismiss; and on close focus is lost. This violates WCAG 2.1.2 (No Keyboard Trap inverse — focus escapes the modal), 2.4.3 Focus Order, and the dialog pattern. The X close button (line 329) also lacks a focus-visible ring (same gap as finding 1).

**Evidence:** NavBar.tsx MobileSheet (lines 299-366): the motion.div has no role/aria-modal; no onKeyDown for Escape; no useEffect to focus the close button on open or return focus to the trigger on unmount. Body scroll IS locked (lines 59-66) which makes the trapless overlay more confusing because the page can't even scroll while focus sits behind it.

**Recommendation:** Give the sheet role='dialog' aria-modal='true' aria-label='Menu', add an Escape key handler (reuse the desktop pattern), focus the first focusable element (or close button) on open, restore focus to the trigger on close, and trap Tab within the sheet (or use a small focus-trap util). Add the shared focus-visible ring to the close button.

**Expected impact:** Makes the primary mobile navigation operable and predictable for keyboard and screen-reader users, closing focus-order and dialog-semantics gaps.

---

## Finding #14 — Dead '#playground' anchor: six broken CTAs on /comparisons

**Severity:** High  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** S  ·  **Confidence:** 95%

**Screenshot:** `audit-artifacts/screenshots/desktop/comparisons.png`

**Problem:** DecisionsGrid renders on /comparisons and each of its six decision cards ends with a CTA href='#playground' (DecisionsGrid.tsx line 63). But id='playground' only exists in sections/Playground.tsx, which is mounted on the homepage — there is no #playground element on /comparisons. So all six 'Try it in the playground →' links are dead in-page anchors: clicking them does nothing (or jumps to top) instead of taking the user to the playground.

**Why it matters:** The decision grid is the emotional payoff of /comparisons, and its only forward CTA is broken. A visitor convinced by the six-outcome algebra clicks 'Try it' and nothing happens — that is the worst possible moment to lose them, and on a polished site a dead primary CTA reads as careless.

**Evidence:** grep shows id="playground" only in sections/Playground.tsx:67 (homepage), while href="#playground" appears in DecisionsGrid.tsx:63 which is mounted by /comparisons/page.tsx. /comparisons has no Playground section.

**Recommendation:** Point the CTA at the real playground destination from a depth page — e.g. href='/#playground' or a dedicated /playground route — rather than a same-page anchor. Better: make the link target configurable per mount (homepage uses '#playground', /comparisons uses '/#playground') so the grid is reusable without dead anchors.

**Expected impact:** Restores the only conversion path off the comparisons decision grid; removes a glaring broken-link defect.

---

## Finding #15 — Mobile data-flow diagram is a long, gap-ridden vertical stack and the trust-boundary panel is blank

**Severity:** High  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** M  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/mobile/architecture_data-flow.png`

**Problem:** On mobile the pipeline collapses to a single vertical column (DataFlowDiagram.tsx lg:grid-cols layouts stack below lg). The screenshot shows the node chips compressed near the top, then an enormous empty region where the rest of the pipeline and the entire 'The trust boundary' panel should be — the TrustBoundaryPanel grid is completely blank on mobile (same opacity:0 reveal issue, made worse because the panel sits far down a very tall page). The result is screens of whitespace between sparse content.

**Why it matters:** Architecture/data-flow is the page where a skeptical engineer evaluates whether the mechanism is real. On a phone they get a fragmented stack and a blank comparison table — the diagram's left-to-right 'flow from intent to receipt' narrative (the whole point) is lost vertically, and the trust-boundary proof is missing entirely.

**Evidence:** mobile/architecture_data-flow.png: the three pipeline chips appear at top, followed by a large blank band, then 'THE TRUST BOUNDARY' heading over empty space, then the 'The boundary is the proof' callout floating with nothing above it. DataFlowDiagram.tsx uses lg:grid-cols-[...] so everything stacks 1-col under lg with FlowEdge arrows rotating to ↓.

**Recommendation:** Design the mobile diagram deliberately rather than letting it free-stack: tighten vertical gaps, keep each stage visually grouped (numbered stage cards), and ensure the TrustBoundaryPanel mobile per-attribute layout renders visible by default (fix the reveal gating from finding 1). Consider a condensed mobile pipeline (intent → kernel → record → store/bus → console) as a compact 5-step list rather than full node cards.

**Expected impact:** Makes the flagship architecture page legible and complete on the device a large share of first-touch developer traffic uses.

---

## Finding #16 — Verbatim duplication: the header subtitle and the first body section repeat the identical paragraph

**Severity:** High  ·  **Area:** Capabilities + Recipes  ·  **Effort:** S  ·  **Confidence:** 95%

**Screenshot:** `audit-artifacts/screenshots/desktop/recipes_over-refund-clamp__fold.png`

**Problem:** On every recipe deep-dive the DepthHeader subtitle prints the problem prose, then the very next 'The problem' section prints the exact same sentence word-for-word. On over-refund-clamp the reader sees 'A support agent (or an LLM acting as one) requests a refund larger than the original charge...' twice within one screen. Capability pages do the same: the oneLiner is the subtitle, then reappears as the de-facto lede.

**Why it matters:** Immediate, obvious redundancy makes a polished page feel auto-generated and lowers perceived quality versus Stripe/Linear-grade docs. It also wastes the most valuable vertical real estate (the area right under the H1) on a sentence the reader just read, delaying the actual code.

**Evidence:** RecipeLayout.tsx: <DepthHeader ... subtitle={recipe.problem} /> (line ~43) and then Block id='problem' renders <p>{recipe.problem}</p> (lines ~60-63) — the same field. Visible in recipes_over-refund-clamp__fold.png: subtitle paragraph at ~280px and the identical 'The problem' paragraph at ~640px.

**Recommendation:** Pick one home for the problem statement. Either (a) drop the 'The problem' section and let the subtitle carry it, replacing that section with something additive (e.g. a 'What can go wrong' / attack-vector list), or (b) make the subtitle a shorter one-line hook distinct from the fuller 'The problem' prose. Same change for capability pages (oneLiner vs whatItDoes should not echo).

**Expected impact:** Removes a glaring quality tell and reclaims above-the-fold space to surface the code/outcome sooner.

---

## Finding #17 — Two parallel maturity vocabularies (Tier 1/Tier 2 vs Live/Illustrative) confuse rather than clarify

**Severity:** High  ·  **Area:** Capabilities + Recipes  ·  **Effort:** M  ·  **Confidence:** 82%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities_hallucination-scoring.png`

**Problem:** The capabilities index labels cards 'Tier 1' / 'Tier 2'. The deep-dive header then relabels the same thing as 'Illustrative · Tier 2' or 'Shipped · Tier 1'. Recipes use a THIRD axis: 'Live · real kernel' vs 'Illustrative'. A reader must reconcile three badge systems that all encode roughly the same 'is this real?' question, and the index gives no legend explaining what Tier 1 vs Tier 2 means until you read the dense subtitle.

**Why it matters:** For a regulated/governance audience, 'is this shipped and real, or illustrative?' is the single most important trust question. Splitting it across Tier-1/2, Shipped/Illustrative, and Live/real-kernel forces cognitive translation and risks the impression that 'Tier 2' capabilities are vaporware, when the page actually means 'real package, fixture-illustrated example'.

**Evidence:** capabilities/page.tsx renders Badge 'Tier 1'/'Tier 2' on cards. CapabilityPageLayout.tsx builds maturityBadge = realKernel ? 'Shipped · Tier '+tier : 'Illustrative · Tier '+tier. recipes/page.tsx + RecipeLayout.tsx render 'Live · real kernel' / 'Illustrative'. content shows tier:1 x7, tier:2 x8 — so half the catalogue wears the ambiguous 'Tier 2'. The index subtitle is the only explanation and it's buried prose.

**Recommendation:** Collapse to ONE consistent maturity axis across both surfaces. Drop the 'Tier' numbering on cards in favor of the plain, self-explaining pair the deep-dives already use: 'Live · real kernel' vs 'Illustrative example'. If Tier is meaningful internally, express it as a tooltip or a small legend at the top of the index, not as the primary card badge. Use identical wording on capabilities and recipes.

**Expected impact:** Replaces three overlapping vocabularies with one trust signal buyers can read at a glance; removes the 'Tier 2 = unfinished?' misread.

---

## Finding #18 — Flagship audit table is clipped on mobile with no scroll affordance

**Severity:** High  ·  **Area:** Console replicas  ·  **Effort:** M  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/mobile/console_audit-explorer.png`

**Problem:** On mobile the AUDIT EXPLORER table's HASH column is cut mid-value at the right viewport edge (e.g. 'ad90… 8953' wraps/clips) and the TIME column is entirely off-screen. The table uses overflow-auto (DataTable.tsx line ~63) so it technically scrolls horizontally, but there is zero affordance — no fade edge, no shadow, no scrollbar, no caption hint — so a phone user cannot tell the row continues or that TIME exists at all.

**Why it matters:** Audit Explorer is the 'flagship /console surface' (its own code comment). On mobile it presents as a table with two visible-and-a-half columns and a hard cut, which reads as a layout bug rather than a deliberate scroll. The TIME column — central to a 'real-time tail' story — is invisible.

**Evidence:** mobile/console_audit-explorer.png: the HASH values ('ad90…','4145…','dfc1…') sit flush against and bleed past the right edge; no TIME column is visible; no horizontal scrollbar or gradient edge is shown. DataTable.tsx wraps the table in 'overflow-auto …' with no edge cue.

**Recommendation:** On <sm, either prioritize columns (Decision + Intent + Time, hash collapsed into a tap-to-expand) or add an explicit horizontal-scroll affordance: a right-edge fade-mask + a persistent thin scrollbar + an sr-and-visible 'scroll →' hint on first paint. Best-in-class (Stripe/Linear) collapse dense tables into stacked cards at this width.

**Expected impact:** Mobile visitors can read the full receipt (including TIME and HASH) and understand the table is intentionally scrollable, eliminating a 'broken table' perception on the headline surface.

---

## Finding #19 — AI-BOM mobile drops the entire detail pane — the page becomes a 2-item list

**Severity:** High  ·  **Area:** Console replicas  ·  **Effort:** M  ·  **Confidence:** 82%

**Screenshot:** `audit-artifacts/screenshots/mobile/console_ai-bom.png`

**Problem:** The AI-BOM explorer's whole value is the right-hand detail panel (model, conformance, tools, prompt hashes, guardrails — visible richly on desktop console_ai-bom.png). On mobile only the left pack list survives: two cards ('pack-payments-pix', 'pack-identity-kyc') and then a vast expanse of empty dark canvas down the rest of the screen. The detail pane is not rendered or is collapsed with no entry point, so the page communicates almost nothing.

**Why it matters:** A mobile visitor evaluating 'what is actually running / provenance you can attest' sees an empty governance screen. It looks unfinished and wastes the most differentiated replica on the smallest-but-common screen.

**Evidence:** mobile/console_ai-bom.png shows the master list with two pack cards, then roughly two full screens of empty black below the chrome frame; none of the desktop detail sections (Model, Conformance, Tools, Prompt hashes, Guardrails) appear. Desktop console_ai-bom.png shows that detail occupying ~70% of the surface.

**Recommendation:** On mobile, make pack rows tap-to-expand into the detail sections inline (accordion), or stack the detail pane below the selected pack with the first pack selected by default. Never leave the detail content unreachable; fill the empty canvas with the actual BOM data.

**Expected impact:** Restores the AI-BOM's substance on mobile, turning a near-empty screen into the provenance showcase it is on desktop.

---

## Finding #20 — Blog and Roadmap/Contribute are footer-only — they never appear in the primary header nav

**Severity:** High  ·  **Area:** Content + community + global chrome  ·  **Effort:** S  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The header nav (content/nav.ts PRIMARY_NAV, visible in home__fold.png and on every page) is: How it works · Capabilities · Recipes · Console · Playground · Architecture(▾) · Docs. Blog, Roadmap, and Contribute exist only in the SiteFooter 'Project' column (nav.ts FOOTER_COLUMNS, lines 128–137). So a reader on the blog index (desktop/blog.png) or a roadmap page has no header affordance back to /blog, /roadmap, or /contribute, and a top-of-page visitor never discovers them without scrolling to the footer. There is also no nav active-state for these routes (isActive in NavBar.tsx only matches PRIMARY_NAV entries), so the header gives zero wayfinding cue that you're inside the blog/roadmap.

**Why it matters:** For an OSS marketing site, the blog (thought leadership), roadmap (trust/transparency), and contribute (community growth) are core conversion and credibility surfaces — burying them in a footer column tanks their discoverability and makes the site feel like the long-form content was bolted on. Linear/Vercel/Clerk all surface Blog/Changelog/Docs prominently. The lack of any active state while inside these sections is a wayfinding regression versus the rest of the site.

**Evidence:** home__fold.png header shows 7 items, none of which is Blog/Roadmap/Contribute. desktop/blog.png and desktop/roadmap.png show the same 7-item header with no active highlight. nav.ts: PRIMARY_NAV (lines 38–81) omits these routes; they live only in FOOTER_COLUMNS 'Project' (lines 128–137).

**Recommendation:** Add Blog (and ideally Roadmap) to the header — either as flat links or folded into a 'Resources'/'Community' dropdown alongside Docs. Extend isActive/isGroupActive matching so the relevant header item shows the active text-ink treatment when on /blog, /roadmap, /contribute. At minimum, give the blog/roadmap/contribute pages a small in-page section nav or breadcrumb so the header isn't the only wayfinding.

**Expected impact:** Makes three high-value pages discoverable from any viewport position and restores section wayfinding; likely meaningful lift in blog/roadmap pageviews.

---

## Finding #21 — Two sources of truth for the load-bearing six-outcome palette, with diverging labels and order

**Severity:** High  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** The six decision outcomes - the product's entire differentiator - are defined twice with no shared source. content/decisions.ts uses single semantic shades (text-execute) and Title-case labels ('Execute', 'Request confirmation') in order EXECUTE,REFUSE,REWRITE,DEFER,ESCALATE,REQUEST_CONFIRMATION. console-kit/decision-theme.ts independently re-defines the same six with raw default-tailwind classes (text-emerald-300), UPPERCASE labels with a different abbreviation ('CONFIRM?' vs 'Request confirmation'), a 'summary' collapse (Allow/Block/Hold/Modify), and a DIFFERENT order array (EXECUTE,REFUSE,DEFER,ESCALATE,REQUEST_CONFIRMATION,REWRITE). Comments cite ADR-128 'copy, don't share' as justification, but the result is two drifting token maps for the same concept.

**Why it matters:** When the marketing chip says 'Request confirmation' (sky) and a console-replica surface says 'CONFIRM?' the same user sees two names for one outcome on one site, eroding the credibility of a product whose core claim is a precise six-valued algebra. Any future palette tweak must be made in two files or the surfaces silently diverge.

**Evidence:** content/decisions.ts lines 23-110 (Title-case headlines, accent text-execute, order with REWRITE 3rd) vs console-kit/decision-theme.ts lines 25-84 (UPPERCASE label 'CONFIRM?', fg text-emerald-300, DECISION_KIND_ORDER with REWRITE last). capabilities.png shows EXECUTE/REWRITE/REFUSE/ESCALATE chips; the console replica surfaces render the dark variant.

**Recommendation:** Make packages/core (or one shared content module) the single source for {kind, label, order}, and derive both palettes from one token map via a light/dark variant function rather than two hand-maintained records. At minimum, unify the label casing and the order array so 'Request confirmation' and 'CONFIRM?' cannot coexist. If ADR-128 truly forbids a shared package, add a build-time test asserting the two records have identical kinds, labels, and order.

**Expected impact:** One canonical outcome vocabulary across every surface; eliminates a whole class of drift bugs and makes the 'precise six-outcome algebra' claim self-consistent.

---

## Finding #22 — Core Button and Card have no focus-visible styling - keyboard users get no visible focus on primary CTAs

**Severity:** High  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 92%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The canonical Button component (every 'Try the 5-min demo' / 'GitHub' / 'Open console' CTA on the site, home__fold.png) defines only base + variant + hover classes - there is no focus-visible:ring or outline. Same for Card (the entire capabilities/recipes grid is clickable cards) and the NavBar links and DepthHeader back-link. A repo-wide scan finds only ~12 focus-visible:ring-2 usages total, and the highest-traffic interactive primitives are not among them.

**Why it matters:** Keyboard and switch-device users literally cannot see where focus is when tabbing the primary conversion path. This is a WCAG 2.4.7 (Focus Visible) failure on the most important buttons on the site and is the single biggest reason the a11y score is a 4, not a 7.

**Evidence:** Button.tsx STYLES (lines 16-23) and base classes (lines 33-37): no focus token. Card.tsx classes (lines 21-25): no focus token. NavBar.tsx link className (lines 144-147) and DropdownItem (264-267): hover only. grep across components/ui+home+sections shows 12x focus-visible:ring-2 and 0 in Button/Card.

**Recommendation:** Add a shared focus token to the primitives: e.g. 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas' on Button, Card, and all NavBar/DepthHeader links. Define it once (a cn helper or @layer components class) so it can't drift.

**Expected impact:** Brings the primary navigation and CTA flow into WCAG 2.4.7 compliance and makes keyboard use feel intentional; biggest single a11y lift available.

---

## Finding #23 — Hero subhead lists only 5 of the 6 outcomes, contradicting the 'six outcomes' promise

**Severity:** High  ·  **Area:** Home + conversion  ·  **Effort:** S  ·  **Confidence:** 97%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The fold subhead reads 'adjudicate decides — execute, rewrite, defer, escalate, or refuse — before anything touches production' (Hero.tsx lines 60-66). That is five outcomes; REQUEST_CONFIRMATION is silently dropped. Yet the eyebrow and the rest of the site lead with the six-outcome claim (OutcomesBento h2 'Six outcomes, not two.'; HeroOutcomeStrip renders six cells; SocialProof counts STATS.outcomes). The product's entire differentiator is 'six outcomes, beyond block-or-allow', so the hero undercuts its own headline math in the very first sentence.

**Why it matters:** The number six IS the positioning. A reader who counts five in the hero and six two sections later experiences a credibility wobble at the exact moment trust is being established — and the omitted outcome (human confirmation) is one of the most reassuring for regulated buyers.

**Evidence:** Hero.tsx subhead enumerates execute/rewrite/defer/escalate/refuse (5); OutcomesBento.tsx h2 'Six outcomes, not two.'; HeroOutcomeStrip maps all six DECISIONS_ORDER kinds.

**Recommendation:** Either list all six in the subhead (or phrase as 'one of six outcomes — execute, rewrite, defer, escalate, request-confirmation, or refuse') or drop the enumeration entirely and let the headline carry 'beyond block-or-allow', with the six named once in the OutcomesBento. Pick one canonical enumeration and reuse it verbatim everywhere.

**Expected impact:** Removes a factual self-contradiction on the highest-traffic line of copy; reinforces the core six-outcome positioning.

---

## Finding #24 — how-it-works renames the six canonical outcomes (modify/wait/ask), creating terminology drift across the two highest-intent pages

**Severity:** High  ·  **Area:** Home + conversion  ·  **Effort:** S  ·  **Confidence:** 92%

**Screenshot:** `audit-artifacts/screenshots/desktop/how-it-works.png`

**Problem:** The 'Six possible decisions' frame on how-it-works labels the outcomes Execute / Rewrite / Refuse / Defer / Escalate / Request confirmation with subtitles, and the prose says the control layer can 'execute, modify, refuse, wait, escalate, or ask' (visible in /tmp/hiw_top.png). 'modify' = REWRITE, 'wait' = DEFER, 'ask' = REQUEST_CONFIRMATION. Meanwhile the homepage OutcomesBento, the playground guided cases, and the audit rows all use the canonical uppercase verbs EXECUTE/REFUSE/REWRITE/DEFER/ESCALATE/REQUEST_CONFIRMATION. A visitor who lands on how-it-works (a top entry page) learns one vocabulary, then sees a different one on the homepage and in the product.

**Why it matters:** Six outcome names are the product's API and its mental model. Synonyms ('modify' vs REWRITE) force the reader to re-map terms and quietly suggest the names aren't load-bearing — undermining the determinism/explainability pitch for exactly the technical audience that cares.

**Evidence:** /tmp/hiw_top.png 'Six possible decisions' prose 'execute, modify, refuse, wait, escalate, or ask'; OutcomesBento.tsx uses REWRITE/DEFER/REQUEST_CONFIRMATION verbatim; DECISIONS canonical kinds.

**Recommendation:** Standardize on the six canonical names everywhere. On how-it-works use REWRITE/DEFER/REQUEST_CONFIRMATION as the primary label and keep 'modify safely / waits for a signal / asks the caller again' only as a one-line gloss beneath each canonical name.

**Expected impact:** One consistent vocabulary across hero, how-it-works, playground, and console — easier comprehension and stronger determinism story.

---

## Finding #25 — Console replica tables clip their right-most columns at 390px with no visible scroll affordance

**Severity:** High  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/mobile/console_audit-explorer.png`

**Problem:** In console_audit-explorer.png the audit table header is cut to 'HAS' (truncated 'HASH') and the hash values are clipped at the console frame's right edge; the 'Time' column is entirely off-screen. AuditTableReplica.tsx uses a w-full <table> with four columns (Decision, Intent, Hash, Time) inside overflow-auto, but at 390px the table is wider than the frame and the rightmost columns simply disappear with no scrollbar or fade hint that more content exists. The same crowding hits the console_ai-bom.png pack rows.

**Why it matters:** The console replicas are the product's proof surface — the whole pitch is the signed audit receipt and its hash. Showing a header literally cut to 'HAS' and clipping the hash/time columns undermines exactly the credibility the page is trying to build, and users have no cue to scroll.

**Evidence:** AuditTableReplica.tsx: <table className='w-full ... text-[11px]'> with 4 <th> (Decision/Intent/Hash/Time) inside <div className='overflow-auto'>; console_audit-explorer.png shows 'HAS' header and right-clipped hash column, no Time column.

**Recommendation:** On narrow viewports either collapse the table to a stacked card layout (Decision badge + intent + hash + time per row) or drop/secondary the Time column and let the hash truncate fully inside the frame. Add a horizontal-scroll affordance (edge fade + a 'scroll ->' hint) so it's discoverable. Ensure the header never truncates mid-word.

**Expected impact:** Makes the flagship console proof legible on phones; removes a visible 'broken header' that erodes trust.

---

## Finding #26 — Pages render with massive trailing empty space, pushing the footer thousands of px below content

**Severity:** High  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 75%

**Screenshot:** `audit-artifacts/screenshots/mobile/console.png`

**Problem:** console.png is 4155px tall but the actual content (intro + one console-loop image) ends around 1100px, followed by ~3000px of dark/empty space before the footer. console_ai-bom.png and console_audit-explorer.png show the same enormous gap below their single replica. This is the same opacity-0 reveal issue manifesting as 'reserved but unpainted' layout height: the elements occupy box height (so the page is tall) but never become visible.

**Why it matters:** A user scrolling these pages hits a wall of empty darkness and assumes the page ended or failed to load, never reaching the footer nav or the 'data flow' cross-link. It makes short pages feel broken and abandoned.

**Evidence:** console.png total height 4155px with content ending ~1100px; the trailing region is uniformly empty before the 'adjudicate · v1 · core API frozen' footer.

**Recommendation:** Fix the underlying opacity-0 reveal (see finding 1) so reserved height actually paints. Independently, audit these single-widget console pages for stray min-height / spacer elements that reserve viewport-multiples of height.

**Expected impact:** Eliminates dead-zone scrolling; users reach footer/cross-links instead of bouncing.

---

## Finding #27 — Primary install command is visually truncated in the hero ("pnpm add @adjudicate/cor")

**Severity:** High  ·  **Area:** Nielsen heuristics + competitive benchmark  ·  **Effort:** S  ·  **Confidence:** 90%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** In the above-the-fold hero, the one-click install chip reads 'pnpm add @adjudicate/cor' — the package name is clipped mid-word, with the floating 'Copy' button overlapping the cut-off text. Hero.tsx renders <CodeBlock code='pnpm add @adjudicate/core' copyable className='w-full max-w-xs'/>, and CodeBlock.tsx wraps the code in a <pre className='overflow-x-auto'>. At max-w-xs (320px) the 13px monospace string is wider than the content box, so it horizontal-scroll-clips and the absolutely-positioned copy button sits on top of the tail.

**Why it matters:** The install command is the single most important conversion artifact for a pre-auth OSS dev tool — it's the 'aha, I can try this now' moment. Showing a truncated package name reads as broken/unpolished to exactly the senior-engineer audience this targets, and a developer who reads (rather than clicks Copy) gets a wrong-looking command. Vercel/Stripe/Clerk hero install snippets always show the full command.

**Evidence:** home__fold.png hero chip clearly shows 'pnpm add @adjudicate/cor' with 'Copy' overlapping; Hero.tsx max-w-xs; CodeBlock.tsx pre overflow-x-auto + absolute copy button.

**Recommendation:** Widen the chip to fit the full command (remove max-w-xs or raise it to ~max-w-sm/md), reserve right padding so the copy button never overlaps text (e.g. pr-16 on the pre when copyable), and prefer wrapping/ellipsis over silent clip. Confirm 'pnpm add @adjudicate/core' is fully visible at desktop, tablet, and mobile widths.

**Expected impact:** Repairs the hero's primary trust/onboarding signal; the install path becomes legible and copy-confident.

---

## Finding #28 — console.faint label text fails AA on the dark console replicas

**Severity:** Medium  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 92%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_audit-explorer.png`

**Problem:** The dark console band is otherwise strong, but console.faint (#52525B, zinc-600) is used for table column headers and tertiary labels and measures 2.57:1 on zinc-950 (#09090B) and 2.29:1 on the panel surface (#18181B) — below AA for text. In console_audit-explorer.png the DECISION / INTENT / HASH / TIME column headers and the dimmed hash values are noticeably faint; in console_dashboard.png the small caption/label rows read very low-contrast.

**Why it matters:** Column headers carry the meaning of the audit table (what each column is) and are real text, not decoration; at 2.3–2.6:1 low-vision users cannot read them, undermining the 'auditable / signed receipt' trust story that this surface is meant to prove. WCAG 1.4.3 failure.

**Evidence:** tailwind.config.ts console.faint = rgb(82 82 91) #52525B; canvas rgb(9 9 11), panel rgb(24 24 27). Computed: 2.57:1 on zinc-950, 2.29:1 on panel. DataTable.tsx applies text-console-faint to <th scope='col'> headers (line 83) and to the caption (line 70). By contrast console.muted #A1A1AA is a healthy 7.76:1 and decision colors all clear AA on dark — so only the faint tier is the problem.

**Recommendation:** Reserve console.faint strictly for non-text decoration; promote table headers, captions, and any faint LABEL text to console.muted (zinc-400, ~7:1), or lighten the faint token to ~zinc-500 so it clears 4.5:1. Apply in DataTable.tsx th/caption and the dashboard label rows.

**Expected impact:** Makes audit-table headers and console labels legible on the trust-critical dark surfaces while keeping the muted/decision tiers unchanged.

---

## Finding #29 — Gradient-clipped hero headline relies on bg-clip-text with weak contrast and no fallback

**Severity:** Medium  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** In Hero.tsx the phrase 'beyond block-or-allow' is rendered as bg-gradient-primary bg-clip-text text-transparent with only drop-shadow-sm. The gradient runs indigo #6366F1 → violet #8B5CF6 → fuchsia #D946EF on the #FAFAF9 canvas; the fuchsia/violet end is light, and text-transparent means if the background-clip paint ever fails the text is invisible. This is part of the literal h1 that states the product's positioning.

**Why it matters:** The lightest stops of the gradient against off-white drop below comfortable contrast for a large headline, and text-transparent has no solid-color fallback — a 1.4.3 large-text risk on the single most important sentence on the site, plus a robustness risk (Windows high-contrast mode / forced-colors strips the clip).

**Evidence:** Hero.tsx lines 52-58: <span className='bg-gradient-primary bg-clip-text text-transparent drop-shadow-sm'>. gradient-primary defined in tailwind.config.ts line 74-75 (#6366F1→#8B5CF6→#D946EF). escalate/violet #8B5CF6 already measures only 4.05:1 on canvas; the fuchsia stop is lighter still. No @media (forced-colors) or solid color fallback is set on the span.

**Recommendation:** Darken the gradient stops (or anchor both ends in the indigo/violet 600-700 range) so the lightest painted pixels stay ≥4.5:1, and add a forced-colors/solid fallback color on the span so the headline never disappears. Test in Windows High Contrast.

**Expected impact:** Guarantees the positioning headline is legible and never vanishes, hardening the highest-visibility text on the site.

---

## Finding #30 — Transparency sub-views are single-screen and trail huge empty footers; mobile index hides all view cards

**Severity:** Medium  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** M  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/transparency_integrity.png`

**Problem:** The aggregate sub-views are thin: transparency_integrity.png is one badge card ('All packs sealed & verified', a STABLE pill, a 'what this does not show' note) followed by roughly two thirds of the viewport as empty whitespace down to the footer. The PII page (transparency_pii.png) is denser (a real bar table) but still ends with a large empty footer. On the index, mobile/transparency.png renders the 'Risk & compliance' and 'Operations' group headings and blurbs but the RevealGrid cards beneath each are entirely blank (same opacity:0 reveal issue), so the mobile transparency landing page looks like it has no content at all.

**Why it matters:** Transparency is a core trust differentiator for the regulated/governance audience. A page that is 70% empty whitespace reads as unfinished or low-effort, undercutting the 'governance in the open' claim. On mobile the index appearing card-less makes the whole transparency surface look broken.

**Evidence:** transparency_integrity.png: content stops at ~y=900 of a ~1500px page, rest is blank. mobile/transparency.png: 'Risk & compliance' / 'Behavioral drift...' and 'Operations' headings render but no view cards appear below them (RevealGrid.tsx whileInView opacity:0). desktop/transparency.png shows only the Risk & compliance row of cards; the Operations cards (PII/command-risk/tokens) are absent below the fold.

**Recommendation:** Fix the reveal gating so cards render by default (finding 1 fix covers RevealGrid). Then give each sub-view more substance and shorter dead space: add a small sparkline/trend, a 'how this is computed' line, a cross-link rail to sibling transparency views, and a CTA to the OSS console — so each page is a self-contained governance story rather than a lone badge above a void.

**Expected impact:** Makes the transparency surface look complete and trustworthy on both viewports, reinforcing the central 'open governance' positioning.

---

## Finding #31 — Integrity badge status pills use dark-theme color tones on a light surface (low contrast)

**Severity:** Medium  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** S  ·  **Confidence:** 75%

**Screenshot:** `audit-artifacts/screenshots/desktop/transparency_integrity.png`

**Problem:** The kill-switch stability pills and the state-transition strip use light-on-dark Tailwind tones — STABILITY_TONE maps to text-emerald-300, text-amber-300, text-orange-300, text-red-300 (integrity/page.tsx lines 52-57) — but the page renders on bg-canvas (light). The captured STABLE pill is a very pale green outline+text that is hard to read; on a light background, *-300 text shades fall well short of WCAG AA for small text.

**Why it matters:** This is the single most status-bearing element on the page — whether the configuration is intact. If the operative word ('STABLE') is too faint to read at a glance, the page fails its one job, and the color-coded severity escalation (stable→storm) loses meaning for low-vision users and on dim displays.

**Evidence:** integrity/page.tsx STABILITY_TONE uses border-emerald-500/40 text-emerald-300 etc.; the rendered STABLE pills in transparency_integrity.png and transparency.png appear as faint pale-green text. PulseIcon emerald-400 on white is similarly light.

**Recommendation:** Use the design system's decision/semantic tokens that are tuned for the light surface (the same execute/refuse/defer tokens used elsewhere) or darken to *-600/*-700 text with sufficient contrast, and verify each stability class meets AA (4.5:1) against bg-canvas. Keep an icon/shape difference in addition to color so the status is not color-only.

**Expected impact:** Makes the integrity status legible and AA-compliant, and keeps the severity ramp meaningful for all users.

---

## Finding #32 — Oversized dead vertical space pushes the H1 and content far down every fold

**Severity:** Medium  ·  **Area:** Capabilities + Recipes  ·  **Effort:** S  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities__fold.png`

**Problem:** On the capabilities fold the H1 '14 capabilities, four families' doesn't begin until ~360px down a 900px viewport, with a large empty band between the nav and the header, and the first card row only starts at ~640px. On the recipe deep-dive fold the lone badge row ('@adjudicate/pack-payments-pix · LIVE · REAL KERNEL · REWRITE') floats in isolation at ~505px with big gaps above and below it.

**Why it matters:** Buyers judge depth in the first viewport. Burning the top third of the fold on whitespace, then orphaning the trust badges in a sea of gap, lowers information density well below the Linear/Vercel benchmark and delays the moment the visitor sees real product (cards / code).

**Evidence:** DepthHeader.tsx uses pt-10 pb-6 but the captured fold shows the eyebrow/title starting far down — combined with RecipeLayout's flex column 'gap-16' (4rem between every block) the badge row, problem, and guard are spaced with oversized rhythm (recipes_over-refund-clamp__fold.png shows the badge row alone mid-fold). capabilities__fold.png shows the empty band above 'CAPABILITIES'.

**Recommendation:** Tighten the header top spacing and reduce the inter-block gap from gap-16 to ~gap-10/gap-12 on deep-dives. Pull the badge row up immediately beneath the subtitle (it currently reads as an orphan). Aim to get the first capability card row / first code block meaningfully higher in the initial viewport.

**Expected impact:** Raises first-screen information density and gets product (cards/code) into view sooner, improving perceived depth and scannability.

---

## Finding #33 — Capability index cards are not keyboard/scan-distinguishable; identical 'OPEN CAPABILITY' affordance lacks a real link cue

**Severity:** Medium  ·  **Area:** Capabilities + Recipes  ·  **Effort:** S  ·  **Confidence:** 66%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** Every capability and recipe card ends with the same low-contrast uppercase 'OPEN CAPABILITY →' / 'OPEN RECIPE →' microcopy in muted grey, styled identically to the non-interactive eyebrow text. The whole Card is the link, but the only visible click affordance is this faint label; there is no underline, no color shift, and the arrow + text sit at text-xs muted (text-muted on canvas).

**Why it matters:** The affordance that says 'this is clickable' is the weakest-contrast element on the card, which hurts both discoverability and accessibility. Low-contrast muted text on a near-white canvas risks failing WCAG AA for the one element communicating interactivity, and gives keyboard/AT users no distinct link semantics beyond the wrapping anchor.

**Evidence:** capabilities/page.tsx and recipes/page.tsx render the CTA as <p class='...text-xs font-medium uppercase tracking-section text-muted'>Open capability/recipe<ArrowRight/></p> — a <p>, not a styled link, in text-muted. Visible in capabilities.png / recipes.png as the faint grey label at each card's base. HoverLift provides motion but the resting state gives no link cue.

**Recommendation:** Strengthen the resting affordance: render the CTA in text-ink (or an accent) with font-medium, add an underline-on-hover and a clear focus-visible ring on the Card, and verify the CTA text meets AA contrast on canvas. Optionally move the arrow to translate on hover so the interactive intent reads without relying on color alone.

**Expected impact:** Makes every catalogue card visibly and accessibly clickable, improving click-through into the deep-dives and meeting contrast/focus expectations.

---

## Finding #34 — Honesty framing is clear but triple-stacked and repetitive across every replica

**Severity:** Medium  ·  **Area:** Console replicas  ·  **Effort:** S  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_audit-explorer.png`

**Problem:** Each replica states it is illustrative at least three times within one viewport: the page subtitle ('A faithful replica … driven by a simulated live tail over committed sample data'), the non-removable chrome banner ('ILLUSTRATIVE REPLICA OF THE OPERATOR CONSOLE · SAMPLE DATA'), and the in-table 'SIMULATED' badge — plus per-page footers like 'Command text is never shown — redacted by construction' and the approvals 'Display only' warning. The chrome banner is a deliberate, reviewed security control (ConsoleChrome.tsx), which is good; but the page subtitle largely restates it.

**Why it matters:** The redundancy adds reading load and a faintly defensive tone on every page, slightly diluting the confidence the product otherwise projects. The framing is never confusing — if anything it is over-communicated.

**Evidence:** console_audit-explorer.png shows, top-to-bottom: subtitle 'A faithful replica … simulated live tail over committed sample data', then the banner 'ILLUSTRATIVE REPLICA OF THE OPERATOR CONSOLE · SAMPLE DATA', then a 'SIMULATED' pill — three honesty statements in one fold. ConsoleChrome.tsx comments mark the banner as a mandatory control.

**Recommendation:** Keep the mandatory chrome banner and the SIMULATED badge (load-bearing). Trim the page subtitle to lead with the value ('Watch decisions land newest-first, then drill into any receipt') and move the 'committed sample data' caveat to a single quieter line. One prominent honesty signal + one quiet caveat beats three.

**Expected impact:** Lighter, more confident pages; the value proposition leads and the (still-clear) honesty framing stops competing with it.

---

## Finding #35 — Console hub hero video is too small and illegible to sell the product

**Severity:** Medium  ·  **Area:** Console replicas  ·  **Effort:** S  ·  **Confidence:** 66%

**Screenshot:** `audit-artifacts/screenshots/desktop/console.png`

**Problem:** The /console hub opens on a looping clip of the operator console, but it is rendered small and the in-clip text ('AUDIT EXPLORER', the row contents 'email.send.bulk REWRITE …', 'Saved receipts stream into the audit explorer, in real time.') is too low-contrast and too small to read; it reads as a vague dark thumbnail rather than a hook. The page below is also mostly empty black canvas (the replica cards sit far down / below the captured fold), so the hub's first impression is one small fuzzy video on a big black field.

**Why it matters:** This is the entry point to the whole showcase. A best-in-class hub (Vercel/Linear) opens with an instantly legible, high-contrast product shot. Here the motion exists but the payload is unreadable, so the 'console is alive' promise lands weakly.

**Evidence:** console.png: the video occupies a narrow band; its caption 'Illustrative loop · the operator console with decisions tailing in' and the in-frame labels are gray-on-near-black and not legible at this size; large empty dark regions surround it.

**Recommendation:** Make the hero clip wider/larger with crisper contrast, or replace with a high-DPI still of the Audit Explorer (already the strongest replica) plus a subtle tail animation. Pull the first row of replica cards up so the hub doesn't open on empty canvas.

**Expected impact:** The hub immediately communicates 'real, dense operator console' and pulls users into the 10 replicas instead of presenting an ambiguous dark hero.

---

## Finding #36 — Dense 10-11px gray-on-near-black text repeatedly fails contrast

**Severity:** Medium  ·  **Area:** Console replicas  ·  **Effort:** M  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_integrity.png`

**Problem:** The replicas lean heavily on 10px uppercase tracked labels in 'console-faint'/'console-muted' tints (panel titles like 'ACTIVE SEALS', 'SELECTED SEAL · …', subtitles like 'governance.behavioralDrift', hash digests 'a10000…0000', and timeline axis text). On the zinc-950 surface these are visibly low-contrast and, at 10px, hard to read even on desktop. DataTable/Panel headers are text-[10px] text-console-faint by construction.

**Why it matters:** Audience includes regulated-industry/governance reviewers who scan for specific values (hashes, statuses, codes). Sub-4.5:1 contrast at 10px makes the very data the product is selling (auditability, legibility of decisions) hard to actually read — and it fails WCAG AA for normal text.

**Evidence:** console_integrity.png: 'DIGEST a10000…0000', 'SIGNATURE verified/failed', and the 'CONFIGURATION INTEGRITY · SEALS · VIOLATIONS …' eyebrow are faint gray on black. Across files the pattern repeats (drift subtitles, tokens 'TENANT BUDGETS', red-team 'governance.redTeamHistory'). Code: DataTable.tsx and Panel headers use text-[10px] … text-console-faint.

**Recommendation:** Raise the faint/muted token lightness to meet AA (>=4.5:1 for body, >=3:1 for the 10px+ uppercase labels treated as large only if >=14px bold), and bump structural labels to 11-12px. Reserve the very faint tint strictly for decorative chrome (the mac dots caption), not data.

**Expected impact:** The audit/governance data becomes legible to the buyers who care most, and the surface passes contrast checks instead of looking deliberately dim.

---

## Finding #37 — Blog is thin and structurally bare — 4 posts, no tags/categories, no RSS, no visual differentiation

**Severity:** Medium  ·  **Area:** Content + community + global chrome  ·  **Effort:** M  ·  **Confidence:** 75%

**Screenshot:** `audit-artifacts/screenshots/desktop/blog.png`

**Problem:** desktop/blog.png shows exactly 4 posts (confirmed: content/blog.ts has 4 entries) in an undifferentiated vertical stack of identical bordered cards, each with a tiny gray uppercase 'YYYY-MM-DD · the adjudicate team' eyebrow, a title, a summary, and a 'Read post' link. There are no categories/tags, no reading-time, no featured post, no author avatars, no cover images, no RSS/subscribe affordance, and every post shares one author string ('the adjudicate team'). The list is centered in a narrow max-w-3xl column with a large 750-word intro paragraph that dominates the fold (blog/page.tsx lines 45–53), pushing the actual posts down.

**Why it matters:** A 4-post blog with no taxonomy, no subscribe, and identical card styling reads as 'just launched and abandoned' — the opposite of the 'active, disciplined project' the roadmap is trying to convey. For a developer audience evaluating whether to adopt OSS guardrails, a sparse, non-subscribable blog signals low momentum. Best-in-class dev blogs (Vercel, Stripe) offer tags, RSS, and visual hierarchy even with few posts.

**Evidence:** desktop/blog.png: 4 stacked cards, identical styling, gray date/author eyebrows; oversized intro paragraph above. content/blog.ts: POSTS array has 4 items, all author 'the adjudicate team'. blog/page.tsx has no tag/RSS/featured logic. mobile/blog.png shows the same 4-card stack.

**Recommendation:** Add a featured/hero post treatment for the latest entry, introduce 2–4 tags (e.g. Engineering, Governance, Launch) with filter chips, expose an RSS feed and a 'Subscribe' link, and add reading-time. Trim the intro paragraph to 1–2 sentences so posts are visible at the fold. Even with 4 posts, this reads as an intentional, living blog rather than a stub.

**Expected impact:** Repositions the blog as active and navigable; RSS/subscribe captures interested developers; tags improve scanability and SEO.

---

## Finding #38 — Mega-menu is a single Architecture dropdown — the rest of the IA is a long flat row with no grouping

**Severity:** Medium  ·  **Area:** Content + community + global chrome  ·  **Effort:** M  ·  **Confidence:** 65%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The header (home__fold.png) is a flat row of 6 same-weight links — How it works, Capabilities, Recipes, Console, Playground — plus a single 'Architecture ▾' dropdown, plus Docs. Only Architecture is a group (nav.ts lines 44–79, with 6 children including Transparency, Deploy, Comparisons, Introspection). Everything else is flat and undifferentiated, so a first-time visitor can't tell which items are 'learn' (How it works, Capabilities, Architecture) versus 'do' (Console, Playground) versus 'trust' (the Transparency hub buried inside the Architecture dropdown). The Trust hub — arguably the most important surface for a regulated-industry audience — is two levels deep (Architecture ▾ → Transparency) and absent from the top level entirely.

**Why it matters:** For a product targeting 'regulated industries' and 'internal governance', the Transparency/trust surfaces being hidden inside an 'Architecture' dropdown is a real IA miss — the audience that most needs PII/AI-BOM/drift/red-team evidence has to guess it lives under Architecture. A flat 6-item row also offers no mental model of the site's structure.

**Evidence:** home__fold.png header: 6 flat links + Architecture(▾) + Docs, all equal weight. nav.ts: only the Architecture entry has items[] (lines 44–79); Transparency is items[5] inside it (lines 73–76). The footer DOES surface a rich 'Trust' column (nav.ts lines 114–126) — but only in the footer.

**Recommendation:** Reconsider top-level grouping: surface a 'Trust'/'Transparency' top-level entry (or dropdown) given the regulated-industry audience, and consider grouping the flat links under 2–3 dropdowns (Product, Architecture, Trust/Resources) so the header communicates structure. At minimum, promote Transparency out of the Architecture submenu.

**Expected impact:** Improves wayfinding for the highest-value audience and gives the header a legible information architecture instead of a flat link row.

---

## Finding #39 — Type scale has fragmented into ~8 arbitrary pixel sizes that bypass the named scale

**Severity:** Medium  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/recipes.png`

**Problem:** Instead of a tight named ramp (xs/sm/base/lg...), the codebase leans heavily on arbitrary pixel sizes: 180x text-[10px], 114x text-[11px], plus text-[9px], text-[12px], text-[13px], text-[14px], text-[15px], text-[16px]. That is at least six distinct sizes between 9 and 16px doing the job of 'xs/sm/base', with no documented meaning for each. The recipes cards (recipes.png) pack several of these micro-sizes (badges, metadata, body) into one card.

**Why it matters:** A fragmented sub-base scale is exactly what separates homemade from Linear/Vercel-grade. It makes vertical rhythm hard to keep consistent, invites one-off tweaks, and means a future 'bump the small text' change touches dozens of bespoke values instead of one token. The 9-11px sizes also flirt with readability limits on mobile.

**Evidence:** grep of text-* utilities: 180 text-[10px], 176 text-sm, 138 text-xs, 114 text-[11px], plus 18 text-[9px], 26 text-[12px], 34 text-[13px], 3 text-[14px], 3 text-[15px], 1 text-[16px]. The named scale (xs/sm/base) and these arbitrary values coexist for overlapping roles.

**Recommendation:** Codify a small fixed ramp in tailwind.config.ts (e.g. label-2xs=10px/0.18em-tracking, label-xs=11px, then xs/sm/base/lg/xl/2xl) and replace the arbitrary text-[Npx] values with named tokens. Collapse 9/10/11px down to one or two intentional micro-label sizes. This is mechanical and high-leverage.

**Expected impact:** A legible, enforceable type system; future text changes become one-token edits and rhythm stays consistent across cards and tables.

---

## Finding #40 — Two near-duplicate six-outcome chip components with divergent size scales

**Severity:** Medium  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 88%

**Screenshot:** `audit-artifacts/screenshots/desktop/home.png`

**Problem:** DecisionChip (ui, server) and DecisionBadge (motion, client) both render 'icon + uppercase outcome label in a decision-colored pill' from the same DECISIONS map, but with different size systems: DecisionChip md = 'gap-2 px-3 py-1.5 text-xs' (icon 14), while DecisionBadge md = 'px-4 py-2 text-sm gap-2' (icon 14) and adds an 'lg' size DecisionChip lacks. So the 'same' chip is physically different depending on which component a section happened to import.

**Why it matters:** This is classic component-inventory debt: two implementations of one design atom guarantee they eventually drift in padding, label, or icon. The decision chip is the most repeated brand object on the site (hero, capabilities, footer), so any inconsistency is highly visible.

**Evidence:** DecisionChip.tsx SIZE_STYLES (lines 29-32): sm 'px-2.5 py-1 text-[11px]', md 'px-3 py-1.5 text-xs'. DecisionBadge.tsx sizeClasses (lines 40-45): sm 'px-2.5 py-1 text-xs', md 'px-4 py-2 text-sm', lg 'px-5 py-3 text-base'. Both map the identical ICONS record and read DECISIONS[kind].

**Recommendation:** Collapse to one DecisionChip with a single canonical size scale; make the animated version a thin wrapper that adds framer-motion entrance around the same DecisionChip rather than re-implementing the markup and sizes. Delete the duplicated ICONS map.

**Expected impact:** One pixel-identical decision chip everywhere; removes a duplicated icon map and a future drift source.

---

## Finding #41 — REWRITE chip uses the non-AA orange even though an AA-safe shade is defined in config

**Severity:** Medium  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** tailwind.config.ts deliberately defines rewrite.strong = #C2410C (orange-700) with the comment 'AA contrast for body-weight on white', acknowledging that the default rewrite #F97316 (orange-500) fails AA on the light canvas. But decisions.ts sets the REWRITE chip to accent:'text-rewrite' (the orange-500 DEFAULT), so the live 'REWRITE' chip label on the light surface uses the shade the team itself flagged as not AA-safe.

**Why it matters:** The orange REWRITE label is small uppercase text on a near-white card (visible on the PII-guard card in capabilities.png). Orange-500 on white is ~2.9:1 - below the 4.5:1 AA threshold for normal text - so the team's own AA-safe token exists but isn't wired up, leaving a known contrast failure shipped.

**Evidence:** tailwind.config.ts lines 49-52 define rewrite.DEFAULT #F97316 and rewrite.strong #C2410C ('AA contrast for body-weight on white'). decisions.ts REWRITE block (lines 59-66) uses accent:'text-rewrite' (DEFAULT), not strong. capabilities.png PII-guard card shows the orange 'REWRITE' pill.

**Recommendation:** Point the REWRITE chip's text accent at text-rewrite-strong (orange-700) on light surfaces while keeping the orange-500 fill/border for the band. Audit defer (#F59E0B amber on white is also borderline) the same way. Add a contrast assertion in CI for the six on-light label colors.

**Expected impact:** Brings the one decision label that fails AA into compliance using a token the team already created; closes a self-documented gap.

---

## Finding #42 — Reveal-gated content renders invisible without scroll/JS - WedgeTable body is empty in the comparisons capture

**Severity:** Medium  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** M  ·  **Confidence:** 78%

**Screenshot:** `audit-artifacts/screenshots/desktop/comparisons.png`

**Problem:** The comparison 'wedge' table renders only its header row (CAPABILITY / OPA-CEDAR / ADJUDICATE) inside an empty bordered box - the rows are missing. The rows are wrapped in Stagger/StaggerItem which start at opacity:0/initial='hidden' and only reveal via whileInView once they scroll within 50px (REVEAL_VIEWPORT once:true). Below-the-fold reveal content therefore stays at opacity 0 until an IntersectionObserver fires, so a non-scrolling render shows an empty table - and the same pattern gates large stretches of the page body.

**Why it matters:** The comparisons page exists to prove the 'six outcomes OPA/Cedar can't express' claim; rendering an empty table is the worst possible failure for that page. More broadly, opacity-0-until-observed content is fragile for crawlers, link-preview bots, slow hydration, and any IO hiccup - it trades a reveal animation for content that can be invisible.

**Evidence:** comparisons.png shows the bordered table with header labels and no data rows. WedgeTable.tsx wraps rows in Stagger (as='tbody') + StaggerItem (as='tr'); Stagger.tsx sets initial='hidden' whileInView='visible' viewport=REVEAL_VIEWPORT; lib/motion.ts REVEAL_VIEWPORT={once:true, margin:'-50px'} and revealVariants hidden=opacity 0.

**Recommendation:** For content-bearing tables/lists, don't gate visibility on scroll: render rows visible by default and animate transform-only (or use a CSS-first reveal that degrades to visible). At minimum verify the screenshot pipeline scrolls the full page; but the durable fix is to never let primary content depend on whileInView opacity. Keep the stagger as a transform/translate-in over already-visible rows.

**Expected impact:** The differentiator table (and other below-fold body content) is always present for users, bots, and captures; removes a fragile invisible-content failure mode.

---

## Finding #43 — Primary hero CTA promises a '5-min demo' the playground doesn't deliver

**Severity:** Medium  ·  **Area:** Home + conversion  ·  **Effort:** S  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/playground.png`

**Problem:** The hero primary button reads 'Try the 5-min demo' → /playground (Hero.tsx line 77-79). The actual playground (playground.png, /tmp/pg_top.png) is a 'Watch the kernel decide' page with a Guided/Sandbox toggle and six pre-built scenario cards — there is no 5-minute guided sequence, no timer, no multi-step walkthrough that takes 5 minutes. The number is invented and sets a specific time expectation the page contradicts (the page itself says 'No JSON, no setup; best for a first look').

**Why it matters:** Concrete, falsifiable promises in the primary CTA either over-deliver friction expectations ('5 minutes feels long, skip it') or create a small bait-and-switch when the destination is actually a one-click instant demo. Specific numbers in CTAs must be true.

**Evidence:** Hero.tsx 'Try the 5-min demo'; playground.png shows instant scenario cards + Guided/Sandbox toggle, subtitle 'No JSON, no setup; best for a first look'.

**Recommendation:** Change the CTA to a truthful, lower-friction label: 'Try the live demo', 'Run a real decision', or 'See it decide (no setup)'. Reserve any time estimate for a genuinely timed guided tour if one is later built.

**Expected impact:** Aligns the CTA promise with the destination; lowers perceived friction on the primary conversion path.

---

## Finding #44 — Homepage is 14 sections / ~13k px long and loses the thread after the spine

**Severity:** Medium  ·  **Area:** Home + conversion  ·  **Effort:** M  ·  **Confidence:** 75%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** After the tight Hero → MagicMoment → 4-step spine (StepActs/OutcomesBento/StepReceipt/StepConsole), the page keeps going through RecipesTeaser, WhoItsFor, Positioning, SocialProof, PlaygroundEntry, GetStarted, FAQ, DepthLinks, FinalCTA — 9 more sections. There is meaningful redundancy: the playground is pitched three times (MagicMomentSplit CTA 'See the full decision', PlaygroundEntry, and FinalCTA 'Playground'), and the six-outcome concept is taught in HeroOutcomeStrip, OutcomesBento, and again on how-it-works. GetStarted drops three full TypeScript code blocks late on a pre-auth marketing page where most visitors haven't yet decided to install. On mobile this is a ~19,888px scroll.

**Why it matters:** Length itself isn't the problem — repetition and a flat back-half are. The decision spine peaks at StepConsole; everything after competes for the same 'now act' attention without a rising arc, diluting the single strongest CTA and adding cognitive load on mobile where the scroll is enormous.

**Evidence:** page.tsx renders 14 sections; playground CTA appears in MagicMomentSplit, PlaygroundEntry, and FinalCTA; GetStarted.tsx renders 3 CodeBlocks; mobile/home.png is 19,888px.

**Recommendation:** Tighten the back half: merge PlaygroundEntry into the spine's StepConsole handoff or remove it (FinalCTA already links the playground); move the full GetStarted code blocks to a /docs or /quickstart and keep only the one-line install + a 'Read the quickstart' link on the homepage; ensure exactly one primary CTA per section with a clear hierarchy (Try the demo > Star on GitHub > Read docs).

**Expected impact:** Shorter, higher-momentum page with one dominant CTA per screen; less repetition and lower mobile scroll cost.

---

## Finding #45 — Reduced-motion users get a degraded hero (static poster) while normal users get the explanatory animation

**Severity:** Medium  ·  **Area:** Home + conversion  ·  **Effort:** M  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The HeroKernelLoop is the central above-the-fold proof exhibit, but under prefers-reduced-motion it swaps to a static /hero-kernel-poster.jpg (HeroKernelLoop.tsx). In the fold screenshot the kernel exhibit area below the install chip is essentially blank white — the video/poster carries the entire 'what does the kernel actually do' visual, and a single static poster frame can't convey the 100%→25% rewrite that the animation demonstrates. So the most motion-sensitive users (often an accessibility need) get the weakest version of the core explanation, with no equivalent static diagram of the rewrite.

**Why it matters:** Reduced-motion is an accessibility setting, not a 'lite' preference. If the only way to understand the hero's central claim is to watch a 12-second loop, motion-sensitive and a11y users are left with a near-empty hero and must rely on copy alone.

**Evidence:** HeroKernelLoop.tsx returns a single <img poster> under useReducedMotion; home__fold.png shows blank space where the exhibit sits; the alt text describes the full 100%→25% rewrite the static frame can't show.

**Recommendation:** Provide a static, information-equivalent hero exhibit for reduced motion (e.g., a side-by-side 100%→25% rewrite card, the same content the MagicMomentSplit shows static) rather than a single ambiguous video frame. Ensure the poster image itself depicts the before/after, not a mid-loop frame.

**Expected impact:** Reduced-motion and a11y users get the same core comprehension as everyone else above the fold.

---

## Finding #46 — Large vertical gaps between section headings and their content on the capabilities page

**Severity:** Medium  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/mobile/capabilities.png`

**Problem:** On capabilities.png the section headers 'Adversarial & behavioral', 'Budget & integrity', and 'Workflow & governance' each appear with a one-line description, then a large blank gap before the next header — the capability cards that should sit under each family heading are not painted (again the staggered reveal sitting at opacity 0). The result reads as three near-empty sections, so '14 capabilities, four families' is contradicted by a page that visibly shows only the first family's cards.

**Why it matters:** The capabilities page is a core comprehension surface — it must show the breadth of what the kernel can decide. Showing empty families directly undercuts the '14 capabilities' headline and makes the product look thin.

**Evidence:** capabilities.png shows three section headings ('Adversarial & behavioral', 'Budget & integrity', 'Workflow & governance') each followed by empty space; only 'Content & data safety' renders its ADR cards.

**Recommendation:** Same reveal fix as finding 1; verify each capability family renders its cards on first paint. As a guard, add a visual test asserting N capability cards are present on mobile.

**Expected impact:** Restores the full capability inventory; aligns the page with its own headline claim.

---

## Finding #47 — Mobile nav trigger and links fall below the 44px minimum touch target

**Severity:** Medium  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** The hamburger trigger in NavBar.tsx is a button with p-2 around a 20px icon, giving roughly a 36px tap target — below the 44x44px WCAG 2.5.5 / Apple HIG minimum. Inside the sheet, MobileLink uses px-1 py-2 (vertical padding ~16px on a ~24px line for large links, less for nested group links), so several nav rows are also under 44px tall and sit close together. On a 390px phone these are easy to mis-tap, especially the nested capability/architecture group links.

**Why it matters:** Navigation is the one interaction every mobile visitor must perform. Sub-44px targets cause mis-taps and frustration, and disproportionately affect users with motor or dexterity limitations — an accessibility regression on the primary control.

**Evidence:** NavBar.tsx trigger: className includes 'p-2' around <Menu size={20}>; MobileLink className uses 'px-1 py-2'; MobileGroup nested items use the smaller (non-large) MobileLink variant.

**Recommendation:** Give the hamburger a min-h-11 min-w-11 (44px) hit area, and make each MobileLink at least 44px tall (e.g. py-3 + min-h-11) with adequate spacing between nested group items. Keep the icon size; only grow the padding/hit area.

**Expected impact:** Reliable tapping of the only navigation on mobile; meets WCAG 2.5.5.

---

## Finding #48 — Hero CTA hierarchy is muddy: a strong primary, a near-invisible secondary, and a truncated install chip competing as a third path

**Severity:** Medium  ·  **Area:** Nielsen heuristics + competitive benchmark  ·  **Effort:** S  ·  **Confidence:** 78%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The hero offers three parallel actions but only one looks like a CTA. 'Try the 5-min demo' is a filled gradient pill (good), but 'How it works' (Hero.tsx variant='ghost') renders as plain dark text with no border, underline, or hover affordance — it reads as a label, not a clickable control. Below them the install chip is a third, visually heavier dark block (and is truncated, per the separate finding). The eye also has to parse the 4-chip 'AI acts / Guard decides / Receipt saved / Console shows' rail (ActiveStepStrip) immediately above, which is small and low-contrast.

**Why it matters:** Best-in-class heroes (Linear, Vercel, Clerk) present one unmistakable primary and one clearly-styled secondary. Here the secondary's lack of affordance violates Nielsen 'recognition rather than recall' (users can't recognize it as a link) and dilutes the funnel — the 5-min demo, the strongest conversion path for this product, has to share visual weight with an ambiguous ghost link and a code block.

**Evidence:** home__fold.png: filled 'Try the 5-min demo' vs unstyled 'How it works' text vs dark install chip; Hero.tsx Button variant='ghost' for the secondary.

**Recommendation:** Give the secondary a clear affordance (outline/border or persistent underline + hover state). Keep one primary. Consider demoting the install chip to a smaller, full-width 'or install: pnpm add @adjudicate/core' line beneath the button pair so it reads as a third-tier option, not a competing block.

**Expected impact:** Sharpens the funnel toward the high-intent demo and makes every hero action recognizably clickable.

---

## Finding #49 — Heuristic sweep: 'Visibility of system status' is excellent inside the demo but failing at the page level

**Severity:** Medium  ·  **Area:** Nielsen heuristics + competitive benchmark  ·  **Effort:** M  ·  **Confidence:** 82%

**Screenshot:** `audit-artifacts/screenshots/desktop/playground.png`

**Problem:** Component-level status is exemplary: GuidedStep.tsx shows a spinner with 'Asking the kernel…', a StepStrip that advances idle→computing(pulse)→'Receipt saved', aria-live='polite' results, and a role='alert' error chip — better than most competitors' demos. But at the page level the opposite is true: because content is opacity:0 until scroll-reveal (see Critical finding), a visitor on slow JS gets no skeleton, no loading state, and no indication that ~10 sections exist below — the page simply looks finished-and-empty. There is no system feedback that content is pending.

**Why it matters:** Nielsen H1 is about the SYSTEM keeping the user informed. The playground nails it; the page shell silently withholds content with no status, so the two experiences are inconsistent and the most-visited surface (home) is the weaker one.

**Evidence:** playground.png + GuidedStep.tsx aria-live/spinner/StepStrip (strong); home.png blank-below-fold with no skeleton (weak).

**Recommendation:** After fixing the SSR-visibility root cause, the page-level gap disappears. If any genuinely deferred content remains, add lightweight skeletons. Carry the demo's status discipline to the page shell.

**Expected impact:** Consistent, trustworthy feedback across the whole site, not just the interactive island.

---

## Finding #50 — Competitive gap — interactive demo BEATS most leaders, but the surrounding page polish is WORSE than Linear/Vercel due to the reveal fragility

**Severity:** Medium  ·  **Area:** Nielsen heuristics + competitive benchmark  ·  **Effort:** M  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_audit-explorer.png`

**Problem:** Benchmark verdicts: (1) Interactive demo — BETTER than Stripe/Clerk/Vercel sample widgets: it runs the REAL kernel server-side, shows a signed receipt, and even surfaces an honest 'the live kernel returned X, the story expected Y' mismatch notice (GuidedStep.tsx) — a rare trust move competitors don't make. The audit-explorer replica (console_audit-explorer.png) is a convincing, well-typed dark console on par with Vercel/Raycast craft. (2) Hero copy/positioning — EQUAL to Linear/Vercel: sharp, outcome-first headline and a clear six-outcome spine, only let down by the truncated install chip and weak secondary CTA. (3) DX/docs entry — EQUAL/slightly WORSE than Stripe: the install path is present but visually broken in the hero, the first impression of 'how do I start' is undercut. (4) Overall polish — WORSE than Linear/Vercel: those sites are flawless in a static, no-scroll, no-JS capture; this one collapses to a near-empty page in exactly that condition, which is how search engines, link-preview bots, and many first paints actually see it.

**Why it matters:** The product clearly CAN reach Linear-grade — the component craft proves it — but a single architectural choice (visibility coupled to scroll animation) drags the holistic polish score below the benchmark and risks the launch's most leveraged surfaces (shared links, search).

**Evidence:** console_audit-explorer.png + GuidedStep.tsx (better-than-peer craft) vs home.png/comparisons.png empty static render (worse-than-peer robustness).

**Recommendation:** Ship the SSR-visibility fix and the install-chip fix; both are small. After that the site legitimately competes in the Linear/Vercel/Clerk tier on craft. Then re-run static (no-scroll, JS-disabled) captures as a release gate.

**Expected impact:** Converts a 'great-when-it-works' demo into a uniformly best-in-class marketing site; protects launch-day link previews and SEO.

---

## Finding #51 — Bare focus:outline-none without a replacement ring in console ErrorState

**Severity:** Low  ·  **Area:** Accessibility (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 85%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_dashboard.png`

**Problem:** apps/web/src/components/console-kit/ui/ErrorState.tsx applies focus:outline-none and replaces it only with a border-color change (focus:border-console-ink/30) — it removes the visible outline but the border tint it substitutes is subtle on the dark panel and is the only focus affordance on that retry control. This is the one place site-wide that actively strips the UA outline without a clear ring.

**Why it matters:** Removing the outline and substituting a faint border can leave keyboard users unable to tell the retry button is focused on the dark console replica. Minor because it is a single, secondary control, but it is the inverse of the otherwise-good console-kit focus discipline.

**Evidence:** grep for 'outline-none' without an accompanying focus-visible:ring returned exactly one hit: ErrorState.tsx:40 '...focus:border-console-ink/30 focus:outline-none'. Every other console-kit/section control pairs outline-none with a ring.

**Recommendation:** Replace focus:outline-none with focus-visible:outline-none plus focus-visible:ring-1 focus-visible:ring-console-ink (matching the SkipLink/DataTable idiom) so the retry control has an unambiguous focus indicator.

**Expected impact:** Closes the lone bare-outline-none focus gap in the console kit.

---

## Finding #52 — Source-file annotations and 10px micro-type push legibility limits, especially on the data-flow nodes

**Severity:** Low  ·  **Area:** Architecture + Trust + Deploy  ·  **Effort:** S  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/architecture_data-flow.png`

**Problem:** The pipeline nodes lean on very small type: source <code> at text-[10.5px] text-faint, FlowEdge chips at text-[10px], and OutcomeChips at text-[9.5px] (DataFlowDiagram.tsx). 'faint' is already the lowest-contrast text token, so a 9.5–10.5px faint monospace path like '@adjudicate/core · decision.ts · envelope.ts' is near-illegible. The whole value of these annotations is that a reader can trace a claim into the repo — at this size/contrast that benefit is largely lost.

**Why it matters:** The annotations are the credibility mechanism of the architecture story ('every claim maps to a real source file'). If they cannot be read comfortably, the rigor is asserted but not demonstrated, and small faint text is an accessibility (and aging-eyes) problem.

**Evidence:** DataFlowDiagram.tsx: source code className 'text-[10.5px] ... text-faint', FlowEdge 'text-[10px] text-muted', OutcomeChips code 'text-[9.5px]'. In architecture_data-flow.png the node sub-labels are barely resolvable at desktop scale.

**Recommendation:** Raise the floor to ~12px for the source paths and use text-muted rather than text-faint; reserve 9–10px only for non-essential decoration. Ensure all functional text meets AA. Consider making the source path a real link to the GitHub tree so the annotation is actionable, not just decorative.

**Expected impact:** Turns the source annotations into a readable, clickable proof-of-rigor instead of unreadable fine print.

---

## Finding #53 — Workflow family is visually overloaded (5 cards) while three families have only 3 — uneven, unbalanced catalogue

**Severity:** Low  ·  **Area:** Capabilities + Recipes  ·  **Effort:** M  ·  **Confidence:** 55%

**Screenshot:** `audit-artifacts/screenshots/desktop/capabilities.png`

**Problem:** The four families are presented as peers, but the distribution is 3/3/3/5. 'Workflow & governance' carries 5 capabilities (approvals, memory, packs, etc.) while the others carry exactly 3, so the catalogue's bottom family is noticeably heavier and the 'four equal families' framing slightly oversells the symmetry.

**Why it matters:** Minor, but uneven section weights make a catalogue feel less deliberately curated than Stripe/Notion-grade indexes, and the heaviest family is buried last (and currently invisible due to the reveal bug).

**Evidence:** content/capabilities.ts family counts: content-safety 3, adversarial 3, budget-integrity 3, workflow 5 (14 total). FAMILIES order in capabilities/page.tsx puts workflow last.

**Recommendation:** Either split 'Workflow & governance' into two tighter families (e.g. 'Human-in-the-loop' and 'Governance packs') for a more even 3/3/4/4 shape, or reorder so the densest, most differentiated family isn't last. Lower priority than the reveal/duplication fixes.

**Expected impact:** Marginally improves catalogue balance and curation feel; secondary to the rendering fixes.

---

## Finding #54 — Ten near-identical dark replicas create wayfinding sameness; back-link is the only nav between them

**Severity:** Low  ·  **Area:** Console replicas  ·  **Effort:** M  ·  **Confidence:** 60%

**Screenshot:** `audit-artifacts/screenshots/desktop/console_dashboard.png`

**Problem:** Every replica page shares the same skeleton (white DepthHeader block → identical dark chrome frame → '← BACK TO CONSOLE'). There is no inter-replica navigation (no 'next replica', no in-page tab strip, no persistent list), so exploring all ten means bouncing back to the hub each time. Combined with the visually similar dark frames, it is easy to lose track of which of the ten you've seen.

**Why it matters:** The hub groups replicas well (Live feed / Analytics / Governance), but once inside a replica the user is on an island. For a 10-page showcase, friction to traverse it reduces how much of the product a visitor actually sees.

**Evidence:** console_dashboard.png, console_drift.png, console_integrity.png etc. all show only '← BACK TO CONSOLE' (or '← BACK TO AUDIT EXPLORER' on decision detail) and no forward/sibling navigation; the chrome frames are visually interchangeable at a glance.

**Recommendation:** Add a lightweight prev/next or a sticky replica switcher (the three groups as a segmented strip) on every replica page so users can sweep the showcase without returning to the hub. Differentiate each frame's eyebrow/accent slightly so the current surface is instantly identifiable.

**Expected impact:** More of the 10 surfaces get seen per session; the showcase feels like a guided tour rather than ten dead-end deep links.

---

## Finding #55 — Announcement banner has no landmark separation and competes with the nav for the top of every page

**Severity:** Low  ·  **Area:** Content + community + global chrome  ·  **Effort:** S  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/home__fold.png`

**Problem:** The banner (AnnouncementBanner.tsx) is a slim, dismissible strip reading 'adjudicate core is v1 — production-ready & API-frozen  release notes →' with an X to dismiss. It is well-built (localStorage dismissal, CLS-safe, keyboard-dismissable, role='region' with aria-label). But on home__fold.png it sits flush above the nav in nearly the same surface tone, so the very top of the page is two thin gray bars (banner + nav) before the hero — a slightly cramped, low-contrast stack. The dismiss X is a 14px icon in a small hit area; the banner text contrast (text-muted on bg-surface) is the lightest text on the page.

**Why it matters:** It is not broken — it is genuinely one of the better-implemented banners I've seen here — but the double-thin-bar stack and very-light muted text mean the trust signal ('v1, API-frozen') it is trying to broadcast is easy to overlook, and the dismiss target is small for touch.

**Evidence:** home__fold.png top: two stacked light bars before the hero; banner copy in muted gray. AnnouncementBanner.tsx: text-muted (line 53), X icon size={14} in p-1 button (lines 73–80), bg-surface (line 50).

**Recommendation:** Increase banner text contrast (use text-ink for the version claim, keep the link emphasized), give the dismiss button a ≥40px touch target on mobile, and add a hair more visual separation (e.g. a subtle accent tint or left brand bar) so the banner reads as a distinct, deliberate strip rather than a second nav bar. Keep the excellent dismissal/CLS behavior.

**Expected impact:** Makes the v1/API-frozen trust claim more legible and the dismiss control easier to hit, without adding intrusiveness.

---

## Finding #56 — Blog 'Read post' links use indigo-600 — a one-off color that breaks the site's token system

**Severity:** Low  ·  **Area:** Content + community + global chrome  ·  **Effort:** S  ·  **Confidence:** 80%

**Screenshot:** `audit-artifacts/screenshots/desktop/blog.png`

**Problem:** The blog index 'Read post →' link and the blog post footer CTAs use raw Tailwind indigo-600/indigo-700 (blog/page.tsx line 71; blog/[slug]/page.tsx lines 82, 91, 102). Everywhere else the site uses semantic design tokens (text-ink, text-muted, text-faint, bg-surface, decision-outcome colors like text-execute/text-defer, and the purple brand gradient in the hero). The hero CTA in home__fold.png is a purple-gradient pill, not indigo. So the blog introduces a fifth, untokenized link color that doesn't match the brand purple used in the hero or the ink/decoration-underline link style used on roadmap/contribute (e.g. roadmap doc links use text-ink + underline decoration-edge).

**Why it matters:** It's subtle, but a marketing site benchmarked against Linear/Stripe lives or dies on token discipline. A hardcoded indigo link color that differs from both the brand purple and the rest of the site's link styling makes the blog feel like it came from a different design system, and it bypasses the dark-mode/theming the tokens provide.

**Evidence:** blog/page.tsx line 71: text-indigo-600 group-hover:text-indigo-700. blog/[slug]/page.tsx lines 82/91/102: text-indigo-600. Contrast with roadmap/page.tsx doc links (text-ink underline decoration-edge, lines 435–470) and the hero's purple-gradient CTA in home__fold.png.

**Recommendation:** Replace indigo-600/700 with the site's link token system — either the ink + decoration-underline pattern used on roadmap/contribute, or the brand-purple token if a colored link is desired. Add a lint rule against raw Tailwind color utilities in app code to prevent token drift.

**Expected impact:** Restores visual consistency between the blog and the rest of the site; ensures links theme correctly.

---

## Finding #57 — Roadmap hero contains a date-style claim ('release notes →') but the page never states a current date or last-updated

**Severity:** Low  ·  **Area:** Content + community + global chrome  ·  **Effort:** S  ·  **Confidence:** 60%

**Screenshot:** `audit-artifacts/screenshots/desktop/roadmap.png`

**Problem:** The roadmap (desktop/roadmap.png) is framed as 'the honest state of that line — what is locked, what recently shipped, and what is next', and the copy leans hard on freshness ('Recently shipped', 'What's next'). But there is no 'last updated' date anywhere on the page, and the 'What's next' items deliberately list 'direction here, not dates' (roadmap/page.tsx line 399). A roadmap with no timestamp and no dates can't actually be verified as current — which slightly undercuts the 'honest, evidence-driven' positioning. (The blog posts DO carry dates, so this is inconsistent within the same content area.)

**Why it matters:** Roadmaps are trust artifacts; a stale-looking, undated roadmap is worse than none for a governance-focused audience. A simple 'Last updated' line and version anchor would make the 'honest state of the line' claim checkable.

**Evidence:** desktop/roadmap.png hero + 'Recently shipped' framing with no date stamp; roadmap/page.tsx has no last-updated field and line 399 explicitly omits dates. Blog cards by contrast show explicit YYYY-MM-DD dates (blog/page.tsx line 63).

**Recommendation:** Add a small 'Last updated · <date>' near the roadmap hero badges and anchor 'Recently shipped' to the resulting package versions (already in the data) with a visible release date. This makes the freshness claim verifiable.

**Expected impact:** Strengthens the roadmap's core 'honest, current state' promise with a concrete, checkable signal.

---

## Finding #58 — Mobile home renders ~20000px tall with large empty bands between sections

**Severity:** Low  ·  **Area:** Design system (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 60%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** The mobile home capture is 659x19888 and shows the hero, then vast stretches of empty canvas with no content - the section rhythm (py-24 md:py-32 = 96/128px vertical padding per Section) plus reveal-gated content compounds on a narrow viewport into enormous scroll distance with nothing visible between blocks.

**Why it matters:** On mobile, doubling 96-128px of padding on every Section while content is also opacity-gated produces a page that feels mostly empty and endless to scroll - high cognitive load and a perception that the site is broken or unfinished, hurting conversion on the device where most discovery traffic lands.

**Evidence:** mobile/home.png is 19888px tall with large blank regions; Section.tsx applies py-24 md:py-32 uniformly with no mobile-reduced spacing; combined with the whileInView opacity-0 reveal pattern (see WedgeTable finding) the blank bands read as missing content.

**Recommendation:** Dial section padding down on mobile (e.g. py-16 sm:py-24 md:py-32) and ensure reveal content is visible by default (see reveal finding) so captures and slow devices don't show empty bands. Re-screenshot mobile after to confirm density.

**Expected impact:** Tighter, more confident mobile rhythm; less endless-scroll perception on the highest-traffic form factor.

---

## Finding #59 — OutcomesBento gates differentiating depth behind a click ('When is this chosen?') and risks weak contrast on the 'edge' tags

**Severity:** Low  ·  **Area:** Home + conversion  ·  **Effort:** M  ·  **Confidence:** 70%

**Screenshot:** `audit-artifacts/screenshots/desktop/how-it-works.png`

**Problem:** The single most differentiating content — how DEFER differs from ESCALATE, REWRITE from REFUSE — lives inside a <details> disclosure on each bento tile (OutcomesBento.tsx 'When is this chosen?'). By default all six are collapsed, so a skimming visitor sees only one-line examples and the binary-vs-six framing but must click six times to get the distinctions that justify the product. Additionally the edge-tag pills use small low-saturation tokens (text-rewrite-strong on border-rewrite/40, font size text-[9px]/text-[11px] uppercase) and the how-it-works 'Six possible decisions' tiles render as very faint tinted boxes (visible in /tmp/hiw_top.png) — small, low-contrast type that's hard to read.

**Why it matters:** The 'beyond block-or-allow' argument is the whole pitch; hiding the part that proves it (the semantic distinctions) behind disclosures means most visitors never see the actual differentiation, and the tiny faint labels weaken scannability for everyone and likely fail WCAG AA contrast.

**Evidence:** OutcomesBento.tsx renders whenChosen inside <details> collapsed by default; edgeTag pills at text-[9px]; /tmp/hiw_top.png 'Six possible decisions' tiles are faint low-contrast tinted boxes with small text.

**Recommendation:** Surface at least the REWRITE/DEFER distinctions inline (not collapsed) for the two 'edge' tiles, or show a one-line 'vs ESCALATE / vs REFUSE' contrast on each tile face. Increase the size and contrast of the outcome labels and edge tags to meet WCAG AA (audit the rewrite/defer/escalate token foregrounds against their tinted backgrounds).

**Expected impact:** The core differentiator is visible without a click; labels are readable and meet contrast for all users.

---

## Finding #60 — Hero CTA stack and version chip read small/tight at 390px

**Severity:** Low  ·  **Area:** Mobile UX (cross-cutting)  ·  **Effort:** S  ·  **Confidence:** 55%

**Screenshot:** `audit-artifacts/screenshots/mobile/home.png`

**Problem:** In the painted hero region of home.png the two CTAs stack full-width but are visually similar in weight and the supporting eyebrow/badge text above the headline is very small. With everything below the hero blank (finding 1), the hero is effectively the entire mobile experience, so its CTA hierarchy carries 100% of the conversion load yet the primary vs secondary action distinction is subtle.

**Why it matters:** When the rest of the page fails to paint, the hero CTAs are the only path forward. A weak primary/secondary distinction at the one moment it matters most reduces click-through.

**Evidence:** home.png hero shows two stacked CTAs of similar visual weight beneath a small eyebrow and version badge; remainder of page blank.

**Recommendation:** Strengthen the primary CTA's prominence on mobile (solid high-contrast fill, larger min-h-12) versus a clearly secondary ghost/outline action; bump the eyebrow/badge to at least 12-13px for legibility.

**Expected impact:** Clearer single tap-target for the main action on the page that, today, IS the page.

---
