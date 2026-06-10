# Information Density Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

## INFORMATION DENSITY AUDIT

Scope: 58 routes × 4 viewports = 232 individually scored screenshots from the grounding ledger. Density is read off the `density_class` field per viewport, cross-referenced against `breathing_room`, `density_balance`, `worst_optical_flaw`, and `biggest_noise_source`. The headline finding: **this site does not have a density problem in one direction — it has bimodal density failure.** Almost every route is *Sparse-to-empty at desktop scale and Dense-to-Overloaded at mobile*, with no route holding a calibrated middle. The recurring empty-band problem and the recurring badge-soup problem are the same disease seen from two ends.

---

### By-route density classification

Reading: `D` = desktop, `Df` = desktop_fold, `T` = tablet, `M` = mobile. Order is the ledger's order (`Df, D, T, M` where present). `▢` Sparse · `◐` Balanced · `▣` Dense · `■` Overloaded.

| Route | Df | D | T | M | Dominant pathology |
|---|---|---|---|---|---|
| architecture | ◐ | ▢ | ▣ | ▣ | Empty band hero→problem; mobile pipeline overflow |
| architecture_data-flow | ▢ | ▢ | ▣ | ▢ | ~300px mid-page void on every viewport |
| blog | ◐ | ◐ | ◐ | ▣ | Card grid OK desktop; prose wall mobile |
| blog_cap-token-spend | ▢ | ▣ | ▣ | ▣ | Sparse fold → dense code slabs |
| blog_human-approval-resume | ◐ | ▣ | ▣ | ■ | Code blocks ~11px; mobile Overloaded |
| blog_launching-adjudicate | ◐ | ◐ | ◐ | ▣ | Nav 10+ elements above article |
| blog_stop-agent-draining-prod | ◐ | ▣ | ▣ | ▣ | Dark code dominates prose |
| capabilities | ◐ | ▢ | ▢ | ▣ | 3 of 4 families render empty |
| capabilities_access-governance-pack | ▢ | ▣ | ▣ | ■ | 6 outcome pills rainbow band; mobile Overloaded |
| capabilities_agent-memory-store | ▢ | ◐ | ▣ | ▣ | ~200px dead air; nested demo card |
| capabilities_ai-bom | ▢ | ◐ | ▣ | ▣ | ~140px dead air; 4-badge taxonomy |
| capabilities_behavioral-drift | ▢ | ◐ | ▣ | ▣ | ~120px band; 2 pill rows |
| capabilities_command-risk-guard | ◐ | ▣ | ▣ | ▣ | 8 simultaneous badge colors; 7 hr rules |
| capabilities_config-integrity-seal | ▢ | ◐ | ▣ | ▣ | ~150px band; 4 container types |
| capabilities_hallucination-scoring | ▢ | ▣ | ▣ | ■ | 5-variant badge soup; mobile Overloaded |
| capabilities_incident-response-pack | ▢ | ◐ | ▣ | ▣ | ~200px band; triple-encoded pills |
| capabilities_pii-guard | ▢ | ◐ | ◐ | ◐ | ~150px band; ghost right column; code overflow |
| capabilities_policy-coherence-analyzer | ▢ | ▣ | ▣ | ▣ | ~120px band; nested cards |
| capabilities_red-team | ▢ | ▣ | ▣ | ▣ | ~140px void; 6-variant badges |
| capabilities_release-gating | ▢ | ▣ | ▣ | ■ | ~150px gap; mobile Overloaded |
| capabilities_smart-approval-engine | ▢ | ◐ | ◐ | ▣ | ~130px void; duplicate terminal blocks |
| capabilities_token-budget-guard | ▢ | ◐ | ◐ | ▣ | Void below tags; red-bleed code |
| comparisons | ▢ | ▢ | ◐ | ◐ | Right 40% empty; comparison table collapses on mobile |
| console | ▢ | ◐ | ▢ | ▢ | 600–1200px black void; mobile 75% empty |
| console_ai-bom | ◐ | ▣ | ▣ | ▢ | Hash strings wrap; mobile ~70% void |
| console_approvals | ◐ | ▣ | ▣ | ■ | Empty pending queue on mobile (broken) |
| console_audit-explorer | ◐ | ◐ | ▣ | ■ | 6 badge colors; mobile table overflow |
| console_command-risk | ◐ | ▢ | ◐ | ▣ | Blank chart on mobile; 35–40% page tail |
| console_dashboard | ▢ | ◐ | ▣ | ▣ | Chart thumbnail illegible; OS chrome |
| console_decision_(hash) | ◐ | ◐ | ◐ | ▣ | 40–50% black dead zone |
| console_drift | ◐ | ▢ | ◐ | ▣ | Blank timeline chart; 65% void |
| console_integrity | ◐ | ▣ | ▣ | ■ | ACTIVE SEALS blank on mobile |
| console_red-team | ◐ | ◐ | ▣ | ■ | Collapsed trend chart; mobile table broken |
| console_tokens | ◐ | ◐ | ▣ | ■ | Empty boxes; 40–60% void; mobile clip |
| contribute | ▢ | ▢ | ◐ | ▢ | ~140px hero void; mobile 80% blank |
| deploy | ◐ | ▣ | ▣ | ▣ | Stacked code-block walls |
| home | ◐ | ▢ | ▢ | ▢ | 90%+ of page empty (13k–20k px tall) |
| how-it-works | ▢ | ◐ | ◐ | ▣ | Split axis; empty inter-frame voids |
| introspection | ▢ | ◐ | ▣ | ▣ | Right half empty; broken scatter-plot |
| playground | ◐ | ▣ | ▣ | ▣ | 6 cards × 4–6 pills = confetti wall |
| recipes | ▣ | ◐ | ▣ | ▣ | Multi-hue badge interference |
| recipes_block-dangerous-commands | ▢ | ▢ | ◐ | ▢ | Dup paragraph; mobile 75% blank |
| recipes_cap-blast-radius | ▢ | ▢ | ▢ | ▢ | Right 40% empty; mobile render fail |
| recipes_cap-token-spend | ▢ | ◐ | ▢ | ▢ | ~200px dead air; mobile blank |
| recipes_gate-prod-deploys | ▢ | ▣ | ▣ | ▢ | ~150px void; mobile render fail |
| recipes_least-privilege-access | ▢ | ▢ | ◐ | ▢ | ~140px void; mobile truncates |
| recipes_over-refund-clamp | ▢ | ▢ | ▣ | ▢ | Bimodal: empty top, code dump; mobile broken |
| recipes_pause-for-human | ▢ | ▢ | ▢ | ▢ | ~150px void; verbatim 3× repeat; mobile broken |
| recipes_redact-pii | ▢ | ◐ | ◐ | ▢ | ~150px dead air; mobile 80% blank |
| roadmap | ▢ | ▢ | ▢ | ▢ | One section, 70–80% empty scroll |
| transparency | ◐ | ▢ | ◐ | ▣ | Operations section empty on all viewports |
| transparency_ai-bom | ◐ | ▣ | ▣ | ■ | Raw 64-char hashes; mobile grey voids |
| transparency_command-risk | ◐ | ▢ | ▢ | ▢ | Mono bars; mobile table missing |
| transparency_drift | ◐ | ▢ | ◐ | ▢ | 3 identical cards; mobile ends at 35% |
| transparency_integrity | ◐ | ▢ | ◐ | ▢ | Right 42% empty; mobile 60% void |
| transparency_pii | ◐ | ▢ | ◐ | ▣ | Dead zone 35–55%; mobile table missing |
| transparency_red-team | ◐ | ▢ | ▢ | ▢ | Orphaned 5th card; mobile cards absent |
| transparency_tokens | ◐ | ▢ | ◐ | ▣ | 2 disclaimer cards bury 1 metric |

