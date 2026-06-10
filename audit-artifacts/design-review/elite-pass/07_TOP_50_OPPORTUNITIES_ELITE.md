# Top 50 Aesthetic Opportunities (Elite format)

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

The patterns are clear and consistent across all 232 screenshots. Here is the ranked report.

## TOP 50 AESTHETIC OPPORTUNITIES

Ranked #1–#50 by impact on world-class feel. Every item is grounded in the 58-route ledger and cites specific routes.

---

**#1 Eliminate the dead-zone voids that read as broken renders**
Current state: Black/white voids consume 40–80% of page height on `console`, `console_dashboard`, `console_drift`, `console_tokens`, `console_integrity`, `transparency`, `transparency_drift`, `transparency_integrity`, `transparency_pii`, `roadmap`, `contribute`, `home`. The ledger repeatedly calls these "render failure, not intentional space."
World-class state: Every scroll position is intentional — pages clip cleanly or fill with purposeful content; Apple/Linear/Vercel "treat every scroll position as intentional" (per `capabilities` verdict).
Why it matters: A void is the single loudest "this is unfinished" signal a design-literate eye catches.
Expected impact: Removes the dominant credibility-killer on ~15 routes; lifts perceived completeness instantly.
Severity: Critical | Visual impact: 10 | Effort: M | Confidence: High

---

**#2 Fix the mobile content-render failures**
Current state: Primary content is entirely absent on mobile across `recipes_*` (code blocks vanish on `block-dangerous-commands`, `cap-blast-radius`, `cap-token-spend`, `gate-prod-deploys`, `least-privilege-access`, `over-refund-clamp`, `pause-for-human`, `redact-pii`), `transparency_command-risk`/`pii`/`red-team`/`tokens` (data tables blank), `console_approvals` (empty pending queue), `console_integrity` (blank ACTIVE SEALS), `contribute` (~80% blank).
World-class state: The core content surface renders and reflows at 390px on every route — the most common breakpoint is first-class.
Why it matters: A blank primary surface on phones is a categorical disqualifier, not a polish gap.
Expected impact: Converts ~18 mobile experiences from "broken" to functional.
Severity: Critical | Visual impact: 10 | Effort: L | Confidence: High

---

**#3 Replace the ~120–200px hero dead-air gap between subtitle and tag/content row**
Current state: A signature unmotivated gap appears on nearly every `capabilities_*` route, `recipes_*`, `deploy`, `introspection`, `architecture`, `architecture_data-flow` — "reads as a removed component, not intentional rhythm."
World-class state: Tight, confident intervals or a purposeful divider bridge headline to metadata; space creates rhythm, not silence.
Why it matters: It is the first optical event after the headline — it sets the credibility ceiling for the whole page.
Expected impact: Repairs the first impression on 25+ routes with one spacing-token fix.
Severity: High | Visual impact: 8 | Effort: S | Confidence: High

---

**#4 Collapse the multi-system badge/pill soup into one taxonomy token**
Current state: 4–8 simultaneous badge treatments (outlined purple, orange-bg, monospace grey, teal icon, colored fills) on `capabilities_command-risk-guard`, `capabilities_ai-bom`, `capabilities_red-team`, `capabilities_release-gating`, `recipes`, every recipe detail page, `transparency_ai-bom`.
World-class state: One neutral metadata line; outcomes get a single deliberate treatment. Two visual signals maximum.
Why it matters: The badge wall inverts hierarchy — metadata reads louder than the value proposition at the exact moment of orientation.
Expected impact: Quiets the noisiest element on ~20 routes; restores headline primacy.
Severity: High | Visual impact: 8 | Effort: M | Confidence: High

---

**#5 Elevate the six-outcome model from pill metadata to a designed visual argument**
Current state: The core differentiator is reduced to small colored pills or buried in prose on `capabilities`, `capabilities_incident-response-pack`, `comparisons`, `home`, `console_dashboard`, and every capability page. "A visitor can read the page and still miss the claim."
World-class state: Six outcomes get a diagram or designed moment — the wedge against block-or-allow is the visual centerpiece, not a filing system.
Why it matters: The single thing that makes adjudicate not-generic is currently invisible to scanners.
Expected impact: Transforms the product narrative from "another guardrail tool" to "the six-outcome kernel."
Severity: High | Visual impact: 9 | Effort: L | Confidence: High

