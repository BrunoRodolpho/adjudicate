# Prioritized roadmap

Grouped by severity. Effort (S/M/L), impact, and confidence are from the per-finding analysis. The **Reveal/scroll-visibility** issue recurs across 7 areas — it is ONE fix (make content visible by default; motion as enhancement) and is the single highest-leverage item.

Effort key: **S** ≤ half-day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

## Critical — Do Immediately (11)

| # | Finding | Area | Effort | Confidence | Expected impact |
|---|---|---|---|---|---|
| 1 | No focus-visible styles on the shared Button or NavBar — keyboard focus is invisible on every CTA and nav link | Accessibility (cross-cutting) | S | 98% | Restores visible keyboard focus across 100% of CTAs and nav, closing a WCAG 2.4.7 A failure on the conversion  |
| 2 | Decision-color text and faint text fail WCAG AA on the light marketing canvas | Accessibility (cross-cutting) | M | 97% | Brings the six-outcome labels and ~105 faint-text instances to AA, fixing the most repeated contrast failure a |
| 3 | The most persuasive content (data-flow pipeline, wedge table, decision grid) renders as blank voids | Architecture + Trust + Deploy | M | 85% | Eliminates the single largest conversion and trust risk on the entire cluster; makes /comparisons and /archite |
| 4 | Scroll-reveal animation hides 3 of 4 capability families — the index looks broken | Capabilities + Recipes | S | 92% | Restores the entire catalogue (14 cards across 4 families) to immediate visibility; removes the single most da |
| 5 | Recipe deep-dives hide their entire payload (install, code, live outcome) below an unrevealed fold on mobile | Capabilities + Recipes | S | 90% | Recovers the core DX content on every recipe deep-dive on mobile (and any crawler), turning a blank-looking SE |
| 6 | Core data visualizations render as empty boxes — reveal animation gates the chart, once:true makes it permanent | Console replicas | M | 83% | Removes the single biggest credibility risk on the showcase; every replica reliably shows live-looking data in |
| 7 | Roadmap & Contribute render blank below the first viewport — scroll-reveal animation never fires in capture | Content + community + global chrome | M | 85% | Restores 100% of roadmap/contribute content for all visitors and capture tools; removes a 'broken page' impres |
| 8 | Mobile home renders almost entirely blank below the hero — same reveal-trigger failure on the flagship page | Content + community + global chrome | M | 80% | Guarantees the homepage body is visible on mobile for every visitor and capture path; protects the primary con |
| 9 | Entire homepage below the hero renders blank in static capture (opacity:0 Reveal wrappers) | Home + conversion | M | 90% | Guarantees the homepage body is visible to crawlers, social cards, print, and throttled clients; removes a cla |
| 10 | Scroll-reveal animations leave most of every page blank on mobile capture (and for any user whose reveal never triggers) | Mobile UX (cross-cutting) | M | 85% | Restores visibility of ~90% of every marketing page on mobile; directly recovers the scroll funnel and trust. |
| 11 | All below-the-fold content is invisible until client JS fires (no SSR/no-JS fallback) — verified root cause of every blank screenshot | Nielsen heuristics + competitive benchmark | S | 95% | Restores content visibility for crawlers, slow/blocked JS, and previews; eliminates the empty-page risk that c |

## High Impact (16)

