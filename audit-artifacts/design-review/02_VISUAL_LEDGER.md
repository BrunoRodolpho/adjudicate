# Route-by-Route Visual Ledger

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

I'll write the route-by-route visual ledger from the grounding JSON. Let me work through all 58 routes, grouped by area.

## Home / Core

### home
A confident hero that collapses into an empty page body across every viewport — strong open, near-zero follow-through.
**Scores:** composition 3 · hierarchy 3 · typography 4 · color 3 · craftsmanship 3 · **premium 28**
**Eye-path:** gradient "beyond block-or-allow" headline → purple "Try the 5-min demo" CTA → monospace code block pulling the eye down.
**Worst flaw:** the page body below the hero is an unbroken off-white void spanning 80–95% of the canvas (13,000px desktop, 20,000px mobile) — no sections, no social proof, no reason to scroll.
**Best moment:** the gradient "beyond block-or-allow" accent paired with the soft radial purple bloom — keynote-grade.
**Responsive:** desktop fold is genuinely premium (7s across), but full-page desktop, tablet, and mobile all degenerate into the same massive blank canvas; mobile's purple CTA button is the one confident survivor.

### how-it-works
Well-written educational page with a strong typographic thesis, undermined by a monotonous six-frame grid and diagram cards that go illegible below desktop.
**Scores:** composition 5 · hierarchy 6 · typography 7 · color 5 · craftsmanship 5 · **premium 44**
**Eye-path:** violet/black two-line thesis mid-viewport → H1 "The mechanism, frame by frame." upper-left → diagram card below the thesis.
**Worst flaw:** six structurally identical two-column frames with zero rhythm variation read as a documentation dump — no density contrast, no color progression, no surprise; plus a near-empty "THE ARTIFACT" closing section.
**Best moment:** the two-line thesis split — black "LLMs generate possibilities." over violet "Production systems require decisions." — color as semantic syntax.
**Responsive:** desktop fold is the strongest crop (the scale jump between left-aligned H1 and centered thesis makes it feel like two pages); tablet over-pads each stacked frame into punishing length; mobile renders every diagram card as illegible grey noise.

### introspection
A competent editorial depth-page with a strong voice and polished nav, undone by a duplicate headline and an unfinished scatter plot.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 5 · craftsmanship 6 · **premium 47**
**Eye-path:** H1 "Your policy is no longer a black box." → lead paragraph → the empty right column where a diagram should be.
**Worst flaw:** the scatter plot has no container, near-invisible axes, and no mobile fallback — reads as a prototype, undermining the technical credibility the page exists to establish.
**Best moment:** dark CTA footer with "your operators dispose." in green italic against a high-contrast black break — the most brand-confident decision on the page.
**Responsive:** desktop carries a disorienting duplicate H1 and a hero right-column void persisting for multiple viewport-heights; tablet is the cleanest (void disappears by necessity, but legend outsizes the chart); mobile shrinks the scatter plot to ~4–5px dots that communicate nothing.

### deploy
Technically credible developer docs with strong copywriting and clean code presentation, undercut by an empty hero right half and a total absence of any CTA.
**Scores:** composition 6 · hierarchy 6 · typography 7 · color 7 · craftsmanship 6 · **premium 52**
**Eye-path:** H1 "It runs in your request path, before the side-effect." → GitHub CTA pill in nav → first dark code block under Library/in-process.
**Worst flaw:** the hero right half is entirely empty across every viewport — no illustration, diagram, or code preview — wasting the most valuable compositional real estate.
**Best moment:** H1 "It runs in your request path, before the side-effect." — sharp developer copy at commanding scale delivering the core differentiator in one sentence.
**Responsive:** desktop adds a ~200px dead whitespace chasm between hero and Library; tablet keeps a cramped three-column Runnable Examples grid that should break to two; mobile traps long TypeScript lines in horizontal scroll with zero CTA on the most conversion-critical viewport.

## Capabilities

### capabilities
A promising capability index with a strong card pattern severely undermined by three of four sections rendering empty.
**Scores:** composition 3 · hierarchy 4 · typography 5 · color 5 · craftsmanship 3 · **premium 28**
**Eye-path:** H1 "14 capabilities, four families." → three-column card grid under "Content & data safety" → ADR and Tier badge pills.
**Worst flaw:** three of four capability families show only a heading and subtitle with no cards, creating hundreds of pixels of blank off-white that reads as broken on every viewport.
**Best moment:** the ADR-number + Tier-badge dual-corner card treatment — concise, information-dense, communicates engineering rigor.
**Responsive:** desktop fold's badge pills are an uncoordinated pastel rainbow (Tailwind defaults, not a token system); tablet's 2+1 reflow orphans the third card; mobile orphans the H1's terminal period as a widow and compresses badge labels into illegible blobs.

### capabilities_access-governance-pack
Strong above-fold identity with semantic pills and stepper dissolves below the fold into a gray prose column.
**Scores:** composition 6 · hierarchy 7 · typography 7 · color 7 · craftsmanship 7 · **premium 42**
**Eye-path:** H1 "Access-governance pack" → semantic color-coded outcome pills → purple "Guard decides" stepper.
**Worst flaw:** everything from "What it does" onward is near-uniform gray prose — H2s barely outweigh body text, no diagrams or syntax highlighting, no copy affordances — making 70% of a long page feel like unstyled HTML.
**Best moment:** the outcome pill row (DEFER/REWRITE/ESCALATE/REFUSE/EXECUTE) with matched icon and border color per type — a genuine design-system moment.
**Responsive:** desktop fold opens strong (~200px dead gap aside); tablet wraps pills to three noisy rows and loses the Provenance two-column; mobile expands pills to 4–5 rows that hijack the fold while the stepper arrows vanish.

### capabilities_agent-memory-store
A structurally sound capability doc with a clean typographic base and one polished component (the stepper), presenting as a formatted markdown page.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 5 · craftsmanship 6 · **premium 34**
**Eye-path:** H1 "Agent memory store" → purple GitHub CTA pill → 4-step stepper with filled purple active step.
**Worst flaw:** the fold wastes the entire right half of the viewport — no illustration, code, or diagram — leaving the first impression as a left-aligned text block on a gray void.
**Best moment:** the 4-step stepper with active "Guard decides" purple pill — matches the nav CTA and communicates sequential flow instantly.
**Responsive:** desktop is a flat single-column doc with a low-res worked-example diagram; tablet compresses that diagram toward illegible flow-node labels; mobile wraps the tag cluster into a 3-row pill soup.