---

**#6 Remove the macOS traffic-light window chrome from all console replicas**
Current state: Skeuomorphic stoplight dots on every `console_*` route — "borrowed platform decoration," "developer-screenshot cosplay," carrying zero semantic value and adding 3 stray colors.
World-class state: A crafted, branded frame (or none) — Stripe/Linear/Vercel abandoned this pattern.
Why it matters: It signals "fake screenshot" and imports another OS's identity, cheapening every console surface.
Expected impact: Raises the luxury read on all 12 console routes; removes a recurring color-noise source.
Severity: High | Visual impact: 7 | Effort: S | Confidence: High

---

**#7 Demote the GitHub CTA — stop it from outweighing the primary action**
Current state: The purple/gradient GitHub pill is the loudest element in the nav on virtually every route (`architecture`, `home`, `blog*`, `capabilities*`, `deploy`, `console*`, `transparency*`) — "CTA hierarchy inverted," dwarfing "Open console."
World-class state: Monochrome or ghost GitHub treatment; one dominant primary action per context.
Why it matters: The loudest nav element leads users off-product before they orient.
Expected impact: Corrects inverted CTA hierarchy site-wide in one component change.
Severity: High | Visual impact: 6 | Effort: S | Confidence: High

---

**#8 Build real code-block craft (theme, language badge, copy affordance, overflow handling)**
Current state: Raw `<pre>` tags with default syntax highlighting that overflow on mobile and optically outweigh prose across all `blog_*` and `recipes_*` and `deploy`. "Dark code blocks are heavier than prose, inverting reading hierarchy."
World-class state: A bespoke brand-tuned code theme with edge-fade overflow containers, like Stripe/Linear/Vercel.
Why it matters: Code is the dominant visual mass on editorial and recipe routes — its rawness caps the whole page.
Expected impact: Lifts every blog and recipe route; fixes mobile overflow as a side effect.
Severity: High | Visual impact: 7 | Effort: M | Confidence: High

---

**#9 Fix headline widows and uncontrolled wraps with a max-width / soft-break system**
Current state: Orphans on the page's most important type everywhere — "enough." (`comparisons`), "kernel." (`blog`), "side-effect." (`deploy`), "families." (`capabilities`), "actions" (`blog_launching`), "resume it" (`recipes_pause-for-human`), "intact?" (`transparency_integrity`), "the wild." (`transparency_command-risk`).
World-class state: Controlled, balanced headline breaks at every breakpoint.
Why it matters: The most prominent typographic moment is currently the least controlled — a classic luxury tell.
Expected impact: Restores headline authority across 20+ routes with a typographic utility.
Severity: High | Visual impact: 6 | Effort: S | Confidence: High

---

**#10 Establish one authoritative typographic scale (display/title/headline/body)**
Current state: "Only two font weights," section headings indistinguishable from body, eyebrow too close to body — flat hierarchy on `comparisons`, `blog*`, `deploy`, `capabilities`, `console_decision`. H1↔H2 differential "collapses at full scroll."
World-class state: A defined type ramp with optical sizing where each tier commands from three feet.
Why it matters: Flat scale is why pages read as "styled README" rather than designed experience.
Expected impact: Systemic hierarchy lift across all 58 routes.
Severity: High | Visual impact: 7 | Effort: M | Confidence: High

---

**#11 Resolve the dual-axis layout — commit to a single optical spine**
Current state: Left-aligned hero flips to centered body mid-scroll with no signal on `architecture`, `how-it-works`, `playground`. "The page has no single optical spine… assembled from two templates."
World-class state: One committed alignment system per page.
Why it matters: An axis shift mid-scroll is the worst structural optical flaw the ledger names on multiple routes.
Expected impact: Unifies composition on the architecture/how-it-works/playground spine.
Severity: High | Visual impact: 7 | Effort: M | Confidence: High

---

**#12 Eliminate verbatim duplicate copy (hero subtitle = "The problem" body)**
Current state: The exact same sentence appears 2–3 times on `recipes_block-dangerous-commands`, `cap-token-spend`, `gate-prod-deploys`, `least-privilege-access`, `over-refund-clamp`, `pause-for-human`, `redact-pii`. "No premium product ships this."
World-class state: Each section advances the argument; zero repetition.
Why it matters: Duplicate text is a hard editorial failure that signals unfinished scaffolding.
Expected impact: Removes a production-defect signal from 7 recipe routes.
Severity: High | Visual impact: 5 | Effort: S | Confidence: High

