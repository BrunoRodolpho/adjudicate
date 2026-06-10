# UX audit — per-area scorecards

Six dimensions scored 1–10 (10 = best-in-class / Linear-grade). Honest and calibrated: a competent marketing site sits ~6–7; only genuinely excellent work earns 8–10.

| Area | IA | Usability | Hierarchy | Conversion | A11y | Mobile |
|---|--:|--:|--:|--:|--:|--:|
| Home + conversion | 6 | 6 | 7 | 6 | 5 | 5 |
| Capabilities + Recipes | 6 | 5 | 5 | 6 | 6 | 4 |
| Console replicas | 7 | 5 | 6 | 6 | 5 | 3 |
| Architecture + Trust + Deploy | 7 | 6 | 6 | 5 | 5 | 5 |
| Content + community + global chrome | 6 | 6 | 7 | 6 | 7 | 4 |
| Accessibility (cross-cutting) | 7 | 6 | 7 | 7 | 4 | 6 |
| Design system (cross-cutting) | 7 | 7 | 8 | 7 | 4 | 6 |
| Mobile UX (cross-cutting) | 6 | 4 | 5 | 3 | 5 | 4 |
| Nielsen heuristics + competitive benchmark | 7 | 6 | 6 | 6 | 6 | 6 |

## Home + conversion

The hero is genuinely strong: a confident outcome-first headline, a legible decision-spine subhead, a clean CTA cluster, and a one-click install chip — easily best-in-class for above-the-fold value communication. But two structural problems drag the experience down hard. First, every section below the hero is wrapped in a framer-motion Reveal that initializes at opacity:0 and only paints whileInView; in the full-page screenshots (desktop home.png is 13,240px, mobile 19,888px) the entire body below the hero renders as blank white. This is a real robustness/SEO/social-card failure mode, not a screenshot artifact — any context where IntersectionObserver/scroll doesn't fire shows an empty page. Second, the page is very long (14 sections) and leaks terminology: the hero subhead lists only five of the six outcomes, the how-it-works page renames REWRITE/DEFER/REQUEST_CONFIRMATION to modify/wait/ask, and the CTA promises a "5-min demo" the playground doesn't deliver. The two entry pages are well-built but the homepage trusts motion too much and loses the thread in its back half.

**Strengths:**
- Hero is outcome-first and confident: 'Guardrails for AI agents that go beyond block-or-allow' answers what + how-different in one line, with a clean gradient emphasis and excellent type hierarchy (home__fold.png).
- The decision-spine subhead ('Your agent proposes an action. adjudicate decides — ... — before anything touches production. Every decision, a signed receipt.') compresses what/why/how into a single readable sentence and seeds the whole page's narrative (Hero.tsx).
- Strong CTA cluster pattern: a high-intent primary (live demo), a low-commitment tertiary (How it works), and a one-click copyable install chip — the right three-tier hierarchy for a pre-auth OSS site.
- MagicMoment / MagicMomentSplit is a genuinely convincing conversion device: a real, server-side kernel run shows the 100%→25% rewrite as a danger→fix split with a real auditHash, captioned 'This ran on the real kernel, server-side — not a mockup' (MagicMomentSplit.tsx).
- Trust signals are credible and non-fluffy: SocialProof pulls every stat from STATS.generated at build time ('every number counted from the codebase'), and StepReceipt renders an actual hash-chained AuditRecord with a plain-English annotation rail explaining intentHash/auditHash/signature.
- Accessibility fundamentals are mostly right: native <details> disclosures for FAQ and bento (keyboard + SR friendly, zero-JS), focus-visible rings, aria-labels on figures and nav, FAQPage JSON-LD built from one source, and a reduced-motion code path in every motion component.
- The light→light→light→DARK spine (StepConsole as the one dark band) is a smart, intentional use of surface change to mark the operator's-eye-view step (StepConsole.tsx).
- The playground entry page is well-scoped and low-friction: a Guided/Sandbox toggle with six concrete, real business scenarios and 'OUTCOMES YOU'LL SEE' chips per card — exactly the right hand-off from marketing to product (playground.png).

_Findings in this area: 7 (see screenshot-findings.md)._

## Capabilities + Recipes