### capabilities_ai-bom
A competent, trust-signalling documentation page with genuine typographic moments but no editorial ambition — diligently built rather than designed.
**Scores:** composition 6 · hierarchy 6 · typography 6 · color 5 · craftsmanship 6 · **premium 38**
**Eye-path:** bold H1 "AI bill-of-materials" → solid-purple "Guard decides" step pill → dark terminal block mid-page.
**Worst flaw:** the ~140px dead-space between hero subtitle and tag cluster on every viewport reads as an unresolved gap, deflating the opening at all breakpoints.
**Best moment:** the Provenance two-column card — tracked small-caps labels, hairline rule, monospace package name — the only component that feels elite-team considered.
**Responsive:** desktop fold's purple GitHub CTA outpulls every content element; tablet is a proportional desktop shrink with no medium-specific thinking; mobile's all-caps tag micro-text drops at/below legibility at 375px.

### capabilities_behavioral-drift
Technically credible with a polished terminal block and restrained color system, undermined by a large unexplained header void and flat section hierarchy.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 6 · craftsmanship 6 · **premium 52**
**Eye-path:** "Behavioral drift" H1 → multi-hue tag pill cluster → dark terminal console block.
**Worst flaw:** the ~200px void between subtitle and tag cluster on desktop reads as a missing hero element never filled, undercutting the premium first impression everywhere.
**Best moment:** the terminal "Worked example" block — amber monospace on near-black with a "CLEARED / DECISION KIND" summary bar — Stripe-documentation quality.
**Responsive:** desktop fold's right half is a large void; tablet survives the Provenance two-column without stacking (a quiet win); mobile shrinks terminal monospace to near-illegible but the multi-hue pill system survives all four viewports intact.

### capabilities_command-risk-guard
A technically credible capability reference with strong IA and a standout pill system, held back by dead fold space and a flat single-column layout.
**Scores:** composition 6 · hierarchy 6 · typography 7 · color 6 · craftsmanship 6 · **premium 42**
**Eye-path:** H1 "Command-risk guard" → four colored outcome pills → numbered stepper with active purple "Guard decides".
**Worst flaw:** the ~150px dead vertical zone between subtitle and first pill row — reads as a removed section whose spacing was never adjusted, and it's the first impression after the hero.
**Best moment:** four semantic outcome pills (EXECUTE green, REQUEST CONFIRMATION teal, REWRITE orange, REFUSE red) — the entire decision space in one scannable glance.
**Responsive:** desktop never differentiates sections (identical text blocks); tablet compresses the worked-example table to near-illegibility; mobile stacks pills into three rows and drops the monospace table sub-12px with no scroll affordance.

### capabilities_config-integrity-seal
A thorough technical doc that reads as documentation, not a product showcase — competent but under-designed.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 5 · craftsmanship 6 · **premium 42**
**Eye-path:** H1 "Configuration integrity seal" → colorful tag/badge cluster (ADR-121, EXECUTE, REFUSE) → active purple "Guard decides" stepper pill.
**Worst flaw:** the desktop hero leaves the entire right ~42% of the viewport blank white — it looks like a broken two-column layout missing its right panel.
**Best moment:** the step-stepper with its active purple "Guard decides" pill — the single most intentional UI element across all viewports.
**Responsive:** desktop wastes 40–45% of the canvas; tablet is ironically the most balanced (full-width console block finally anchors); mobile compresses the announcement banner to near-illegibility and degrades the stepper to a vertical badge list.

### capabilities_hallucination-scoring
A functional documentation page with one polished component anchoring an otherwise sparse layout undermined by dead-air spacing.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 6 · craftsmanship 6 · **premium 38**
**Eye-path:** "Hallucination scoring" H1 → stepper widget with active purple pill → "What it does" heading below the divider.
**Worst flaw:** the ~200px dead-air gap between subtitle and tag row, present on every viewport, looks like a missing content block and destroys trust before any content is read.
**Best moment:** the four-step stepper with active purple pill, arrow connectors, and inline context text — the one genuinely premium component.
**Responsive:** desktop leaves the right half empty with five tag/chip styles and no encoding rule; tablet actually tames the whitespace (near-ideal line length); mobile renders the worked-example console output at desktop font-size — completely illegible.

### capabilities_incident-response-pack
A technically credible developer-documentation page that prioritizes information completeness over visual craft.
**Scores:** composition 6 · hierarchy 5 · typography 6 · color 6 · craftsmanship 6 · **premium 34**
**Eye-path:** H1 "Incident-response pack" → colorful outcome pill cluster → 4-step stepper with violet "Guard decides".
**Worst flaw:** a ~120px structurally unexplained dead zone between subtitle and pill cluster on every viewport, making the above-fold read as broken or half-loaded.
**Best moment:** the Provenance split card — ADR number left, monospace package path right — the most resolved, developer-appropriate moment.
**Responsive:** desktop fold's outcome pills appear faded (decoration, not semantic signal); tablet makes the dead zone proportionally larger; mobile cramps the 4-step stepper so connectors and labels lose legibility and wraps the monospace path awkwardly.

### capabilities_pii-guard
A technically competent capability page with strong documentation DNA and one genuinely crafted component (the decision panel).
**Scores:** composition 5 · hierarchy 6 · typography 7 · color 6 · craftsmanship 7 · **premium 42**
**Eye-path:** H1 "PII / data-classification guard" → tag cluster row (ADR-117, SHIPPED·TIER 1, action pills) → 4-step stepper with violet "Guard decides".
**Worst flaw:** the ~150px dead-air gap between subtitle and tag/metadata row makes the page look incomplete across all three viewports — the first impression every visitor gets.
**Best moment:** the DECISION/REWRITE/REASON terminal panel — two-column input/output anatomy with semantic color tinting on the reason block and realistic code.
**Responsive:** desktop's color palette is under-deployed (90% monochrome below the fold); tablet holds the decision panel's two-column anatomy cleanly; mobile ports rather than designs — terminal code near the edge of legibility, no progressive disclosure.

### capabilities_policy-coherence-analyzer
A technically competent documentation page that never crosses into product design — rigorous and readable but forgettable, for a concept that demands a diagram.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 5 · craftsmanship 5 · **premium 31**
**Eye-path:** H1 "Policy-coherence analyzer" → stepper pipeline card → tag cluster pill outlines.
**Worst flaw:** the fold's right half is a ~45% white void at every viewport wider than mobile — signaling "layout abandoned mid-build" at the exact moment it must impress.
**Best moment:** the four-step stepper card with pill steps, arrows, bold active state, and descriptor sentence — the one deliberately designed component.
**Responsive:** desktop is Wikipedia-grade single-column with a strong three-column Worked-example card; tablet is a pixel-squished desktop; mobile wraps the tag cluster into three ragged rows where the grouping logic goes fully opaque.