---

**#13 Replace the full-width announcement banner with integrated release-note treatment**
Current state: A third horizontal band before content on nearly every route — "barely separates from nav," "reads as a second nav stripe," consumes 10–20% of mobile fold.
World-class state: Launch news embedded into the wordmark/identity, not a template growth-marketing strip.
Why it matters: It front-loads noise and pushes the headline below the optical center everywhere.
Expected impact: Recovers prime above-fold real estate site-wide.
Severity: Medium | Visual impact: 6 | Effort: S | Confidence: High

---

**#14 Replace the dark CTA-equals-code-block collision**
Current state: The conversion panel and code blocks share identical dark backgrounds on `blog_stop-agent-draining-prod`, `console_approvals` (CTA = audit chain), `console_tokens` — "primary conversion moment is visually indistinguishable from a code snippet."
World-class state: A tonally and structurally distinct CTA surface that reads as a destination.
Why it matters: The single most important action disappears into surrounding chrome.
Expected impact: Recovers the conversion moment on key blog/console routes.
Severity: High | Visual impact: 6 | Effort: S | Confidence: High

---

**#15 Design a responsive stepper (the horizontal pill-chain breaks at every sub-desktop width)**
Current state: Arrows orphan, labels truncate, flow collapses to a list on tablet/mobile across all `capabilities_*` and `architecture_data-flow`. "Breaks at every sub-desktop breakpoint."
World-class state: Vertical progression or "Step 2 of 4" indicator below desktop; flow metaphor preserved.
Why it matters: The narrative-carrying element becomes empty circles on phones.
Expected impact: Fixes the core explanatory device on ~15 capability routes.
Severity: High | Visual impact: 6 | Effort: M | Confidence: High

---

**#16 Render charts and bars that actually paint (and fall back gracefully)**
Current state: Blank chart rectangles on `console_drift` (desktop timeline), `console_command-risk` (mobile bars), `console_red-team`, `console_dashboard` (illegible thumbnail); ~4px credential-bar stubs with no track on `console_command-risk`, `transparency_pii`, `transparency_command-risk` that "read as a render artifact."
World-class state: Charts with axis rails, baseline tracks, color encoding, and a mobile-safe representation.
Why it matters: A blank chart at page-center destroys console credibility — the worst place for a void.
Expected impact: Restores data legibility and trust on ~7 console/transparency routes.
Severity: High | Visual impact: 7 | Effort: M | Confidence: High

---

**#17 Unify card grammar — collapse the 3–5 coexisting container systems per page**
Current state: "Two/three/four/five card languages on one page" recurs on `architecture`, `architecture_data-flow`, `capabilities_command-risk-guard` (5 styles), `console_integrity` (4-layer nesting), `transparency`. Border + background + shadow doubling.
World-class state: One card primitive with a single radius/elevation token; typography or tonal separation over borders.
Why it matters: Container soup spends the entire contrast budget on chrome, flattening hierarchy.
Expected impact: Coherence lift across capability, console, and transparency routes.
Severity: High | Visual impact: 6 | Effort: M | Confidence: High

---

**#18 Discipline the accent-color system to one semantic palette**
Current state: 3+ competing accent hues with no shared origin — teal/amber/purple on `console_approvals`, `roadmap` (teal vs purple), `introspection`, `deploy` (purple/teal/gray). Purple reused for active-step, GitHub CTA, and ESCALATE icon (`capabilities_access-governance-pack`).
World-class state: One accent with opacity variants; color carries one meaning.
Why it matters: Multi-hue drift signals "no design tokens," the opposite of restraint.
Expected impact: Tightens the palette site-wide; removes semantic confusion.
Severity: Medium | Visual impact: 6 | Effort: M | Confidence: High

---