The underlying content is genuinely excellent — provenance-linked ADRs, real-kernel worked examples, command-safety invariants — and the recipe deep-dive layout is well-structured and DX-credible. But the product-depth surfaces are crippled by a scroll-reveal animation bug that leaves the majority of their value invisible in the captured (non-scrolled / crawler / reduced-JS) state: 3 of 4 capability families render as empty headers, and recipe deep-dives hide the entire payload (install command, real code, live kernel outcome) below an unrevealed fold. Layered on top are real hierarchy problems — verbatim header/section duplication, oversized dead vertical space, and a Tier-1/Tier-2 vs Live/Illustrative labeling system that is genuinely confusing. Content quality is ~8; as-shipped UX is dragged to ~5 by the rendering and hierarchy defects.

**Strengths:**
- Genuinely strong, trust-building content model: every capability links to a real ADR + implementing package source (ProvenanceCard in CapabilityPageLayout) and every recipe ships a real, copyable TypeScript guard plus a server-rendered live kernel ReceiptCard — this is far more credible than typical marketing 'depth'.
- The command-risk safety invariant is handled with real rigor: WorkedExample/WorkedOutcome deliberately never render the raw command, basis detail, or confirmation prompt, surfacing only category + basis codes with an explicit ADR-123 callout — exactly the discipline a regulated/governance audience wants to see.
- Recipe deep-dive IA is excellent when it renders: problem → install → real guard code → live outcome → 'Try it in the playground' → related capability/console/transparency links is a clean, conversion-aware DX funnel.
- The recipes index is scannable and well-composed: a balanced 3-column grid where each card pairs a solution-phrased title, the problem, the outcome DecisionChip, and the npm package — solution-focused SEO framing done right.
- Honest labeling philosophy is consistent and commendable: every fixture-illustrative example wears a visible 'Illustrative' pill (IllustrativeLabel) and live runs are marked 'Real kernel · run server-side at render time' — no fake live data.
- The illustration-kind worked examples (policy-coherence flow diagram, agent-memory two-lane isolation diagram) give dense prose a real visual anchor and make abstract upstream-only capabilities concrete.

_Findings in this area: 7 (see screenshot-findings.md)._

## Console replicas

The console replica showcase is the most ambitious and, on desktop at the right scroll position, the most impressive part of the site — the decision-receipt diff and the SIMULATED audit tail are genuinely "see the product" moments that few OSS sites attempt. But it is undermined by a structural flaw: nearly every data visualization (drift timeline, red-team trend, token burn-bars/exhaustion timeline, approvals audit chain, integrity kill-switch timeline, command-risk blocked list) is gated behind a scroll-triggered whileInView reveal that, in the captured state, renders as a permanently blank box — turning "alive" replicas into dead, broken-looking panels. Mobile compounds this: the flagship audit table is clipped with no scroll affordance and the AI-BOM detail pane vanishes entirely. The honesty framing is unmistakably clear (arguably over-stated, triple-stacked). This is a high-ceiling surface dragged down to mid-tier by reveal-timing fragility and weak mobile/legibility execution.

**Strengths:**
- The Decision receipt replica (console_decision_…png) is the standout of the entire site: the side-by-side PROPOSED vs REWRITTEN payload diff with the changed values highlighted and the 'INTENT HASH CHANGED proposed → rewritten' line concretely demonstrates the product's core value (deterministic rewrite + tamper-evident hash) better than any prose.
- The Audit Explorer SIMULATED tail is a smart, honest device — a real client-side animation over committed fixtures (useSimulatedTail.ts) that makes the feed feel alive without faking a live backend, and it defaults to the full set so a passive visitor never lands on an empty table.
- Color-coded decision chips (EXECUTE green, REFUSE red, REWRITE orange, DEFER amber, ESCALATE purple, CONFIRM? blue) are consistent across audit-explorer, dashboard legend, and decision detail, giving the six outcomes a memorable, scannable visual language.
- The non-removable 'ILLUSTRATIVE REPLICA · SAMPLE DATA' chrome banner (ConsoleChrome.tsx) is exemplary product honesty for a pre-auth OSS site — it treats the boundary as a security control, not decoration.
- On desktop and tablet at the right scroll position the dark operator aesthetic is convincingly 'real product' — the mac-chrome dots, localhost:5180 caption, ADR references, and dense governance panels (integrity seals, red-team defended/escaped counts, token burn bands) read like a genuine internal tool, not a marketing mockup.
- The tablet breakpoint handles the dense audit table well (tablet/console_audit-explorer.png) — all four columns fit and remain legible, showing the layout CAN be responsive when columns aren't clipped.