### capabilities_red-team
Structurally sound capability docs with a coherent token system and considered components, undercut by a wasteful desktop layout and an illegible Worked example.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 5 · craftsmanship 6 · **premium 42**
**Eye-path:** "Red Team" H1 → two-row color-coded tag pill cluster → stepper card with purple-filled "Guard decides".
**Worst flaw:** the ~200px void between subtitle and tag pills reads as a broken layout or failed lazy-load at every breakpoint — an immediate low-polish signal at the most-seen part of the page.
**Best moment:** the tag pill cluster (ADR ref + tier + package path + action verbs) — color-coded semantic layering communicating system rigor at a glance.
**Responsive:** desktop leaves the right half empty and the worked-example bar chart illegible; tablet is a width-shrunk desktop with the terminal block becoming a black box of illegible data; mobile clips/overflows that terminal block horizontally and breaks the stepper arrows across rows.

### capabilities_release-gating
Structurally sound developer-docs with professional bones, undermined by a dominant dead-space gap, unharmonized badge colors, and unresponsive code blocks.
**Scores:** composition 6 · hierarchy 7 · typography 7 · color 6 · craftsmanship 6 · **premium 47**
**Eye-path:** "Release-gating extensions" H1 → purple GitHub CTA in nav → orange REWRITE terminal block mid-page.
**Worst flaw:** the ~280px dead-space gap between subtitle and badge row dominates above-the-fold on every viewport and reads unmistakably as a layout collapse.
**Best moment:** the Provenance two-column card pairing ADR-116 with the implementing package path — clean structure, correct typographic hierarchy, instantly scannable.
**Responsive:** desktop's five outcome badges use 5 hues with no token logic; tablet wraps the implementing-package path mid-string (a technical-text failure); mobile overflows the worked-example code blocks horizontally — the most load-bearing content breaks.

### capabilities_smart-approval-engine
A competent developer-docs page with clean typography and one strong micro-component, but lacking visual ambition and wasting the desktop canvas.
**Scores:** composition 4 · hierarchy 6 · typography 6 · color 5 · craftsmanship 6 · **premium 34**
**Eye-path:** H1 "Smart approval engine" → ESCALATE/EXECUTE/REFUSE tag pill cluster → dark terminal "Worked example" block.
**Worst flaw:** the desktop layout leaves roughly 40% of the horizontal canvas above the fold completely empty — half-designed at the viewport where it should shine.
**Best moment:** the ESCALATE/EXECUTE/REFUSE pill cluster with color-coded icons and pastel fills — the most refined, semantically purposeful micro-component.
**Responsive:** desktop hugs a 700px column with dead margins (reads like markdown); tablet's narrower width tames the dead right-margin and wraps pills cleanly; mobile clips the 4-step stepper so only "Console shows" is readable — a functional failure.

### capabilities_token-budget-guard
A competent developer documentation page that communicates clearly but fails the keynote bar — incoherent color system, wasted whitespace, and desktop craft that doesn't survive mobile.
**Scores:** composition 6 · hierarchy 7 · typography 7 · color 5 · craftsmanship 7 · **premium 44**
**Eye-path:** H1 "Token-budget guard" → purple active stepper pill "Guard decides" → tag pill cluster metadata.
**Worst flaw:** the ~250px dead gap between hero subtitle and tag pill cluster on desktop fold reads as unfinished, signaling "built rather than designed."
**Best moment:** the four-step arrow-chain stepper with the purple-highlighted "Guard decides" step — the one component that would survive a Stripe/Linear review.
**Responsive:** desktop is flat gray monotone with a salmon error block as the only color-temperature shift; tablet is a mechanical reflow showing full nav without a hamburger (latent breakage); mobile overflows the code block horizontally and collapses the stepper arrow-chain into a list.

## Recipes

### recipes
A functional reference directory with solid fold typography that collapses into an undifferentiated, density-heavy card inventory.
**Scores:** composition 5 · hierarchy 4 · typography 5 · color 5 · craftsmanship 5 · **premium 34**
**Eye-path:** H1 "Guardrail Recipes — solution-focused patterns" → colored tag pills on first card row → individual card titles.
**Worst flaw:** all eight recipe cards sit at identical visual weight with no featured item, progressive disclosure, or visual relief — a raw database export, not a curated surface.
**Best moment:** the above-the-fold desktop view — announcement bar, clean nav, generous whitespace, and editorial em-dash H1 — a credible first impression the rest can't sustain.
**Responsive:** desktop is a flat three-column inventory dump; tablet's two-column collapse wraps monospace paths across lines (uncontrolled, not designed); mobile stacks nine text-heavy cards with sub-44px "open recipe" tap targets and no dividers.

### recipes_block-dangerous-commands
A technically competent but editorially unfinished recipe page — a confident fold the scrolled and mobile experiences immediately undercut.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 5 · craftsmanship 5 · **premium 28**
**Eye-path:** H1 "Block or sanitize dangerous shell commands" → purple GitHub CTA → teal/blue tag pill cluster below the empty gap.
**Worst flaw:** the intro paragraph is duplicated verbatim as the entire "The problem" body — reads as an unfilled template and destroys credibility at the moment readers need the use case explained.
**Best moment:** the above-the-fold desktop composition — announcement bar, active Recipes nav state, bold H1, purple GitHub button — holds up to developer-tools standards.
**Responsive:** desktop fold (7s across) is the high point; tablet's H1 wraps to three lines and loses commanding presence; mobile is a critical regression — content stops after "The problem" with a ~1000px blank void where the code block should be.

### recipes_cap-blast-radius
A well-written recipe concept delivered in a half-finished layout — a blank hero void, an empty right half on desktop, and missing content on mobile.
**Scores:** composition 4 · hierarchy 5 · typography 7 · color 7 · craftsmanship 4 · **premium 22**
**Eye-path:** H1 headline → blank void below subtitle where the eye expects a diagram → ILLUSTRATIVE and ESCALATE pills rescuing attention.
**Worst flaw:** the blank rectangle between hero subtitle and tag pills persists on every viewport and culminates in near-total content blackout on mobile — indistinguishable from a load failure.
**Best moment:** the dark syntax-highlighted code block with amber/green tokens — the only element with genuine visual weight.
**Responsive:** desktop fold's empty rectangle reads as a rendering error and the right half is dead; tablet resolves the wasted right side but keeps the void and orphans "radius" on the H1; mobile blanks ~70% of scroll height.

