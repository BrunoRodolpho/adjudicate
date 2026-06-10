# Screenshot Review Summary

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

Numbers verified. Now writing the synthesis.

## Screenshot Review Summary — adjudicate marketing site (58 routes, 232 screenshots)

### Overall aesthetic verdict

This is a site with genuinely premium *bones* — confident editorial typography, a disciplined off-white/near-black palette, and a few recurring component patterns (the white-card-on-black console replica, semantic color-coded outcome pills, the numbered "Guard decides" stepper) that would survive a Stripe or Linear design crit in isolation. But almost every route is hollowed out by the same structural rot: vast unexplained voids where content should be, sections that render empty, and a mobile layer where primary content (code blocks, data tables, card grids) silently fails to render across dozens of routes. The result is a portfolio whose strongest fold impressions are repeatedly betrayed on scroll — nothing reaches the keynote bar, two routes scrape "strong," and more than half land in "weak" or "broken."

### Score distribution

| Band | Label | Route count | Share |
|---|---|---|---|
| 80–100 | Keynote | 0 | 0% |
| 65–79 | Strong | 0 | 0% |
| 50–64 | Competent | 2 | 3% |
| 35–49 | Weak | 25 | 43% |
| under 35 | Broken | 31 | 53% |
| | **Total** | **58** | (mean 34.7 / median 34.0) |

The distribution is damning: zero routes clear the "strong" threshold, the modal experience is "weak," and an outright majority is "broken." No route's ceiling is its problem — the *floor* is. Even the two top scorers (`deploy`, `capabilities_behavioral-drift`, both 52) are capped by flaws shared with the bottom of the table.

### Recurring cross-route themes

**Strengths**

1. **The console-replica aesthetic is the brand's one true asset.** The white-hero-card-on-pure-black split with a macOS-chrome terminal widget (traffic-light dots, `LOCALHOST:5180`, "ILLUSTRATIVE REPLICA" banner) is the most premium device on the entire site. It lands at the fold on `console_dashboard`, `console_decision`, `console_ai-bom`, `console_tokens`, and `console_command-risk` — these folds are the closest thing to keynote-grade anywhere.

2. **Semantic color-coded outcome pills do real communicative work.** The EXECUTE/REFUSE/REWRITE/ESCALATE/DEFER/REQUEST_CONFIRMATION pill system is the most-cited "standout" across the capabilities family — `capabilities_access-governance-pack`, `capabilities_command-risk-guard`, `capabilities_red-team`, and `architecture_data-flow` all earn their best moments from it.

3. **The numbered "Guard decides" stepper** is a genuinely reusable component that reads as the "most polished/considered" element on nearly every capability detail page (`agent-memory-store`, `ai-bom`, `token-budget-guard`, `hallucination-scoring`).

4. **Confident editorial headlines.** Copy like deploy's "It runs in your request path, before the side-effect.", how-it-works' two-line color-split thesis ("LLMs generate possibilities." / "Production systems require decisions."), and roadmap's "Shipped, frozen, and evolving on discipline — not hype." are repeatedly singled out as Stripe/Linear-caliber voice.

**Flaws**

5. **The signature flaw: enormous unexplained voids.** Nearly every route has a dead zone read explicitly as "broken" or "failed lazy-load," not breathing room. It appears as the ~200–280px hero gap between subtitle and tags (`capabilities_release-gating`, every capability detail page), the mid-page void where SEVEN PRIMITIVES content is absent (`architecture`), and 35–70% empty-canvas scroll regions on `console`, `home`, `roadmap`, and the entire `transparency_*` family.

6. **Catastrophic mobile content-rendering failures.** This is the most severe systemic defect. Primary content vanishes on mobile across a huge swath of routes: pending queue (`console_approvals`), BOM detail panel (`console_ai-bom`), data tables (`console_audit-explorer`, `console_tokens`, `transparency_command-risk`, `transparency_pii`), the entire card grid (`transparency`, `transparency_red-team`), the TOKEN BUDGET card (`transparency_tokens`), and code blocks across virtually every `recipes_*` route (`cap-blast-radius`, `cap-token-spend`, `gate-prod-deploys`, `over-refund-clamp`, `pause-for-human`). A first-time mobile visitor would assume the build is broken.