_Findings in this area: 7 (see screenshot-findings.md)._

## Architecture + Trust + Deploy

This is the technically richest cluster of the site — the data-flow diagram, OPA/Cedar wedge, trust-boundary panel and deploy story are genuinely well-written and source-annotated, and would read as best-in-class IF they rendered. But a systemic scroll-reveal pattern (opacity:0 until whileInView) leaves the single most persuasive elements — the DataFlowDiagram, TrustBoundaryPanel, the 6-card DecisionsGrid, and the entire WedgeTable body — as large blank voids in the captured screenshots (architecture.png, architecture_data-flow.png, comparisons.png). That is a real failure mode for no-JS/crawler/slow-hydration visitors, not just a capture artifact, and on a developer-trust OSS site it is severe. Layered on top: a dead #playground anchor on /comparisons, a low-contrast integrity badge, an awkward tall mobile data-flow stack, and transparency sub-views that are each a single screen of content trailing an enormous empty footer.

**Strengths:**
- The content quality is genuinely high: /architecture/data-flow traces one decision end-to-end (agent → kernel → AuditRecord → Postgres mirror + Redis/SSE → console) with every node annotated to a real package/source file — this is exactly the rigor the AI-platform audience wants, and it reads as honest rather than marketing fluff.
- The OPA/Cedar comparison is well-argued and intellectually honest: ComparisonPreamble frames the 'allow/deny can't express REWRITE/DEFER' thesis with a concrete $10k-vs-$5k-cap scenario, and the WedgeTable even marks 'kernel identity / build attestation' as 'seam' (not shipped) rather than overclaiming.
- Consistent depth-page IA: every route shares the DepthHeader pattern with an eyebrow ('Depth · comparisons'), a strong H1, a subtitle, and a 'Back to…' breadcrumb (backHref/backLabel), so wayfinding within the cluster is predictable.
- The /deploy page is a strong, scannable narrative — Library/in-process (Shipping) → Audit persistence (Optional) → Operator console → Runnable examples — with honest Shipping/Optional/Roadmap badges and real code snippets lifted from runnable examples, which is excellent onboarding credibility for OSS.
- The transparency privacy contract is articulated precisely and trustworthily: 'aggregates only', explicit small-cohort floor (<5), and 'allowlist by construction', reinforced by the TrustBoundaryPanel thesis that apps/web holds no DB/Redis credentials so it 'cannot leak by construction' — a genuinely differentiated trust story.
- Motion and reduced-motion are handled conscientiously in the code (useReducedMotion short-circuits render fully-visible static markup everywhere), and the PII transparency table renders cleanly with accessible bar rows, scope='row' headers, sr-only captions, and censored-cohort screen-reader notes.

_Findings in this area: 6 (see screenshot-findings.md)._

## Content + community + global chrome

The global chrome is the strongest part of this area: the NavBar, footer, and banner are well-engineered, accessible, and consistent with a polished dev-tool site (roughly Vercel/Clerk tier). The long-form pages are written with unusual rigor — the roadmap and contribute copy is genuinely excellent. But two serious problems drag the score down. First, the roadmap and contribute pages depend on framer-motion whileInView reveals that leave everything below the first viewport rendered at opacity:0 in the captured screenshots across desktop, tablet, and mobile — a real, reproducible failure mode that turns content-rich pages into near-blank scrolls. Second, the blog is thin (4 posts, no categories/tags/RSS, a generic single-page list) and the chrome has nav/footer parity gaps (Blog and Roadmap/Contribute are footer-only, never in the header). The content quality is A-grade; the rendering and IA wiring around it is not yet shipped-quality.