### recipes_cap-token-spend
A developer-docs skeleton with a polished nav and strong H1, disqualified by duplicate copy, a blank hero, and absent mobile code blocks.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 5 · craftsmanship 4 · **premium 28**
**Eye-path:** H1 "Cap LLM token spend per session" → purple GitHub CTA in nav → dark code block panel mid-page.
**Worst flaw:** mobile code blocks are completely absent, leaving ~80% of the scrollable page blank white — any mobile visitor assumes the page is broken.
**Best moment:** the dark full-width code panel with the "INSTALL" tab label and inline copy button — the one block that feels intentionally developer-premium.
**Responsive:** desktop's hero paragraph is word-for-word identical to "The problem" and 40–50% of full-page height is blank; tablet makes that void proportionally worse; mobile drops both code blocks entirely.

### recipes_gate-prod-deploys
A technically clear recipe page with a confident headline and restrained palette, broken by a hero whitespace void, an unscaffolded code wall, and a critical mobile failure.
**Scores:** composition 5 · hierarchy 6 · typography 7 · color 7 · craftsmanship 5 · **premium 28**
**Eye-path:** H1 headline → three-badge metadata row (teal + peach pills) → dark code block, the only strong value contrast.
**Worst flaw:** mobile is critically broken — roughly 60–70% of the page is a blank white void below "The problem," making the guard code inaccessible with no error feedback.
**Best moment:** the desktop fold — H1 paired with teal "LIVE REAL KERNEL" and peach "REWRITE" pills against the neutral package path — the single moment of genuine visual intentionality.
**Responsive:** desktop fold opens strong but the full page is dominated by a monolithic un-annotated code block; tablet drops code to ~10–11px and overflows the long package path; mobile blanks the guard code and all subsequent sections.

### recipes_least-privilege-access
A technically clear recipe page with a strong headline and solid code block, critically undermined by a content-free bottom half and a mobile render missing its primary content.
**Scores:** composition 4 · hierarchy 5 · typography 7 · color 6 · craftsmanship 4 · **premium 31**
**Eye-path:** H1 headline → the dead-white void below body copy → dark code block, the only high-contrast moment.
**Worst flaw:** the bottom 60% of full-page desktop (larger fractions on tablet/mobile) is blank white with no content — a broken, incomplete page, not a shipped product.
**Best moment:** the dark-background syntax-highlighted code block — well-structured, readable, production-grade — a finish the surrounding page doesn't match.
**Responsive:** desktop wastes the entire right half with no close-out CTA; tablet is a competent reflow with no breakpoint-specific thinking; mobile's "The guard" section and code block appear absent, with the eyebrow below readable-contrast minimum.

### recipes_over-refund-clamp
Sharp headline and clean nav atop an unfinished template — empty right column, duplicated copy, a featureless code wall, and a catastrophic mobile render failure.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 6 · craftsmanship 6 · **premium 28**
**Eye-path:** bold headline "Stop an AI agent from over-refunding" → purple GitHub CTA → teal/orange badge cluster.
**Worst flaw:** the mobile viewport renders blank white for ~80% of page height — all content below "The problem" is missing, making the page unshippable on the most critical traffic surface.
**Best moment:** the desktop headline "Stop an AI agent from over-refunding" — direct, urgent, product-confident copy at keynote weight.
**Responsive:** desktop fold's right half is empty and the subtitle duplicates the body verbatim; tablet is a passive reflow with no touch affordances on the code wall; mobile cuts to nothing mid-story.

### recipes_pause-for-human
A competent documentation template with a confident H1 and clean nav, undone by a dead-zone gap on every viewport and a catastrophic mobile failure leaving 75% of the page blank.
**Scores:** composition 4 · hierarchy 5 · typography 5 · color 4 · craftsmanship 5 · **premium 22**
**Eye-path:** H1 headline → the dead zone below the description where the eye stalls → dark code block terminal re-anchoring via contrast.
**Worst flaw:** the ~150–200px dead zone between the description paragraph and the badge row appears on every viewport, breaking the above-fold narrative at the critical first-impression moment.
**Best moment:** the H1 "Pause an AI agent for human approval and resume it" — sharp copy with enough typographic weight to anchor the page.
**Responsive:** desktop abandons ~55% of canvas with an empty right half; tablet is fluid reflow with no bespoke design; mobile is catastrophic — ~75% blank white, problem section and code block absent.

### recipes_redact-pii
Technically credible recipe page with strong typographic bones undermined by a large unexplained whitespace void and a duplicated description block.
**Scores:** composition 5 · hierarchy 6 · typography 7 · color 6 · craftsmanship 6 · **premium 38**
**Eye-path:** bold ~48px headline → teal/orange badge pills (sole chromatic anchors) → dark full-width code block.
**Worst flaw:** the large blank vertical gap between description and badge row — present on all four viewports, worst on mobile — reads as a rendering failure, eroding trust.
**Best moment:** the full-width dark terminal code block with syntax highlighting — the most confident moment, communicating technical depth.
**Responsive:** desktop's left column at ~40% width creates a persistent right gutter and the body duplicates the hero subtitle; tablet shrinks code too small with no font floor; mobile's blank gap spans 60–70% of viewport height.

## Console

### console
Strong above-the-fold editorial moment collapses immediately into a near-empty stub: one demo widget, one paragraph, then a black void.
**Scores:** composition 3 · hierarchy 3 · typography 5 · color 6 · craftsmanship 4 · **premium 22**
**Eye-path:** white hero card with "Console replicas." snapping against black → AUDIT EXPLORER terminal widget with orange/green badges → single paragraph and "data flow" link, then nothing.
**Worst flaw:** the catastrophic empty black void consuming 60–80% of full-page scroll on every viewport — reads as a render failure and makes the page feel abandoned.
**Best moment:** the desktop fold — white hero card on full-bleed black with tracked "CONSOLE" eyebrow, bold H1, and the dark AUDIT EXPLORER widget peeking with orange/green badges — near keynote quality.
**Responsive:** desktop fold scores 7s across; full-page desktop, tablet, and mobile all collapse into the black void (mobile worst at ~80%, composition 2), with the demo widget shrinking to an unreadable smear on small screens.

### console_ai-bom
A technically sophisticated BOM explorer with strong desktop information design, undermined by a massive empty scroll region and a near-complete mobile content failure.
**Scores:** composition 5 · hierarchy 7 · typography 6 · color 7 · craftsmanship 6 · **premium 47**
**Eye-path:** H1 "AI-BOM explorer." in white hero card → terminal-chrome strip with traffic-light dots and selected pack card → "Signed: no" red anomaly in the metadata grid.
**Worst flaw:** the mobile detail panel is invisible — the entire BOM content disappears below the pack list, leaving ~65% of the page empty black and making the route non-functional on mobile.
**Best moment:** the terminal-chrome strip (macOS traffic-light dots, "AI-BOM · LOCALHOST:5180") and the two-column pack-list + detail-panel split — sells the operator-console premise instantly.
**Responsive:** desktop fold is the strongest (composition 8, color 8); full-page desktop leaves the bottom third empty with placeholder hex values; tablet's single-column reflow makes the metadata grid unscannable; mobile drops the detail panel entirely.