7. **The wasted right half / single-column-in-a-desktop-shell.** Capability and recipe pages pin content to the left ~55% and leave the right 40–45% as dead white space, repeatedly read as "an abandoned two-column layout missing its right panel" (`capabilities_config-integrity-seal`, `capabilities_policy-coherence-analyzer`, `recipes_pause-for-human`, every `transparency_*` route).

8. **Blog and editorial routes are undesigned markdown.** The entire `blog_*` family and `how-it-works` share flat hierarchy where code blocks visually outrank H2 headings, zero pull-quotes or callouts, and code that's illegible on mobile — reading as "raw documentation output," not a crafted product blog (`blog_cap-token-spend`, `blog_human-approval-resume`, `blog_launching-adjudicate`).

9. **Duplicated/template-stub copy.** Multiple recipe pages render the hero subtitle verbatim as the "The problem" body — a visible authoring bug that destroys credibility (`recipes_block-dangerous-commands`, `recipes_cap-token-spend`, `recipes_over-refund-clamp`).

### The 5 most extraordinary screens

1. **`deploy` (52)** — sharp developer copy at commanding scale, clean syntax-highlighted code blocks with the inline yellow DEFERS annotation, teal SHIPPING badge. The strongest *complete* route.
2. **`capabilities_behavioral-drift` (52)** — the amber-on-near-black "Worked example" terminal block with the "CLEARED / DECISION KIND" bar is called Stripe-documentation-quality; the multi-hue pill system survives all four viewports without degradation.
3. **`introspection` (47)** — the dark CTA footer with green italic "your operators dispose." against a high-contrast black section break is the most emotionally charged, brand-confident moment on the site.
4. **`console_ai-bom` (47)** — the TOOLS section with pill-tagged change types is called "conference-worthy information design"; the two-column pack-list + detail-panel split sells the operator-console premise instantly.
5. **`capabilities_release-gating` (47)** — the Provenance two-column card pairing ADR-116 with the implementing package path is the cleanest, most scannable developer-facing info unit on the site.

### The 5 weakest screens

1. **`roadmap` (18)** — a roadmap page with no roadmap: a confident hero atop ~4,000px (desktop) to ~8,149px (mobile) of blank canvas; the route's entire stated purpose is absent.
2. **`transparency_tokens` (18)** — buries its single data point (83% / NEAR BUDGET) behind two disclaimer cards, ignores the right half of the canvas, and drops the data card entirely on mobile (P0 defect).
3. **`console` (22)** — strong fold collapses into a black void consuming 60–80% of full-page scroll on every viewport; promises "interactive replicas" plural, delivers one static thumbnail and a paragraph.
4. **`recipes_cap-blast-radius` (22)** — a blank rectangle in the hero plus near-total content blackout on mobile (~70% blank) makes it indistinguishable from a load failure.
5. **`recipes_pause-for-human` (22)** — dead-zone gap on every viewport, empty right half on desktop, and a catastrophic mobile render leaving 75% of the page blank.

### Dominant emotional-response pattern

The signature arc a first-time visitor feels is **confidence betrayed by skepticism.** Almost every route opens by earning trust — a confident headline, a polished nav, a striking white-card-on-black fold — and then, within one scroll, collapses that trust as the visitor hits a void, an empty section, or (on mobile) a blank page. The reviewer's emotion tags trace this precisely: folds repeatedly read "confidence" / "trust," and the same routes on full-page or mobile read "skepticism," "confusion," and "boredom." The defining feeling is the **"did the page load?" moment** — over and over the visitor is left wondering whether they're seeing intentional design or a broken build, and on mobile the answer is too often the latter. The product *looks* serious and credible at first glance; it does not yet *feel* finished.