**Strengths:**
- NavBar engineering is genuinely strong: sticky translucent header with a border that fades in on scroll, a controlled (not pure-CSS) Architecture dropdown that correctly closes on navigation/Escape/focus-leave, proper aria-haspopup/aria-expanded/aria-current, a full-screen mobile sheet with body-scroll lock and route-change auto-close, and prefers-reduced-motion handling throughout (NavBar.tsx).
- The roadmap and contribute COPY is best-in-class — precise, honest, and unusually well-grounded (frozen invariants, SemVer discipline, an explicit 'what we will NOT build' callout, an L1–L5 contributor map with a 'where does my change go?' decision grid). This is the kind of writing Stripe/Linear are known for.
- AnnouncementBanner is a model implementation: dismissible with localStorage persistence (versioned key), explicitly CLS-safe (laid out in normal flow, no reserved-space collapse), keyboard-dismissable with role='region' + aria-label, and SSR/first-paint consistent.
- The footer is rich and does real IA work: four columns (Product, Architecture, Trust, Project) driven from a single source of truth (content/nav.ts), with the Trust column intentionally surfacing all seven transparency sub-views to de-orphan those routes — plus a brand-signature decision-chip row.
- Single-source-of-truth nav graph: NavBar and SiteFooter both read PRIMARY_NAV/FOOTER_COLUMNS from content/nav.ts, with a clean NavLink/NavGroup type model and a type guard — exactly the kind of maintainable structure that keeps a multi-page site consistent.
- Blog post template is thoughtful: standfirst/summary as a standfirst, a 'What's next?' CTA cluster (architecture, playground, open an issue), and a 'Keep reading' related-posts list — good internal linking and forward momentum (blog/[slug]/page.tsx).
- Strong SEO/structured-data hygiene in layout.tsx: JSON-LD SoftwareApplication+Organization graph, per-page OpenGraph/Twitter metadata on blog/roadmap/contribute, and generateStaticParams for blog posts.

_Findings in this area: 8 (see screenshot-findings.md)._

## Accessibility (cross-cutting)

The site has a real accessibility foundation in spots — single h1 per page, semantic SectionHeading h2s with no level-skips, thorough prefers-reduced-motion gating across the whole motion kit plus a global CSS fallback, a fully correct ARIA tablist (roving tabindex, arrow/Home/End keys, focus-visible rings) in the Playground, and a healthy dark console band where every decision color clears AA. But it is undermined by two systemic, ship-blocking failures: (1) the shared Button and the entire NavBar define NO focus-visible styles, and there is no global focus rule, so keyboard focus on nearly every CTA and nav link relies on the inconsistent UA default — invisible on the gradient primary button; and (2) decision-color text and faint text on the light marketing canvas fail WCAG AA badly (defer 2.06:1, faint 2.45:1 used ~105×, execute 2.43:1, rewrite 2.68:1, refuse 3.6:1). The team clearly knows how — they built rewrite-strong for AA and an exemplary tablist — but applied it inconsistently. The shipped SkipLink component is never rendered, and no main landmark is focusable.