### console_approvals
Strong developer-tool aesthetic with a solid semantic color system and a confident fold, but hard render failures expose this as a prototype, not shippable.
**Scores:** composition 5 · hierarchy 6 · typography 5 · color 6 · craftsmanship 5 · **premium 36**
**Eye-path:** "Approval center." headline in the white hero card → amber warning banner inside the dark console mock → "PENDING 3" active tab and "pix.charge.refund — PENDING".
**Worst flaw:** the Pending Queue content is entirely absent on mobile — the page's primary action surface shows a blank white box under "3 awaiting review," making the most critical feature invisible.
**Best moment:** the desktop fold — white "Approval center." card floating on pure black with the console mock peeking below — editorial and confident, on par with Linear/Vercel docs.
**Responsive:** desktop's Audit Chain is an empty black box and ~35% is dead footer void; tablet shrinks ADR labels to ~8px; mobile blanks the Pending Queue and renders the critical warning banner at ~11px across 5–6 lines.

### console_audit-explorer
A conceptually strong developer-tool aesthetic with a distinctive console widget, undermined by vast dead black space and responsive regression that strips terminal identity.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 6 · craftsmanship 6 · **premium 42**
**Eye-path:** bold "Audit explorer." heading on black → dark console widget with traffic-light chrome and color-coded badge column → teal REPLAY SIMULATION CTA.
**Worst flaw:** the table is not adapted for mobile — HASH header clips to "HAS," hash values fragment across lines, TIME disappears entirely — the core feature is non-functional.
**Best moment:** the console header strip — macOS traffic-light dots, SIMULATED pill, 12/12 RECORDS, teal REPLAY SIMULATION — polished terminal UI fit for a Vercel keynote.
**Responsive:** desktop fold scores high (color 7, craft 7); full-page desktop wastes ~50% on black voids; tablet erases the black full-bleed for generic off-white (a major identity regression); mobile breaks the table outright.

### console_command-risk
Terminal-aesthetic console page with credible chrome details and a sound layout skeleton, fatally undermined by an empty data section, a mobile chart failure, and dead space.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 5 · craftsmanship 6 · **premium 38**
**Eye-path:** "Command risk." H1 on the white card → dark console card with traffic-light dots and green bar chart → three DISPOSITION TOTALS stat tiles (1 / 1 / 2).
**Worst flaw:** the mobile bar chart renders as a blank dark rectangle — the primary data visualization silently disappears, making the page look broken rather than content-sparse.
**Best moment:** the white hero card floating against the full-bleed black nav band at the desktop fold — clean tonal contrast, the only design-conference-ready moment.
**Responsive:** desktop's "BLOCKED COMMANDS 1 TOTAL" section is empty and an ~80px void precedes the hero; tablet adds a ~300px dead zone before the footer; mobile fails the chart and orphans "DISPOSITIONS" onto its own line.

### console_dashboard
A technically coherent dark-console dashboard with a compelling frame, held back by a structural black dead zone above every viewport and an illegible compressed chart at small sizes.
**Scores:** composition 5 · hierarchy 5 · typography 5 · color 6 · craftsmanship 6 · **premium 42**
**Eye-path:** "Dashboard." heading in the white hero card → stacked area chart color-banded mountain in the dark terminal frame → six KPI tiles scanning left-to-right.
**Worst flaw:** the large black empty region above the hero header on every viewport reads as broken rendering and wastes the most valuable screen real estate across all breakpoints.
**Best moment:** the desktop fold — white hero card and dark console frame meeting with hard-edge contrast — the most considered visual decision, communicating the product's dual identity.
**Responsive:** desktop buries the "657 Decisions" aggregate beneath smaller KPI tiles; tablet's 3×2 KPI grid is cleaner than the desktop row; mobile compresses the stacked chart into an illegible striped block.

### console_decision (6b865891…)
Technically competent developer-console doc page with sharp diff artifact detail work, fatally undermined by a systemic blank black void below the content on every breakpoint.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 6 · craftsmanship 6 · **premium 44**
**Eye-path:** "Decision receipt." heading → orange REWRITE badge in console chrome → side-by-side diff with orange "30000" value.
**Worst flaw:** a massive blank black dead zone occupying the lower 40–60% of the full-page render on every breakpoint — looks like a layout rendering failure, not a design choice.
**Best moment:** the PROPOSED vs REWRITTEN side-by-side payload diff with orange-highlighted changed value and hash arrow pill — precise, information-dense developer craft.
**Responsive:** desktop traps content in a ~55% column with huge black side-gutters; desktop fold is the strongest (7s across); tablet expands to near-full width preserving the side-by-side diff (a layout win); mobile stacks the diff cleanly but the void hits its worst at ~60%.

### console_drift
A technically coherent monitoring-console demo with genuine premium details fatally undermined by a systemic blank-space failure and mobile data truncation.
**Scores:** composition 4 · hierarchy 6 · typography 5 · color 6 · craftsmanship 5 · **premium 34**
**Eye-path:** bold "Drift." heading in the white hero card → dark console replica panel → amber "ELEVATED 0.31" badge, the only warm accent.
**Worst flaw:** the massive blank void (black on desktop, white on tablet/mobile) occupying 30–40% of full-page scroll on every viewport — reads as a render failure and dominates at full scroll.
**Best moment:** the "decision.kind TVD 0.31 1+" pill in the Dimensions panel — tight information density with an alert-count badge.
**Responsive:** desktop's timeline panel is blank; desktop fold ends on an incomplete note with the TIMELINE header cut off and no chart; tablet is the most complete (the gold sparkline finally renders); mobile clips the ELEVATED badge to "0" — destroying the severity score.

### console_integrity
Technically coherent integrity surface with strong semantic color and a clever terminal metaphor, let down by an empty kill-switch section and a critically broken mobile table.
**Scores:** composition 5 · hierarchy 5 · typography 5 · color 6 · craftsmanship 6 · **premium 38**
**Eye-path:** "Configuration integrity." heading → dark console panel with traffic-light dots and INTEGRITY chrome → amber Drift row, the only anomalous color.
**Worst flaw:** the ACTIVE SEALS table renders as a blank empty box on mobile, hiding the primary data surface of the entire integrity page — a critical trust failure for a monitoring UI.
**Best moment:** the amber left-border Drift row plus cascading red DIGEST MISMATCH and SIGNATURE FAILED badges — purposeful severity communication showing real signal-design understanding.
**Responsive:** desktop's kill-switch section is a near-empty stats box; desktop fold is the cleanest framing; tablet is a competent shrink with near-illegible digest hashes; mobile blanks the ACTIVE SEALS table and clips the ADR-131 label.