| # | Finding | Area | Effort | Confidence | Expected impact |
|---|---|---|---|---|---|
| 1 | Shipped SkipLink is never rendered and no main landmark is focusable | Accessibility (cross-cutting) | S | 95% | Adds a working Bypass Blocks mechanism site-wide for keyboard users, using code that already exists — high val |
| 2 | Mobile sheet is not a real dialog — no focus trap, Escape, or focus restoration | Accessibility (cross-cutting) | M | 90% | Makes the primary mobile navigation operable and predictable for keyboard and screen-reader users, closing foc |
| 3 | Dead '#playground' anchor: six broken CTAs on /comparisons | Architecture + Trust + Deploy | S | 95% | Restores the only conversion path off the comparisons decision grid; removes a glaring broken-link defect. |
| 4 | Mobile data-flow diagram is a long, gap-ridden vertical stack and the trust-boundary panel is blank | Architecture + Trust + Deploy | M | 80% | Makes the flagship architecture page legible and complete on the device a large share of first-touch developer |
| 5 | Verbatim duplication: the header subtitle and the first body section repeat the identical paragraph | Capabilities + Recipes | S | 95% | Removes a glaring quality tell and reclaims above-the-fold space to surface the code/outcome sooner. |
| 6 | Two parallel maturity vocabularies (Tier 1/Tier 2 vs Live/Illustrative) confuse rather than clarify | Capabilities + Recipes | M | 82% | Replaces three overlapping vocabularies with one trust signal buyers can read at a glance; removes the 'Tier 2 |
| 7 | Flagship audit table is clipped on mobile with no scroll affordance | Console replicas | M | 90% | Mobile visitors can read the full receipt (including TIME and HASH) and understand the table is intentionally  |
| 8 | AI-BOM mobile drops the entire detail pane — the page becomes a 2-item list | Console replicas | M | 82% | Restores the AI-BOM's substance on mobile, turning a near-empty screen into the provenance showcase it is on d |
| 9 | Blog and Roadmap/Contribute are footer-only — they never appear in the primary header nav | Content + community + global chrome | S | 90% | Makes three high-value pages discoverable from any viewport position and restores section wayfinding; likely m |
| 10 | Two sources of truth for the load-bearing six-outcome palette, with diverging labels and order | Design system (cross-cutting) | M | 90% | One canonical outcome vocabulary across every surface; eliminates a whole class of drift bugs and makes the 'p |
| 11 | Core Button and Card have no focus-visible styling - keyboard users get no visible focus on primary CTAs | Design system (cross-cutting) | S | 92% | Brings the primary navigation and CTA flow into WCAG 2.4.7 compliance and makes keyboard use feel intentional; |
| 12 | Hero subhead lists only 5 of the 6 outcomes, contradicting the 'six outcomes' promise | Home + conversion | S | 97% | Removes a factual self-contradiction on the highest-traffic line of copy; reinforces the core six-outcome posi |
| 13 | how-it-works renames the six canonical outcomes (modify/wait/ask), creating terminology drift across the two highest-intent pages | Home + conversion | S | 92% | One consistent vocabulary across hero, how-it-works, playground, and console — easier comprehension and strong |
| 14 | Console replica tables clip their right-most columns at 390px with no visible scroll affordance | Mobile UX (cross-cutting) | M | 80% | Makes the flagship console proof legible on phones; removes a visible 'broken header' that erodes trust. |
| 15 | Pages render with massive trailing empty space, pushing the footer thousands of px below content | Mobile UX (cross-cutting) | M | 75% | Eliminates dead-zone scrolling; users reach footer/cross-links instead of bouncing. |
| 16 | Primary install command is visually truncated in the hero ("pnpm add @adjudicate/cor") | Nielsen heuristics + competitive benchmark | S | 90% | Repairs the hero's primary trust/onboarding signal; the install path becomes legible and copy-confident. |

## Medium Impact (23)

| # | Finding | Area | Effort | Confidence | Expected impact |
|---|---|---|---|---|---|
| 1 | console.faint label text fails AA on the dark console replicas | Accessibility (cross-cutting) | S | 92% | Makes audit-table headers and console labels legible on the trust-critical dark surfaces while keeping the mut |
| 2 | Gradient-clipped hero headline relies on bg-clip-text with weak contrast and no fallback | Accessibility (cross-cutting) | S | 80% | Guarantees the positioning headline is legible and never vanishes, hardening the highest-visibility text on th |
| 3 | Transparency sub-views are single-screen and trail huge empty footers; mobile index hides all view cards | Architecture + Trust + Deploy | M | 85% | Makes the transparency surface look complete and trustworthy on both viewports, reinforcing the central 'open  |
| 4 | Integrity badge status pills use dark-theme color tones on a light surface (low contrast) | Architecture + Trust + Deploy | S | 75% | Makes the integrity status legible and AA-compliant, and keeps the severity ramp meaningful for all users. |
| 5 | Oversized dead vertical space pushes the H1 and content far down every fold | Capabilities + Recipes | S | 80% | Raises first-screen information density and gets product (cards/code) into view sooner, improving perceived de |
| 6 | Capability index cards are not keyboard/scan-distinguishable; identical 'OPEN CAPABILITY' affordance lacks a real link cue | Capabilities + Recipes | S | 66% | Makes every catalogue card visibly and accessibly clickable, improving click-through into the deep-dives and m |
| 7 | Honesty framing is clear but triple-stacked and repetitive across every replica | Console replicas | S | 70% | Lighter, more confident pages; the value proposition leads and the (still-clear) honesty framing stops competi |
| 8 | Console hub hero video is too small and illegible to sell the product | Console replicas | S | 66% | The hub immediately communicates 'real, dense operator console' and pulls users into the 10 replicas instead o |
| 9 | Dense 10-11px gray-on-near-black text repeatedly fails contrast | Console replicas | M | 70% | The audit/governance data becomes legible to the buyers who care most, and the surface passes contrast checks  |
| 10 | Blog is thin and structurally bare — 4 posts, no tags/categories, no RSS, no visual differentiation | Content + community + global chrome | M | 75% | Repositions the blog as active and navigable; RSS/subscribe captures interested developers; tags improve scana |
| 11 | Mega-menu is a single Architecture dropdown — the rest of the IA is a long flat row with no grouping | Content + community + global chrome | M | 65% | Improves wayfinding for the highest-value audience and gives the header a legible information architecture ins |
| 12 | Type scale has fragmented into ~8 arbitrary pixel sizes that bypass the named scale | Design system (cross-cutting) | M | 85% | A legible, enforceable type system; future text changes become one-token edits and rhythm stays consistent acr |
| 13 | Two near-duplicate six-outcome chip components with divergent size scales | Design system (cross-cutting) | S | 88% | One pixel-identical decision chip everywhere; removes a duplicated icon map and a future drift source. |
| 14 | REWRITE chip uses the non-AA orange even though an AA-safe shade is defined in config | Design system (cross-cutting) | S | 80% | Brings the one decision label that fails AA into compliance using a token the team already created; closes a s |
| 15 | Reveal-gated content renders invisible without scroll/JS - WedgeTable body is empty in the comparisons capture | Design system (cross-cutting) | M | 78% | The differentiator table (and other below-fold body content) is always present for users, bots, and captures;  |
| 16 | Primary hero CTA promises a '5-min demo' the playground doesn't deliver | Home + conversion | S | 85% | Aligns the CTA promise with the destination; lowers perceived friction on the primary conversion path. |
| 17 | Homepage is 14 sections / ~13k px long and loses the thread after the spine | Home + conversion | M | 75% | Shorter, higher-momentum page with one dominant CTA per screen; less repetition and lower mobile scroll cost. |
| 18 | Reduced-motion users get a degraded hero (static poster) while normal users get the explanatory animation | Home + conversion | M | 70% | Reduced-motion and a11y users get the same core comprehension as everyone else above the fold. |
| 19 | Large vertical gaps between section headings and their content on the capabilities page | Mobile UX (cross-cutting) | S | 80% | Restores the full capability inventory; aligns the page with its own headline claim. |
| 20 | Mobile nav trigger and links fall below the 44px minimum touch target | Mobile UX (cross-cutting) | S | 85% | Reliable tapping of the only navigation on mobile; meets WCAG 2.5.5. |
| 21 | Hero CTA hierarchy is muddy: a strong primary, a near-invisible secondary, and a truncated install chip competing as a third path | Nielsen heuristics + competitive benchmark | S | 78% | Sharpens the funnel toward the high-intent demo and makes every hero action recognizably clickable. |
| 22 | Heuristic sweep: 'Visibility of system status' is excellent inside the demo but failing at the page level | Nielsen heuristics + competitive benchmark | M | 82% | Consistent, trustworthy feedback across the whole site, not just the interactive island. |
| 23 | Competitive gap — interactive demo BEATS most leaders, but the surrounding page polish is WORSE than Linear/Vercel due to the reveal fragility | Nielsen heuristics + competitive benchmark | M | 80% | Converts a 'great-when-it-works' demo into a uniformly best-in-class marketing site; protects launch-day link  |