**#19 Remove the redundant outcome-tag duplication (hero + worked-example)**
Current state: The same six pills render twice within one scroll on `capabilities_incident-response-pack`, `capabilities_smart-approval-engine`, `capabilities_pii-guard`. "Copy-paste, not intentional repetition."
World-class state: One canonical placement; the second instance adds new information or is removed.
Why it matters: Duplication without differentiation halves the signal of each instance.
Expected impact: Reduces density and noise on capability detail routes.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#20 Retire the full-width HR section dividers (Bootstrap/Markdown convention)**
Current state: Hairline rules under every heading on `capabilities_behavioral-drift`, `command-risk-guard` (7 rules), `config-integrity-seal`, `recipes_*`, `transparency_command-risk`, `contribute`. "Become wallpaper, stop communicating structure."
World-class state: Whitespace and type weight alone separate sections.
Why it matters: Mechanical rules fragment the page into equal slabs and read as docs tooling.
Expected impact: Calmer, more editorial rhythm on ~15 routes.
Severity: Medium | Visual impact: 5 | Effort: S | Confidence: High

---

**#21 Convert ISO dates to editorial format and add a featured-post hierarchy**
Current state: `blog` uses "2026-06-04" ("reads as logged, not authored"); all four posts carry identical weight with no featured treatment; "THE ADJUDICATE TEAM" repeats four times.
World-class state: "June 4, 2026," a pinned/featured article, varied entry weights.
Why it matters: Uniform weight + machine dates place the blog at "developer-scaffold level."
Expected impact: Elevates the blog index from changelog to publication.
Severity: Medium | Visual impact: 5 | Effort: S | Confidence: High

---

**#22 Give editorial pages a reading-mode nav (suppress the 8-item product chrome)**
Current state: The full 7–8-item product nav sits above every blog post, "competing with editorial authority," repeated top and bottom on `blog_human-approval-resume`.
World-class state: A minimal editorial header so content breathes; luxury blogs suppress chrome.
Why it matters: Heavy chrome dilutes reading focus on long-form routes.
Expected impact: Lifts every blog route toward editorial-grade.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: High

---

**#23 Make the comparison table the visual centerpiece it claims to be**
Current state: On `comparisons`, the table — the core argument — "receives the least visual investment," is data-sparse, has no banding/cell delineation, and collapses to a single column on mobile (argument invisible).
World-class state: A bold, structured, responsive comparison table that demonstrates the six outcomes vs binary engines.
Why it matters: The page's entire wedge is its weakest, most-broken element.
Expected impact: Turns the strongest argument into the strongest visual.
Severity: High | Visual impact: 7 | Effort: M | Confidence: High

---

**#24 Replace placeholder/empty-state boxes with real empty states or content**
Current state: Hollow bordered boxes on `console_tokens` (SESSION BUDGETS, BUDGET-EXHAUSTION), `console_approvals` (audit chain), `console_integrity`, `capabilities` (3 of 4 families empty), `transparency` (Operations void). "Identical to broken components."
World-class state: Calm typeset empty states, or populated sections — never a bordered void.
Why it matters: An empty box with a section label reads as a failed load and destroys trust.
Expected impact: Removes "broken" signals from console and capabilities routes.
Severity: High | Visual impact: 6 | Effort: M | Confidence: High

---

**#25 Handle raw SHA-256 / hex strings with truncation, copy affordance, and de-emphasis**
Current state: Full 64-char hashes render full-width and "optically heavier than any heading," wrapping mid-value to collapse the label/value grid on `console_ai-bom`, `transparency_ai-bom`, `console_decision`, `console_audit-explorer`.
World-class state: Ellipsis + tooltip + copy button; hashes recede as monospace metadata.
Why it matters: Raw hashes invert information hierarchy at every scroll position.
Expected impact: Restores readable hierarchy on all hash-bearing console/transparency routes.
Severity: Medium | Visual impact: 6 | Effort: S | Confidence: High

---

**#26 Tame the all-caps tracked-label overload (one register, not five)**
Current state: Identical all-caps tracking for breadcrumbs, eyebrows, section headers, tabs, column headers, banners — "one treatment for five hierarchy levels" on `console_audit-explorer`, `console_integrity`, `transparency*`, `capabilities*`.
World-class state: Distinct treatments per level; sentence-case where Linear/Stripe would use it.
Why it matters: A single overloaded register collapses hierarchy into monotone shouting.
Expected impact: Differentiates label tiers site-wide.
Severity: Medium | Visual impact: 5 | Effort: S | Confidence: High

---