### console_red-team
A strong above-the-fold developer-tool aesthetic that deteriorates sharply on scroll — blank trend chart, dead space, and two non-rendering mobile data sections.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 6 · craftsmanship 5 · **premium 38**
**Eye-path:** "Red team." H1 in the white hero card → green stat row (33 defended · 0 escaped) → green horizontal bar chart in the Attack Categories panel.
**Worst flaw:** the trend chart panel is a blank dark rectangle on every viewport with no axes, lines, or zero-state copy — the most prominent broken element.
**Best moment:** the macOS OS-chrome bar with traffic-light dots and "RED-TEAM · LOCALHOST:5180," paired with the tracked-caps ILLUSTRATIVE REPLICA banner.
**Responsive:** desktop fold is genuinely strong (7s across, green stat pills reassuring); full-page desktop has ~35% empty black below; tablet keeps the blank trend chart; mobile renders two of four data sections empty (composition 4, craft 3).

### console_tokens
Structurally sound dark/light system with purposeful semantic color, but empty panel states, a broken mobile breakpoint, and dead-space zones prevent it reading as shippable.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 6 · craftsmanship 5 · **premium 38**
**Eye-path:** "Token governance." H1 → colored burn bars in TENANT BUDGETS → tenant-stress red -28,600, the most alarming data point.
**Worst flaw:** the mobile breakpoint is a complete failure — both data tables overflow with clipped headers ("REM," "BUDGE") and invisible row data, leaving an empty dark shell with no fallback.
**Best moment:** the desktop fold 50/50 white-card / dark-console split with tenant semantic red/amber/green status visible — the strongest evidence of purposeful, information-rich product design.
**Responsive:** desktop has two fully empty panels (SESSION BUDGETS, BUDGET-EXHAUSTION TIMELINE); tablet is the most data-rich (five populated session rows); mobile breaks both tables (composition 3, craft 2).

## Architecture

### architecture
A technically credible architecture page with one genuinely strong editorial moment severely undermined by a vast mid-page void where the seven primitives content is absent.
**Scores:** composition 4 · hierarchy 4 · typography 6 · color 6 · craftsmanship 5 · **premium 38**
**Eye-path:** bold centered display headline "LLMs aren't trusted. Your database trusts them anyway." → red/blue comparison card pair → KERNEL badge and pill-step flow inside the right card.
**Worst flaw:** massive blank whitespace filling ~one-third of full-page height where SEVEN PRIMITIVES content should live — reads as broken on every viewport, destroying the top section's craftsmanship.
**Best moment:** THE PROBLEM section — bold display headline flanked by semantically color-coded comparison cards (red danger, blue safety) — communicates the core value proposition instantly.
**Responsive:** desktop fold has a twin-headline problem (small H1 vs larger centered display) and an empty hero right half; tablet correctly keeps cards side-by-side (preserving the semantic contrast); mobile stacks them, breaking the simultaneous bad/good argument, and shrinks pill-step labels below WCAG AA.

### architecture_data-flow
A clean, typographically decent architecture page undermined by a prominent missing-diagram void and wireframe-grade pipeline connectors.
**Scores:** composition 5 · hierarchy 6 · typography 7 · color 7 · craftsmanship 5 · **premium 38**
**Eye-path:** H1 "How a decision becomes a durable receipt." → the blank vertical gap below the subtitle where the eye finds nothing → outcome-type pills in the third pipeline card.
**Worst flaw:** the ~250px blank void between hero subtitle and stepper persists across all four breakpoints and fills nearly a full viewport on mobile — a missing illustration everywhere.
**Best moment:** six semantic outcome pills (EXECUTE, REFUSE, ESCALATE, REQUEST_CONFIRMATION, DEFER, REWRITE) with distinct colors — the most deliberate, information-dense moment.
**Responsive:** desktop leaves the right two-thirds empty with wireframe-grade connector pills; desktop fold is well-structured but the gap dominates; tablet's stacked cards point connector arrows sideways into nothing; mobile's gap fills nearly a full viewport height.

## Transparency

### transparency
Typographically credible top-of-fold execution undercut by a broken Operations section and absent mobile card renders that make the lower half look unfinished.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 5 · craftsmanship 4 · **premium 32**
**Eye-path:** H1 "Governance in the open." → bold-lead privacy contract paragraphs ("Aggregates only.") → three-column card grid icon+title row.
**Worst flaw:** Operations section cards fail to render on all viewports and the entire public-view card grid is absent on mobile, leaving white voids that signal a broken build.
**Best moment:** the "THE PRIVACY CONTRACT" bold-lead inline paragraph style — editorial, credible, technically authoritative without bullet lists or icons.
**Responsive:** desktop fold scores high (composition 7, craft 7) but the right half is blank; full-page desktop shows the empty Operations section and ~35% void; tablet's 2×2 card reflow is sound but the lower void worsens; mobile drops every public-view card.

### transparency_ai-bom
A technically earnest compliance page with a strong above-fold that collapses into broken empty card bodies on mobile and a visibly blank second card across all viewports.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 5 · craftsmanship 4 · **premium 31**
**Eye-path:** hero headline "Know exactly what goes into each pack." → inline bold callout in the lead paragraph → compliance badge chips (EU-AI-ACT, NIST-AI-RMF) on the first manifest card.
**Worst flaw:** the pack-identity-kyc manifest card renders as a large empty grey rectangle across desktop, tablet, and mobile — directly undermining the compliance-trust narrative.
**Best moment:** above-fold desktop — headline, inline-bold lead paragraph, and bordered disclaimer panel forming a confident editorial trust sequence approaching documentation-product excellence.
**Responsive:** desktop wastes the canvas with a too-narrow column and tiny compliance chips; desktop fold is the strongest (7s); tablet confirms the broken second card cross-device; mobile renders both manifest cards as empty grey rectangles (craft 2).