**Distribution across all 232 screenshots (approx.):** Sparse ~38% · Balanced ~30% · Dense ~28% · Overloaded ~4%. Crucially, the Balanced count is *concentrated at `desktop_fold`* — the one viewport designers most look at — and evaporates everywhere else. Strip the fold and the site is roughly half Sparse, half Dense/Overloaded, with almost nothing genuinely calibrated at full-page or mobile scale.

---

### Where breathing room is insufficient (too tight, too noisy)

This is the *mobile and dense-desktop* failure mode. The eye is given no rest because elements are stacked at equal weight with sub-rhythm gaps.

- **Blog/recipe long-form code** is the densest content type. `blog_human-approval-resume` code renders at ~11px and the page goes **Overloaded** on mobile — the only blog to do so. `blog_cap-token-spend`, `blog_stop-agent-draining-prod`, and `deploy` all stack **full-width dark code blocks back-to-back with 32–40px gaps**, so prose and code collide. `deploy` desktop: *"three consecutive dark code blocks with no visual punctuation — undifferentiated wall of code."*
- **Capability fold metadata.** `capabilities_command-risk-guard` puts **8 simultaneous badge colors + 7 horizontal rules** on one page; `capabilities_access-governance-pack`, `_hallucination-scoring`, and `_release-gating` all hit **Overloaded on mobile** because six outcome pills wrap to 4–5 rows of orphaned chips. The metadata band consumes more vertical space than the H1 + subtitle combined.
- **Console replicas** nest 3–5 card borders (`page > white hero card > dark console card > section cards > rows`). `console_integrity` and `console_approvals` go **Overloaded on mobile** where this nesting collapses into "five borders with almost no content inside." `console_tokens` mobile hard-clips table columns ('REMAINING' → 'REM').
- **Playground** is the worst *intra-card* density: six scenario cards each carrying icon + heading + description + metadata label + 4–6 colored pills = *"a confetti wall — the loudest elements carry the lowest hierarchy weight."*