**#27 Suppress internal engineering notation (ADR-### / governance.driftHistory) on public surfaces**
Current state: "ADR-130," "governance.behavioralDrift," "deployment.rollback.execute" leak as user-facing labels on `console_ai-bom`, `console_drift`, `capabilities_*`, `console_approvals`.
World-class state: Internal references hidden or in tooltip-only metadata.
Why it matters: Exposed internal decision-record numbering cheapens a premium surface.
Expected impact: Cleaner public-facing labels across console/capabilities.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#28 Optically center icons and numerals (cap-height midpoint, not baseline)**
Current state: Sub-pixel mis-centering called out repeatedly — shield icon "sinks below the heading" (`transparency_integrity`), stat numerals pushed down by dot+label top-mass (`console_dashboard`), trend arrow floats low (`transparency_drift`), badge dots mis-centered (`console_audit-explorer`), pill icons high (`capabilities_command-risk-guard`).
World-class state: Optical alignment to visual center of mass, not mathematical bounds.
Why it matters: Sub-pixel float is precisely what separates "capable SaaS" from Apple-grade.
Expected impact: Systemic precision lift on every component using icon+text or stat tiles.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: High

---

**#29 Differentiate "absent status" from "positive status" in badge semantics**
Current state: UNSIGNED uses the same pill style as EU-AI-ACT / GOLD tier (`console_ai-bom`, `transparency_ai-bom`); "Signed: no" relies on red color alone at small size. False equivalence between unrelated attributes.
World-class state: Distinct treatment (and sufficient weight) for negative/absent states.
Why it matters: Conflating "verified" with "unsigned" undermines the entire trust claim.
Expected impact: Sharpens the signing/trust narrative on BOM and integrity routes.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#30 Reclaim the empty right 40% of desktop (single-column on widescreen)**
Current state: Right two-thirds vacant on `comparisons`, `transparency_drift`, `transparency_integrity`, `transparency_pii`, `introspection`, `home` (tablet), `recipes_cap-blast-radius`. "Reads as a half-finished two-column layout."
World-class state: Intentional asymmetry, a data tile, sticky outline, or composed editorial edge.
Why it matters: Unused canvas reads as an abandoned grid, not Stripe-grade restraint.
Expected impact: Composes the widescreen canvas across ~7 routes.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: Medium

---

**#31 Replace the faux-browser worked-example mock cards with clean prose/diagrams**
Current state: Nested mock-UI "three container levels deep" — illegible on mobile on `capabilities_agent-memory-store`, `capabilities_policy-coherence-analyzer`. "Generic-SaaS explainer anti-pattern."
World-class state: A clean diagram or prose treatment that survives at 390px.
Why it matters: The explanatory artifact becomes pure noise at the most common width.
Expected impact: Recovers comprehension on memory-store and analyzer routes.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: High

---

**#32 De-escalate decorative danger framing (pink tint + red triangle + red badge)**
Current state: Three co-located danger signals in one small card on `architecture` — "a visual alarm, not calibrated contrast." Red-tinted code block washes on `capabilities_token-budget-guard` ("semantic error color repurposed decoratively").
World-class state: Contrast achieved typographically; semantic color reserved for meaning. "Apple achieves contrast typographically, never with tinted fills."
Why it matters: Decorative red breaks the color-meaning contract and reads as generic SaaS danger.
Expected impact: Calms the architecture comparison and token-budget routes.
Severity: Medium | Visual impact: 5 | Effort: S | Confidence: High

---

**#33 Deduplicate CTAs that repeat within one scroll**
Current state: "Open the console replica" appears twice within ~300px on `capabilities_ai-bom`, `config-integrity-seal`, `smart-approval-engine`; dual primary CTAs in nav. "Signals lack of conviction."
World-class state: One committed CTA placement per section.
Why it matters: Duplicate CTAs dilute intent and cheapen both instances.
Expected impact: Sharpens conversion intent on capability routes.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#34 Add page-resolution/closure devices (footers that land, not trail off)**
Current state: Pages "stop rather than resolve" — lone wordmark footers, ~10px illegible footer text, no closing CTA on `architecture`, `blog`, `recipes_*`, `console`, `deploy`. "The page ends rather than resolves."
World-class state: A confident closing section, next-recipe rail, or terminal device.
Why it matters: Premium editorial always resolves the journey; abrupt ends read as unfinished.
Expected impact: Gives every long route a designed conclusion.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: Medium

---