### transparency_command-risk
A conceptually honest transparency page with sharp copy that collapses on mobile and squanders the desktop canvas with an empty right half and zero color-semantic risk encoding.
**Scores:** composition 4 · hierarchy 6 · typography 6 · color 4 · craftsmanship 5 · **premium 28**
**Eye-path:** H1 "See what we refuse in the wild." → ILLUSTRATIVE SAMPLE disclaimer card → Destructive bar at near-full width, the only strong data ink.
**Worst flaw:** the risk distribution table is entirely absent on mobile — the page's sole data artifact does not render, leaving a blank void indistinguishable from a JavaScript failure.
**Best moment:** H1 "See what we refuse in the wild." — direct, confident, editorially precise; a tone the visual design doesn't match.
**Responsive:** desktop uses identical dark-grey for all risk bars (Destructive 312 looks no more urgent than Safe 0) and wastes the right half; tablet adds a content-height blank panel below the chart; mobile drops the table and wraps the disclaimer label mid-phrase.

### transparency_drift
Coherent transparency page with clear copy, but it functions as a centered document dropped into a desktop shell with a persistent blank-canvas failure on every viewport.
**Scores:** composition 4 · hierarchy 5 · typography 5 · color 5 · craftsmanship 5 · **premium 32**
**Eye-path:** H1 "Are decisions drifting?" → amber ELEVATED badge → "WHAT THIS SHOWS" card title.
**Worst flaw:** a massive blank gray zone occupying ~40% of the full-page canvas on every viewport — reads as unfinished layout, not intentional negative space.
**Best moment:** the amber trend-arrow icon, "Decision distributions are shifting" title, and ELEVATED badge working as a trio — iconography, color, and copy forming a coherent urgency system.
**Responsive:** desktop's right half is dead space and the purple GitHub CTA clashes with the amber severity system; tablet renders the H1 at its boldest/best scale; mobile drops the "WHAT THIS DOES NOT SHOW" card entirely and wraps the breadcrumb to two lines.

### transparency_integrity
Conceptually clear governance page with correct content hierarchy, fatally undermined by a massive blank void on every viewport and a broken mobile pill row.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 4 · craftsmanship 5 · **premium 28**
**Eye-path:** H1 "Is the configuration intact?" → teal shield + "All packs sealed & verified" → STABLE pill badge resolving the page question.
**Worst flaw:** a blank void of 35–50% total page height between the last content card and the footer on every viewport — unaddressed and unmissable.
**Best moment:** the STABLE → SINGLE INCIDENT → RECURRING INCIDENTS → STORM pill-row severity legend on desktop/tablet — terse, scannable, not a redundant word.
**Responsive:** desktop wastes ~45% of the viewport and styles the key "All packs sealed & verified" answer as plain prose; tablet is ironically the best-composed (ideal line lengths); mobile breaks the severity pill row (arrows orphaned across wraps) and drops the "WHAT THIS DOES NOT SHOW" card.

### transparency_pii
Credible transparency page with clean typography, but a flat monochromatic bar chart, wasted right-column real estate, and a completely missing mobile table leave it forgettable.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 4 · craftsmanship 5 · **premium 38**
**Eye-path:** H1 serif headline "See how sensitive data is contained." → Illustrative sample box border → first table bar (Low Redacted 1842).
**Worst flaw:** the data table is entirely absent on mobile — the page's core purpose is showing PII handling counts, yet on mobile only a headline floats over a blank void.
**Best moment:** the desktop H1 — confident serif with a hard period — the sharpest, most authoritative typographic decision on the route.
**Responsive:** desktop uses identical dark fill for every severity row (Low and Critical indistinguishable) and "Critical Blocked: 29" shows no bar; tablet adds a ~40% blank region below the footer; mobile drops the table entirely (~60% void).

### transparency_red-team
Sound information architecture and a correct semantic badge system undermined by a critical mobile card-rendering failure and a massive whitespace void on all breakpoints.
**Scores:** composition 4 · hierarchy 5 · typography 5 · color 5 · craftsmanship 4 · **premium 28**
**Eye-path:** H1 "Do the defenses hold?" → "WHAT THIS SHOWS" info box → REGRESSED badge on Deployments/Approval, the only warm hue.
**Worst flaw:** pack status cards do not render on mobile, delivering a near-empty page where trust signals matter most — a hard breakage making the route non-functional.
**Best moment:** the teal CLEAN vs coral REGRESSED two-tone badge system — a purposeful, scannable health signal across all non-mobile viewports.
**Responsive:** desktop's ~40% dead zone dominates and the REGRESSED badge under-signals severity; desktop fold is the most polished crop; tablet renders the H1 at its best proportion; mobile blanks the card grid (composition 2, hierarchy 2, craft 1).

### transparency_tokens
A minimally structured transparency page that buries its single signal behind disclaimer copy, ignores the right half of the desktop canvas, and drops its data card on mobile.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 4 · craftsmanship 5 · **premium 18**
**Eye-path:** H1 "How much budget is left." → the two grey-bordered disclaimer cards → the "83% / NEAR BUDGET" data card where amber finally delivers the only signal.
**Worst flaw:** the TOKEN BUDGET data card (83%, progress bar, NEAR BUDGET) is entirely missing on mobile — the page's sole purpose is invisible on the most common viewport, a P0 defect.
**Best moment:** the "83% / NEAR BUDGET" pairing on the desktop fold — bold numeral, spaced-caps amber label, clean progress bar — the only convergence of color and data.
**Responsive:** desktop fold front-loads two disclaimer cards before the payload and the amber label is cut off; full-page desktop blanks the bottom ~40%; tablet floats orphaned footer micro-type in empty space; mobile renders the data card completely empty and wraps the breadcrumb mid-token.

## Blog

### blog
A competent, readable blog index that is clean but entirely devoid of editorial ambition — it presents content without designing for discovery, delight, or brand identity.
**Scores:** composition 5 · hierarchy 5 · typography 6 · color 4 · craftsmanship 6 · **premium 29**
**Eye-path:** "Notes from the kernel." headline → five-line subtitle paragraph (dense mass) → first post card title "How to stop your AI agent from draining production."
**Worst flaw:** near-invisible card contrast (near-white on off-white) plus a fully achromatic header zone makes the page read as an unstyled document — no color, texture, or imagery.
**Best moment:** the announcement bar and nav row on desktop fold — purple GitHub CTA, version badge, clean link spacing — the one area where intentional craft survives.
**Responsive:** desktop fold is the strongest read (craft 7); full-page desktop is a uniform card list with no featured/hero post; tablet washes out further as the palette desaturation becomes more pronounced; mobile is the most monotonous — four fully-expanded cards in grey-on-grey with zero relief.