## Nice To Have (10)

| # | Finding | Area | Effort | Confidence | Expected impact |
|---|---|---|---|---|---|
| 1 | Bare focus:outline-none without a replacement ring in console ErrorState | Accessibility (cross-cutting) | S | 85% | Closes the lone bare-outline-none focus gap in the console kit. |
| 2 | Source-file annotations and 10px micro-type push legibility limits, especially on the data-flow nodes | Architecture + Trust + Deploy | S | 70% | Turns the source annotations into a readable, clickable proof-of-rigor instead of unreadable fine print. |
| 3 | Workflow family is visually overloaded (5 cards) while three families have only 3 — uneven, unbalanced catalogue | Capabilities + Recipes | M | 55% | Marginally improves catalogue balance and curation feel; secondary to the rendering fixes. |
| 4 | Ten near-identical dark replicas create wayfinding sameness; back-link is the only nav between them | Console replicas | M | 60% | More of the 10 surfaces get seen per session; the showcase feels like a guided tour rather than ten dead-end d |
| 5 | Announcement banner has no landmark separation and competes with the nav for the top of every page | Content + community + global chrome | S | 70% | Makes the v1/API-frozen trust claim more legible and the dismiss control easier to hit, without adding intrusi |
| 6 | Blog 'Read post' links use indigo-600 — a one-off color that breaks the site's token system | Content + community + global chrome | S | 80% | Restores visual consistency between the blog and the rest of the site; ensures links theme correctly. |
| 7 | Roadmap hero contains a date-style claim ('release notes →') but the page never states a current date or last-updated | Content + community + global chrome | S | 60% | Strengthens the roadmap's core 'honest, current state' promise with a concrete, checkable signal. |
| 8 | Mobile home renders ~20000px tall with large empty bands between sections | Design system (cross-cutting) | S | 60% | Tighter, more confident mobile rhythm; less endless-scroll perception on the highest-traffic form factor. |
| 9 | OutcomesBento gates differentiating depth behind a click ('When is this chosen?') and risks weak contrast on the 'edge' tags | Home + conversion | M | 70% | The core differentiator is visible without a click; labels are readable and meet contrast for all users. |
| 10 | Hero CTA stack and version chip read small/tight at 390px | Mobile UX (cross-cutting) | S | 55% | Clearer single tap-target for the main action on the page that, today, IS the page. |