**#35 Build a deliberate tablet breakpoint (stop shipping squashed desktop)**
Current state: "Tablet is a width-compressed desktop" on virtually every route — no type-scale retuning, no recomposition, orphaned pills, wrapping badges.
World-class state: Tablet treated as first-class with its own column logic and type ramp.
Why it matters: The ledger flags unadapted tablet as a luxury rejection on ~40 routes.
Expected impact: Lifts the middle breakpoint site-wide.
Severity: Medium | Visual impact: 5 | Effort: L | Confidence: High

---

**#36 Constrain prose measure to 55–65 characters**
Current state: Body copy runs ~90 chars/line on `capabilities_release-gating`, `behavioral-drift`, `transparency_command-risk` ("beyond optimal 60–75; Apple caps ~680px").
World-class state: A max-width reading column tuned to ~60ch.
Why it matters: Over-wide measure undermines reading comfort and signals unfinished layout.
Expected impact: Better readability and intentionality on long-form routes.
Severity: Low | Visual impact: 4 | Effort: S | Confidence: High

---

**#37 Fix the inverted Gestalt proximity on section breaks (rules/labels hug the wrong element)**
Current state: Section labels sit farther from their heading than from prior content (`architecture`, `capabilities_access-governance-pack`); HR rules sit closer to body than heading, "inverting grouping" on `capabilities_token-budget-guard` (named worst flaw).
World-class state: Spacing groups labels with what they label; rules (if any) hug headings.
Why it matters: Inverted proximity mis-signals grouping at every section break.
Expected impact: Corrects scan logic across capability routes.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#38 Right-size and balance two-column provenance cards**
Current state: Left/right provenance cards carry unequal content (short ADR vs long monospace path), creating "asymmetric weight, right reads as placeholder" on `capabilities_ai-bom`, `config-integrity-seal`, `hallucination-scoring`, `red-team`, `console_red-team`.
World-class state: A balanced key/value row or matched-weight pair; no card-as-empty-container.
Why it matters: Lopsided pairs read as broken or unfinished data.
Expected impact: Cleaner provenance sections on ~6 capability/console routes.
Severity: Low | Visual impact: 3 | Effort: S | Confidence: High

---

**#39 Add intermediate type/tonal ramp between eyebrow and H1**
Current state: "Extreme jump with no intermediate beat" — eyebrow to bold H1 with no transitional step on `capabilities_incident-response-pack`, `agent-memory-store`, `console_dashboard`.
World-class state: A composed beat between category label and headline.
Why it matters: Abrupt weight cliffs read as accidental, not authored.
Expected impact: Smoother hero entry across capability routes.
Severity: Low | Visual impact: 4 | Effort: S | Confidence: Medium

---

**#40 Resolve the V1 wordmark badge as a designed element (or remove it)**
Current state: "Unresolved grey rectangle that cheapens the logotype," floats above wordmark baseline; duplicates version info already in banner/footer on `architecture_data-flow`, `roadmap`, `console`, `home`.
World-class state: Either an integrated, optically centered version mark or omission/tooltip-only.
Why it matters: A boxy chip at the point of brand recognition is debris on the most-seen element.
Expected impact: Cleans the brand lockup on every route.
Severity: Low | Visual impact: 3 | Effort: S | Confidence: High

---

**#41 Reconcile mixed directional glyph grammar (← breadcrumb vs → CTAs)**
Current state: Left-arrow breadcrumbs and right-arrow card CTAs coexist with mismatched weights; arrows optically heavier/lighter than their labels on `capabilities`, `blog`, `console_decision`, `console_drift`.
World-class state: A single icon set with weight-matched, optically aligned glyphs (custom chevrons, not Unicode).
Why it matters: Plain Unicode arrows "register as copy-paste affordance," not craft.
Expected impact: Consistent, refined wayfinding glyphs site-wide.
Severity: Low | Visual impact: 3 | Effort: S | Confidence: High

---

**#42 Tune dark-on-dark console nesting to create depth (light model)**
Current state: 3–4 nested dark registers (black page, dark card, dark mock) "with no tonal separation," flat 1px borders, no elevation on `console`, `console_decision`, `console_integrity`, `console_ai-bom`.
World-class state: A surface hierarchy with tonal steps and a coherent light model.
Why it matters: Flat dark nesting reads as a CLI emulator, not a premium dark UI.
Expected impact: Depth and craft on all dark console routes.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: Medium

---