### blog_cap-token-spend
Functionally correct blog post with clean reflow, but reads as raw documentation output with no editorial identity, craft, or moments of delight.
**Scores:** composition 5 · hierarchy 5 · typography 5 · color 4 · craftsmanship 4 · **premium 24**
**Eye-path:** H1 title → first dark code block below the section header → second dark code block (the eye skips prose to the next dark block).
**Worst flaw:** no visual identity above the fold — no hero image, author card, date, or read-time — making the first impression indistinguishable from auto-generated docs.
**Best moment:** the H1 "How to cap LLM token spend per session" — well-sized, benefit-forward, typographically confident — the only intentionally designed element.
**Responsive:** desktop is a wall of text with no pull-quotes and code blocks sharing prose weight; desktop fold has zero above-fold identity; tablet's narrower column actually improves line length; mobile shrinks code text below readable size with no copy/ToC affordances (craft 3).

### blog_human-approval-resume
A technically readable developer blog post that meets the minimum bar but operates entirely within default template conventions.
**Scores:** composition 5 · hierarchy 5 · typography 5 · color 4 · craftsmanship 5 · **premium 28**
**Eye-path:** H1 headline at large weight → first dark code block ~one-third down → next H2 heading landing weakly.
**Worst flaw:** code blocks visually outrank H2 section headings across all four viewports, inverting the content hierarchy and forcing navigation by cognitive effort.
**Best moment:** the above-the-fold H1 at desktop — confidently sized, correctly weighted, em-dash formatted — the one moment approaching editorial quality.
**Responsive:** desktop fold's body column runs ~90ch (well past the 65–75ch ceiling); desktop inverts hierarchy with heavier code blocks; tablet carries the same long measure unchanged; mobile keeps code at borderline-small size with H2s under-differentiated.

### blog_launching-adjudicate
A technically correct but visually bare editorial page that reads like polished developer documentation, not a crafted product blog.
**Scores:** composition 5 · hierarchy 5 · typography 5 · color 4 · craftsmanship 4 · **premium 28**
**Eye-path:** H1 headline (large, left-aligned, dominant) → the deck paragraph carrying the value proposition → the code block mid-page, the only textural change.
**Worst flaw:** complete absence of any visual element beyond text and one code block — no cover image, hero treatment, or illustrated callout — indistinguishable from a GitHub README.
**Best moment:** the code block — the sole genuine editorial craft, breaking the wall-of-text rhythm and signaling technical depth.
**Responsive:** desktop fold is entirely typographic with no anchor; desktop's section headings don't differentiate from body weight; tablet's line length is marginally more comfortable; mobile's four-line H1 creates an inadvertently bold presence but the code block forces two-axis scroll.

### blog_stop-agent-draining-prod
A clean, readable technical blog post that prioritizes legibility over editorial design — publishable but indistinguishable from a default template.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 5 · craftsmanship 5 · **premium 32**
**Eye-path:** H1 headline → the deck/subtitle lede → the first dark code block, the dominant visual event below the fold.
**Worst flaw:** total absence of editorial design moments across the article — no pull quotes, callout blocks, styled section numbers, or pacing devices — making a long piece feel like raw documentation.
**Best moment:** the rhythmic alternation of white prose and full-width dark code blocks — incidental utility that's the only compositional beat.
**Responsive:** desktop fold's deck blends into body and the nav teal is the only color; desktop's numbered H2s are plain text; tablet is a faithful reflow with no breakpoint-specific decisions; mobile shrinks code text too small with no reading aids (craft 4).

## Community

### contribute
A credible contribution guide with a confident headline and smart layer taxonomy, undermined by vast unresolved whitespace, a broken mobile layout, and no visible CTA.
**Scores:** composition 4 · hierarchy 5 · typography 6 · color 5 · craftsmanship 4 · **premium 28**
**Eye-path:** H1 headline → body paragraph → "The layered architecture" header with layers icon.
**Worst flaw:** the mobile full-page render has a catastrophic blank-area collapse — roughly 70% of page height is empty, so any contributor on mobile sees the headline then nothing.
**Best moment:** the colored semantic status chips on layer rows (FROZEN, REUSABLE FACTORIES) — a color-coded vocabulary communicating architectural intent; the most intentionally designed element.
**Responsive:** desktop leaves the right half and lower two-thirds empty with no CTA anywhere; desktop fold has a clean section-divider stripe but the H1 doesn't appear until ~240px down; tablet is the strongest (L1–L5 layer rows with colored chips) but monospace package tokens drop to ~10–11px; mobile collapses (~70% blank, craft 2).

### roadmap
A well-voiced, confident hero sitting on top of an essentially empty page — the roadmap route has no roadmap, making it non-functional as a communication surface.
**Scores:** composition 2 · hierarchy 3 · typography 6 · color 3 · craftsmanship 2 · **premium 18**
**Eye-path:** headline "Shipped, frozen, and evolving on discipline — not hype." → badge chips (ADJUDICATE CORE 1.3.0 / CORE API FROZEN) → v1 section heading where the eye drops expecting a timeline that never arrives.
**Worst flaw:** no content exists below the first two sections on any viewport — no timeline, phase matrix, or status rows — making the route's stated purpose entirely unmet (~4,000px desktop, ~8,149px mobile of blank canvas).
**Best moment:** the desktop hero headline "Shipped, frozen, and evolving on discipline — not hype." — Stripe/Linear-caliber editorial voice in a well-weighted typeface.
**Responsive:** desktop fold's right half is abandoned with a ~200px gap and a near-invisible ghost "CORE API FROZEN" badge; full-page desktop is ~85% blank (composition 2, craft 2); tablet orphans "discipline — not hype." on its own line, weakening the em-dash punchline; mobile wraps the headline to four lines, fully breaking the em-dash climax.

### comparisons
A well-written editorial argument in a clean typographic shell, fatally undermined by a comparison table that appears empty or broken across every viewport.
**Scores:** composition 5 · hierarchy 6 · typography 6 · color 5 · craftsmanship 5 · **premium 34**
**Eye-path:** H1 "Why allow/deny isn't enough." → purple GitHub pill in the nav → section label + second H2 as the eye drops to find what follows.
**Worst flaw:** the comparison table renders with column headers but no row content on any viewport — the page's entire value proposition is absent at its climactic moment.
**Best moment:** above-the-fold desktop — announcement banner, clean nav with purple GitHub CTA pill, breadcrumb, and confident H1 in heavy type on off-white — genuinely polished and trustworthy.
**Responsive:** desktop fold leaves the right 35% empty; full-page desktop's table shows OPA/Cedar vs Adjudicate headers with no rows and no color differentiation; tablet adds a strong scenario callout card (the route's one concrete component) but still empty rows; mobile ends with an empty table after a long scroll, and the H2 "The Decision algebra OPA and Cedar can't express." wraps to three lines.