---

### Where EXCESSIVE whitespace creates weak hierarchy — the recurring empty-band problem

This is the **single most pervasive defect in the entire ledger**, and it appears in two distinct forms.

**Form 1 — the ~120–200px "dead band" between hero subtitle and the tag/content row.** It recurs on *nearly every capability and recipe detail page* and is repeatedly named the `worst_optical_flaw`:

- `capabilities_agent-memory-store`: ~200px — *"reads as a broken render or missing content."*
- `capabilities_incident-response-pack` & `_red-team`: ~200px / ~140px voids.
- `capabilities_config-integrity-seal`, `_pii-guard`, `_release-gating`, `_hallucination-scoring`: ~150px each.
- `capabilities_ai-bom`, `_command-risk-guard`: ~140px.
- `capabilities_behavioral-drift`, `_policy-coherence-analyzer`: ~120px.
- Recipes: `recipes_cap-token-spend` (~200px), `recipes_pause-for-human` / `_redact-pii` / `_gate-prod-deploys` (~150px), `recipes_cap-blast-radius` / `_least-privilege` (~140px).

The ledger is unanimous: this is **not luxury negative space, it is a collapsed/removed component whose margins were never reconciled.** It destroys hierarchy *before the first content element is read* — the most expensive possible place to lose the reader.

**Form 2 — the page-scale void / abandoned scroll.** Whole bottom halves render empty:

- `home` is the extreme: **13,240px (desktop) to 19,888px (mobile) tall with content in the top ~500px** — ~90%+ empty. The grounding note: *"a 13,240px page 90% empty is unfinished… reads as load failure, not restraint."*
- `console` and console children carry **600–1200px black voids** below the demo (`console` mobile is 75% empty; `console_decision` 40–50% dead zone; `console_drift` 65%; `console_tokens` 40–60%).
- `comparisons`, `introspection`, `transparency_integrity` waste the **right 40–42% of the desktop canvas** — a phantom unbuilt second column.
- `transparency`'s **Operations section renders empty on every viewport** — heading + subtitle + void, indistinguishable from a broken render.
- `roadmap` is a single section on a page that *promises a roadmap* — 70–80% empty scroll.

Both forms produce the same outcome the ledger keeps flagging: **whitespace doing the work of a broken layout, not the work of hierarchy.** Empty space here reads as *absence of content*, never as *presence of intent*.

---

### Where too many elements compete at once

The competition is almost always **badge/pill taxonomy and container nesting**, not content.

- **Badge soup** is the dominant `biggest_noise_source` across capabilities: 4 variants (`_ai-bom`), 5 variants (`_hallucination-scoring`), 6 variants/colors (`_red-team`, `_access-governance-pack`, `_incident-response-pack`), and **8 simultaneous colors** (`_command-risk-guard`). Each outcome pill triple-encodes — color + icon + ALL-CAPS label — *"redundant encoding that inflates the row without adding clarity."* The six-outcome differentiator, the product's actual story, is buried *inside* this noise as metadata.
- **Console rainbow:** `console_audit-explorer` and `console_dashboard` show **six full-spectrum decision-badge colors at equal weight**, amplified by three decorative macOS traffic-light dots adding red/yellow/green — *"more color variation in 70px than the entire rest of the page."*
- **Container competition:** routes routinely carry **4–5 unreconciled container systems** on one page (`capabilities_command-risk-guard`: step card + warning callout + provenance cards + code block + public-data card). Plus 6–7 horizontal `hr` rules per page acting as a *second* redundant separation system on top of whitespace.
- **Nav competition:** every page front-loads banner + 7–8 nav links + two competing CTAs (ghost "Open console" vs filled purple "GitHub" pill), the GitHub pill consistently *louder than the primary action* — inverted hierarchy before content begins.

---

### Benchmark vs Linear, Stripe, Notion, Vercel

The ledger references all four as the standard. Mapping the site against each:

**Too SPARSE vs them (the bigger gap).** Linear, Stripe, and Vercel **fill the full scroll with calibrated density** — every viewport position is intentional. This site does the opposite: `home`, `console*`, `roadmap`, `transparency`, and the entire `recipes_*` family leave 40–90% of the canvas empty. Stripe Press and Linear *use the desktop fold as a statement and the right canvas as composition*; here the right 40% is dead (`comparisons`, `introspection`, `transparency_integrity`) and the fold opens with a 150px gap. **Verdict: dramatically too sparse at desktop and full-page scale.** The site reads as outline-level content in a finished-page shell — the exact opposite of Stripe/Linear's "every pixel earns its place."

**Too NOISY vs them (the secondary, mobile-and-metadata gap).** Where the site *does* place content, it over-instruments it relative to all four references:
- **Code blocks:** Linear, Stripe, Vercel ship **custom-tuned code themes with language badges, copy affordances, and overflow containers with edge-fade.** This site ships raw `pre` tags with default syntax colors that overflow on mobile (`blog_*`, `deploy`, every recipe). *"Without code-block craft, no typographic refinement will land as luxury."*
- **Badges:** Apple/Linear/Stripe use **one accent with opacity variants**; this site uses 5–8 hues with no token system. Notion and Linear **collapse secondary metadata** at mobile; this site renders all six pills at full size into 4-row towers.
- **Tables:** Stripe/Linear/Vercel **handle overflow gracefully (ellipsis + tooltip, card-per-row reflow)**; this site's console/transparency tables **hard-clip or vanish entirely on mobile**.
- **Skeuomorphism:** Stripe, Linear, and Vercel have **all abandoned macOS traffic-light chrome**; this site uses it as a recurring motif across every console route — *"cosplay, not craft."*

**Net positioning:** Against Linear/Stripe/Vercel the site is **too sparse in macro-layout and too noisy in micro-instrumentation simultaneously** — it has neither their disciplined fill nor their restraint in detail. It most resembles a **generic SaaS/Notion-template assembly** (bordered cards, ISO dates, alternating-background striping, dismiss-X banners) that the references explicitly evolved past.

---

### Conclusion: where density helps vs harms, and target posture per page type

**Where density currently HELPS:**
- The **desktop_fold of nearly every page** is genuinely Balanced (5–6 `density_balance`) — hero + subtitle + one CTA breathe correctly. This is the site's one consistent win.
- **Console replica fold views** (`console_audit-explorer`, `console_dashboard`, `console_integrity` Df) — the dense data instrument *is* the product proof; tightness is appropriate here and these score the route's highest `density_balance`.
- **Blog/comparisons at tablet** — single-column reflow with a scenario callout produces the ledger's calmest reading.

**Where density currently HARMS:**
- The **empty band below every hero** — pure hierarchy destruction, zero benefit, present on ~25 routes.
- **Metadata badge clusters** — the differentiator buried as the loudest-but-lowest-value element.
- **Mobile everything** — bimodal collapse: voids where data should render, towers where pills should summarize. Six routes hit Overloaded; ~12 mobile views are functionally *broken* (missing tables, blank chart panels, 70–80% void).
- **Page-scale voids** — `home`, `roadmap`, `transparency`, console tails read as unfinished.

**Target density posture per page type:**

| Page type | Current | Target posture |
|---|---|---|
| **Home / marketing landing** | Sparse (90% empty) | **Balanced, full-scroll** — Stripe/Linear calibrated fill; every viewport-height earns content. Kill the 19k-px empty canvas. |
| **Capability / recipe detail** | Empty band → Dense | **Balanced** — collapse the hero dead-band, collapse 6 pills to *one* quiet taxonomy line, promote the six-outcome story to a designed diagram, not metadata. |
| **Blog / long-form** | Dense (code walls) | **Balanced editorial** — Vercel-grade code blocks (theme, badge, copy, overflow), pull-quotes/callouts for relief, reading-mode nav. |
| **Console replica** | Dense fold → empty tail | **Dense-by-design instrument** — *keep* the data density (it's the proof), but clip the page to content height, kill the black void, reflow tables on mobile, drop OS chrome. |
| **Transparency / governance** | Sparse + empty sections | **Balanced** — fill or remove the empty Operations/right-column slots; the *only* page type where genuine restraint is warranted, but it must be **complete** restraint, not absent content. |
| **Mobile (all types)** | Bimodal (void + tower) | **Recompose, never reflow** — summarize pills, collapse code behind disclosure, card-per-row tables, eliminate the dead voids. This is the most urgent fix; mobile is where density is most broken. |

The through-line: **this site mistakes emptiness for restraint and instrumentation for sophistication.** Linear, Stripe, Notion, and Vercel earn calm through *full, calibrated* layouts and *one* disciplined detail system. Adjudicate currently has neither — it is too sparse to feel finished and too noisy to feel premium, often on the same screen.