**Strengths:**
- Exemplary ARIA tablist in the Playground (apps/web/src/sections/Playground.tsx): proper role='tablist'/'tab'/'tabpanel', roving tabindex, ArrowLeft/Right/Up/Down + Home/End handlers, aria-selected, aria-controls, and a real focus-visible:ring-2 — this is best-in-class keyboard support and proves the team can do it.
- Thorough prefers-reduced-motion handling: every motion component (Stagger, CountUp, DrawOnScroll, HeroOutcomeStrip, NavBar dropdown/sheet) checks framer-motion's useReducedMotion AND globals.css has a global @media (prefers-reduced-motion: reduce) fallback that neutralizes animations/transitions/scroll-behavior. CountUp even starts at the final value to avoid a 0-flash.
- Clean heading hierarchy: one h1 per page (Hero.tsx single h1), all section titles are h2 via the shared SectionHeading, and eyebrows are non-heading spans — no skipped levels or multiple-h1 problems.
- The dark console band is genuinely accessible for color: every decision color clears AA on zinc-950 (execute 7.84:1, defer 9.26:1, confirm 7.18:1, refuse 5.29:1, escalate 4.7:1) and console.muted is 7.76:1 — strong contrast where it counts on the trust-critical surfaces.
- Real accessible-table infrastructure exists (console-kit/a11y/DataTable.tsx) enforcing a required <caption>, scope='col' on all headers, and scope='row' on the leading cell, plus a VisuallyHidden helper using the correct sr-only clip technique.
- The team already created an AA-safe decision variant (rewrite-strong #C2410C at 5.18:1, explicitly commented 'AA contrast for body-weight on white') and uses it in StepReceipt — the right pattern exists and just needs to be applied to the other five colors.
- AnnouncementBanner is implemented thoughtfully for a11y/UX: role='region' with aria-label, a labelled Dismiss button (aria-label), persists via localStorage, and is deliberately CLS-safe and rendered in normal flow so dismissal doesn't shift the sticky nav.
- Decorative hero backdrop layers (dotted grid, radial glow) are correctly marked aria-hidden and pointer-events-none, and icon glyphs throughout (lucide) consistently carry aria-hidden='true' so they don't pollute the accessibility tree.

_Findings in this area: 7 (see screenshot-findings.md)._

## Design system (cross-cutting)

The foundation is genuinely strong: a coherent off-white canvas with one disciplined gradient-primary accent, a real semantic six-outcome color system ported one-to-one from the operator console, and a tidy set of composable server-component primitives (Section, Card, Badge, DecisionChip, Callout). At the section/card level this reads Vercel-grade. But under the hood it is two design systems wearing one coat of paint: a marketing-light token set (text-execute, single shades) and a copied console-dark set (text-emerald-300) with diverging labels, casing, and order arrays for the SAME load-bearing six outcomes. The type scale has quietly fragmented into ~8 arbitrary pixel sizes (180x text-[10px], 114x text-[11px]) that bypass Tailwind's named scale, the canonical Button and Card ship with zero focus-visible styling, and a documented AA-safe rewrite shade exists in config but the live chip uses the non-AA orange. So: Linear/Vercel-grade in the visible composition, homemade and accruing debt in the token and component-inventory layer.

**Strengths:**
- Single, well-chosen accent system: one gradient-primary (indigo->violet->fuchsia) drives every primary CTA, the active StepStrip chip, and selection color (globals.css ::selection #6366F1) - restraint that reads premium rather than rainbow.
- The six decision tokens are a real semantic palette, not ad-hoc colors: execute/refuse/rewrite/defer/escalate/confirm are defined once in tailwind.config.ts and consumed as text-execute/bg-execute/10/border-execute/40, so the chips on home, capabilities, recipes and the footer are provably the same six hues (visible as consistent green/red/orange/violet pills across desktop/home.png, desktop/capabilities.png, desktop/recipes.png).
- Strong primitive composition: Section enforces one vertical rhythm (py-24 md:py-32, max-w-6xl, px-6), DepthHeader gives every depth route an identical back-link + eyebrow + title block (visible identical headers on capabilities.png, console.png, comparisons.png, deploy.png), and the uppercase tracking-section eyebrow pattern is reused 83 times - that consistency is what makes the site feel designed.
- Card hover-lift, Badge tone variants (neutral/shipped/roadmap/adr mapped to semantic tokens), and the StatTile mono-number treatment are clean, single-source, and tasteful; the dark CodeBlock against the light canvas (deploy.png) is a confident, Stripe-like contrast move.
- Genuine accessibility intent where it exists: every decorative icon carries aria-hidden, the announcement banner uses role=region + aria-label, FooterChips/Stagger have real prefers-reduced-motion branches that render content fully visible, and NavBar dropdowns are keyboard/focus aware with aria-expanded/aria-haspopup.

_Findings in this area: 7 (see screenshot-findings.md)._

## Mobile UX (cross-cutting)

Mobile is the weakest dimension of this site by a wide margin, and it is dragged down by one systemic, conversion-killing defect rather than a long tail of small issues. Almost every page below the hero is wrapped in scroll-triggered reveal animations (Reveal / Stagger, framer-motion whileInView starting at opacity 0). In the captured mobile screenshots this leaves enormous swaths of the page blank — the entire home page below the hero, the comparison table rows, the data-flow diagram, and two full public-view widgets on the transparency page all render as empty space. Independently, the console replica tables overflow and clip their rightmost columns at 390px with no scroll affordance, and the mobile nav trigger and links sit below the 44px touch-target minimum. The underlying layout/typography is clean and readable where it actually renders, which is the only reason this is not a 2.

**Strengths:**
- Where content actually paints, typography and line length are well tuned for 390px — see deploy.png and recipes.png: comfortable measure, readable code blocks that don't overflow horizontally, and clean card spacing.
- No horizontal page scroll on the body itself; the layout column respects the 390px viewport and uses a sensible single-column stack (capabilities.png, transparency.png intros).
- The mobile nav is a proper full-screen sheet with body-scroll lock, route-change auto-close, aria-expanded on the trigger, and a focusable close button (NavBar.tsx MobileSheet) — the structure is correct, only the touch-target sizing needs work.
- All reveal/stagger primitives are genuinely reduced-motion-safe (Reveal.tsx, Stagger.tsx, RevealGrid.tsx short-circuit to plain, fully-visible elements under prefers-reduced-motion), so users with that setting avoid the blank-content failure entirely — a good a11y instinct that just needs to become the default for everyone.
- Console replicas carry honest, persistent 'Illustrative replica · sample data' and 'SIMULATED' badges (AuditExplorerReplica.tsx) that remain legible and well-placed even on the cramped mobile frame — strong trust hygiene.
- The deploy page (deploy.png) is the best mobile page: code samples, inline callouts, and runnable-example cards all render and read cleanly end-to-end, proving the design system works well on mobile when content isn't gated behind opacity-0 reveals.

_Findings in this area: 6 (see screenshot-findings.md)._

## Nielsen heuristics + competitive benchmark

The designed experience is genuinely high-craft: the hero, capability cards, audit-explorer replica, and especially the live playground (real-kernel runs with aria-live results, honest "the live kernel disagreed with the script" mismatch notices, controlled receipt disclosure) are Stripe/Clerk-grade. But the implementation has one self-inflicted, near-fatal flaw: every section below the hero is opacity:0 in the initial HTML and only revealed by a client-side IntersectionObserver (framer-motion whileInView) with NO noscript/SSR-visible fallback. In every static capture — desktop, tablet, mobile, and the vs-OPA comparison table — the page renders as a tall expanse of blank whitespace with only the hero painted. That same fragility hits crawlers, social-card bots, slow JS, and the conversion-critical wedge table. Combined with a visually truncated primary install command, the site under-delivers on Nielsen's "visibility of system status" and "match to the real world" at the page level despite excelling at the component level.

**Strengths:**
- Live playground is genuinely best-in-class: GuidedStep.tsx runs the real kernel server-side, announces results via aria-live='polite', shows a role='alert' error chip, a loading spinner with 'Asking the kernel…', and an honest 'the live kernel disagreed with the scripted story' mismatch notice — a trust move most competitors (Stripe/Clerk demo widgets) don't make.
- Accessibility fundamentals are strong where it counts: NavBar.tsx applies aria-current='page' for wayfinding, the Playground segmented control is a real ARIA tablist with roving tabindex + arrow/Home/End keyboard nav (Playground.tsx), receipts use controlled disclosure with aria-expanded/aria-controls, and motion respects prefers-reduced-motion (Reveal short-circuits to a plain div; motion-reduce variants throughout).
- The audit-explorer console replica (console_audit-explorer.png) is high-craft: clean monospace decision/intent/hash/time table, color-coded EXECUTE/REFUSE/REWRITE/DEFER/ESCALATE/CONFIRM chips, an honest 'SIMULATED' badge and 'ILLUSTRATIVE REPLICA · SAMPLE DATA' label — Vercel/Raycast-level dark-surface polish that also avoids over-claiming.
- Hero positioning is sharp and outcome-first: 'Guardrails for AI agents that go beyond block-or-allow' with a one-line decision spine (agent proposes → adjudicate decides → signed receipt), matching the clarity of Linear/Vercel hero copy.
- Capabilities cards (capabilities__fold.png) are well-structured: ADR reference, Tier maturity badge, plain-English description, and the relevant outcome chips per capability — strong scannability and an honest Tier-1-real / Tier-2-fixture distinction.
- Thoughtful user-control details: the AnnouncementBanner (AnnouncementBanner.tsx) is dismissible with localStorage persistence, documented as CLS-safe, role='region' labelled, and degrades gracefully when storage is disabled.

_Findings in this area: 5 (see screenshot-findings.md)._