**#43 Soften the pure-black ↔ pure-white card polarity**
Current state: White card on raw `#000` page with no easing — "harsh contrast band," "reads cheap, no design intent" on `console`, `console_dashboard`, `console_decision`, `console_audit-explorer`.
World-class state: Near-black / slight off-white surfaces with an eased transition.
Why it matters: The unmodulated polarity snap reads as an unstyled default.
Expected impact: A more intentional, premium tonal feel on console pages.
Severity: Low | Visual impact: 4 | Effort: S | Confidence: Medium

---

**#44 Add a primary CTA to pages that have none**
Current state: No CTA / next-step on `contribute`, `console`, several `recipes_*` — "no momentum," "no next action."
World-class state: Every page directs to a clear next action (GitHub, console, next recipe).
Why it matters: Dead-end pages waste the visitor and forfeit conversion.
Expected impact: Adds forward motion to ~5 currently terminal routes.
Severity: Medium | Visual impact: 4 | Effort: S | Confidence: High

---

**#45 Replace generic icon-card "VIEW →" patterns with editorial/typographic separation**
Current state: Bordered icon-title-description-VIEW cards (Notion/Intercom default) with four identical "VIEW →" links on `transparency`; "VIEW → is typographic dead weight."
World-class state: Open columns or optical separators; differentiated affordances per destination.
Why it matters: The template card pattern caps the transparency index at generic SaaS.
Expected impact: Elevates the governance index toward premium.
Severity: Low | Visual impact: 4 | Effort: M | Confidence: Medium

---

**#46 Add an annotation/callout layer to code-heavy recipe and blog routes**
Current state: 60% wall-of-code with "no annotation or structural break," no pull quotes or callouts across `recipes_*` and `blog_*`. "Raw Markdown render throughout."
World-class state: Annotated code with highlighted lines, callouts, and outcome summaries (Stripe/Linear).
Why it matters: Unannotated code dominates and buries the value argument.
Expected impact: Persuasive lift on every code-first route.
Severity: Medium | Visual impact: 5 | Effort: M | Confidence: Medium

---

**#47 Add a sticky nav / scroll-progress affordance on long pages**
Current state: 6,000px+ pages (`comparisons`, `blog`, `home` at 13,000–19,000px) leave "the reader spatially stranded" with no anchor.
World-class state: A sticky minimal nav or progress indicator on long-form/long-scroll routes.
Why it matters: Apple/Linear always give a spatial anchor on long scrolls.
Expected impact: Orientation and usability on the longest routes.
Severity: Low | Visual impact: 3 | Effort: M | Confidence: Medium

---

**#48 Constrain the announcement banner and nav stack on mobile (recover the fold)**
Current state: Banner + nav + breadcrumb consume up to ~30% of mobile fold; banner wraps to 2–4 lines on `comparisons`, `capabilities_incident-response-pack`, `console_approvals`, `transparency_pii`.
World-class state: Collapse or hide the banner at mobile; trim the chrome stack.
Why it matters: Triple-band chrome buries product value before it's read on phones.
Expected impact: Recovers mobile above-fold across the site.
Severity: Medium | Visual impact: 5 | Effort: S | Confidence: High

---

**#49 Add micro-interactions and hover/active states (currently absent)**
Current state: "No hover states or interaction affordances visible," static wrappers around one animated element on `console`, `recipes`, `blog`; non-interactive chevrons imply false affordance on `contribute`, `console_ai-bom`.
World-class state: Considered hover/active states; chevrons only where interaction exists.
Why it matters: Zero microinteraction signal reads as a static document, and false affordances mislead.
Expected impact: A premium tactile layer site-wide; removes ghost-affordance confusion.
Severity: Low | Visual impact: 4 | Effort: M | Confidence: Medium

---

**#50 Tighten display-headline tracking (browser-default at large sizes)**
Current state: "Headline tracking feels browser-default," "no optical sizing," "loose utilitarian feel" on `blog_cap-token-spend`, `console`, `roadmap`, `console_integrity` ("nothing signals precision infrastructure").
World-class state: Negative tracking at display sizes with optical-size tuning, the way Apple tightens large type.
Why it matters: Untuned large type is a subtle but pervasive "not-luxury" tell on every hero.
Expected impact: A refined, intentional headline feel across all 58 routes.
Severity: Low | Visual impact: 4 | Effort: S | Confidence: Medium
