# Design System Maturity Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

I have the complete grounding ledger. This is a design system audit drawn from per-screenshot observations across 58 routes. Let me synthesize the cross-route patterns into a maturity verdict.

## Design System Maturity Audit — adjudicate web

### Verdict in one line

The token system is **partially coherent at the atom level and incoherent at the system level**. Spacing and elevation are the most broken; type is the most resilient; color is semantically right in pockets but assembled from at least three uncoordinated palettes. Components are designed independently and never reconciled — the same concept (an outcome chip, a status pill, a "console" surface, a "card") is re-invented per route with no shared source of truth.

---

### Subsystem scores

| Subsystem | Score | One-line justification |
|---|---|---|
| Spacing | **3/10** | Dead-zone gaps and empty halves recur on nearly every route — spacing is the symptom of a missing layout system, not a tuned scale. |
| Radius | **6/10** | The one quietly consistent token; pills/cards/code blocks share radius almost everywhere. Dinged only by pill-shape inconsistency. |
| Elevation | **3/10** | No coherent elevation model — borders are hairline-invisible, "cards" are defined by near-zero contrast, and the marketing/console surfaces use incompatible depth languages. |
| Typography | **6/10** | Most resilient subsystem. Confident H1 scale across routes, but section-header weight is chronically indistinct from body, and eyebrows fail contrast. |
| Color | **4/10** | Semantic outcome colors are genuinely good where they appear, but they coexist with arbitrary pastel "confetti" pills and a rogue purple — at least three palettes, no encoding grammar. |

---

### Spacing — 3/10

Spacing is the system's deepest failure, and it is failing the same way everywhere, which tells you it is *systemic*, not local.

**The signature defect: an unexplained vertical dead zone between hero subtitle and the tag/pill row.** It is documented with near-identical language and a measured pixel value on virtually every capability route:
- `capabilities_access-governance-pack` (~200px), `capabilities_command-risk-guard` (~150px), `capabilities_token-budget-guard` (~250px), `capabilities_release-gating` (~280px), `capabilities_ai-bom` (~140px), `capabilities_pii-guard` (~150px), `capabilities_hallucination-scoring` (~200px), `capabilities_smart-approval-engine` (~90px), `capabilities_incident-response-pack` (~120px), `capabilities_policy-coherence-analyzer` (~120px), `capabilities_behavioral-drift` (~200px).

Every reviewer independently read these as "a missing component," "a layout bug," or "broken." That is the tell: when the *same gap* appears at *different pixel values* across a dozen pages, there is no spacing token governing the hero-to-metadata relationship — each page is hand-spaced and none agrees.

**The second signature: the empty right 40–45% of the desktop fold.** Documented as "abandoned mid-build" on `capabilities`, `capabilities_config-integrity-seal` ("looks like a broken two-column layout missing its right panel"), `capabilities_smart-approval-engine` (~40% empty), `deploy`, `contribute`, `roadmap`, `transparency`, and every recipe route. A real grid system would either fill, constrain, or center that column. Instead a mobile-width column is dropped into a desktop shell unchanged — confirmed verbatim on `transparency_tokens` ("content column feels like a mobile layout in a desktop shell") and `recipes_pause-for-human`.

**The third: catastrophic bottom voids / min-height defects.** `home` (content in first 5–12% of a 13,000–20,000px canvas), `console` (60–80% black void), `roadmap` (~4,000px empty), `transparency_tokens` (~50% blank), `console_dashboard` (black dead zone above hero on every viewport). These are not breathing room; multiple reviewers flagged them as indistinguishable from render failure.

A mature spacing system would make all three impossible: a vertical rhythm scale would forbid arbitrary 90/120/150/200/250/280px gaps, and a max-width + grid contract would forbid the orphaned right column and the min-height voids.

---

### Radius — 6/10

Radius is the **only subsystem that behaves like it has a single source of truth.** Across pills, cards, code blocks, stepper nodes, and console chrome, reviewers consistently note "consistent corner radius" and "consistent border-radius" (`playground`, `console_decision...` "rounded corners on both cards are consistent and deliberate", `capabilities_token-budget-guard`). No route reports a jarring radius mismatch as a top issue.

It loses points only for **pill-shape inconsistency** — the same component drawn two ways: `recipes_block-dangerous-commands` flags "teal filled-border vs blue outline-with-icon looks like two different component generations," and `capabilities_policy-coherence-analyzer` notes "three outline-color systems on five pills." The radius value is shared; the pill *treatment* (fill vs. outline, icon vs. no-icon) is not. That is a component-token gap, not a radius-scale gap.

---

### Elevation — 3/10

There is **no elevation model**, and the absence shows up as two opposite failures.

1. **On marketing/doc surfaces, depth is so low it reads as broken.** `blog` is the worst case: "near-white cards on off-white background — barely perceptible contrast, feels unintentional," "card contrast against background is nearly invisible." `capabilities_ai-bom` flags the "Public transparency view" card as "visually inert — indistinguishable from the background." `transparency_red-team` notes the info box uses "same border weight and background as cards, conflating editorial callout with data card." When the only elevation device is a hairline border, and the border is sub-perceptible, cards stop existing as objects.

2. **On console surfaces, depth is a completely different language** — dark panels on black with macOS traffic-light chrome and soft shadows (`console_dashboard`, `console_tokens`, `console_drift`). The reviewers love these in isolation ("soft shadow that reads premium") but note they share nothing with the marketing card system. The product literally has two elevation vocabularies that never meet: hairline-on-white and dark-chrome-on-black.

A mature elevation system needs a defined ramp (e.g., surface-0/1/2 with a real tonal or shadow step) used by *both* the marketing cards and the console panels, so a "card" means one thing product-wide.

---

### Typography — 6/10

The strongest subsystem, and the closest to having a real scale.

**What works (system-level):** The H1 is consistently confident and well-weighted — it is the single most-praised element in the entire ledger (`deploy` H1 scored 8, `home` fold, `roadmap` "Stripe/Linear-caliber editorial voice," `transparency_pii` serif-with-hard-period). Eyebrow small-caps tracking and monospace package/hash treatment are applied consistently enough that reviewers recognize them as "system polish."

**What's broken (system-level), and it's the same flaw on ~15 routes: section headers (H2) carry almost no weight delta from body text.** Documented as a top issue on `capabilities_access-governance-pack`, `capabilities_red-team` ("all five section headers identical in size and weight"), `capabilities_behavioral-drift`, `capabilities_command-risk-guard`, `console`, `blog`, `how-it-works`, and the recipe routes. The result: long pages have no macro-scannability because the type ramp collapses to two tiers (H1 + body) with everything in between flattened. A mature type scale would enforce a *minimum* step between adjacent levels.

**Secondary recurring type failures:** mid-word hyphenation breaking reading flow (`architecture`); eyebrows below legible contrast (`transparency` "THE PRIVACY CONTRACT," `recipes_*` "GUARDRAIL RECIPE … functionally disappears"); H1 wrapping to 3–4 lines on mobile with no fluid clamp (`roadmap` "breaks the em-dash climax," `architecture_data-flow`, multiple recipes). Inverted hierarchy where **code blocks outrank H2s** on every blog post (`blog_human-approval-resume` worst-flaw, `blog_cap-token-spend`).

---

### Color — 4/10

Color is where "independently designed rather than system-designed" is most visible, because the good and the ad-hoc sit side by side.

**The genuine system (8–9/10 in isolation): the semantic outcome palette.** EXECUTE / REFUSE / ESCALATE / REQUEST_CONFIRMATION / DEFER / REWRITE with stable hues + matching icons is the single best design artifact in the product. It is the named "standout" or "best moment" on `architecture_data-flow`, `capabilities_access-governance-pack`, `capabilities_command-risk-guard`, `console_audit-explorer`, `console_dashboard`, `console_tokens`, and `transparency_red-team` (teal CLEAN vs coral REGRESSED). This is what a single-source token system *should* feel like.

**The ad-hoc system sitting right next to it: "pastel confetti" metadata pills.** Reviewers repeatedly diagnose these as un-tokenized:
- `capabilities` — "ADR and Tier badge pills use different, uncoordinated pastel colors per card — confetti rather than semantic system… feel like Tailwind defaults, not a token system."
- `capabilities_policy-coherence-analyzer` — "three outline-color systems on five pills with no shared logic; feels ad-hoc."
- `capabilities_token-budget-guard` — "tag pill color system (pink/red/amber/green/teal) has no visible semantic grammar; no legend, no grouping — looks decorative."
- `playground` / `recipes` — "tag chips introduce 4-5 colors with no on-screen semantic legend — noise, not signal."

So there are effectively **two palettes that look alike but mean different things**: one where color *encodes outcome* (rigorous) and one where color is *decorative noise on metadata* (random). A first-time viewer cannot tell which is which — that is the core coherence failure.

**The third color voice: the rogue purple.** The purple GitHub CTA is repeatedly flagged as "disconnected from the page's semantic palette" / "a rogue accent" (`console_approvals`, `console_red-team`, `capabilities_release-gating`, `transparency_integrity` "outcompetes the page's actual purpose"). It collides with the *also-purple* active-stepper pill (`capabilities_smart-approval-engine`: "two unrelated purple elements compete as primary accent"). One hue, two unrelated meanings — the inverse of the outcome-palette discipline.

**Severity color is under-deployed where it matters most:** `transparency_command-risk` and `transparency_pii` both render bar charts where "Destructive: 312 looks identical to Safe: 0" — the product *has* a severity palette but doesn't apply it to its own data viz.

---

### Where components are independently designed, not system-designed

Concrete duplications the ledger exposes:

1. **Two "card" languages** — hairline-on-off-white marketing card (invisible: `blog`, `capabilities_ai-bom`) vs. dark-chrome console panel (`console_*`). No shared surface token.
2. **Two outcome-chip implementations** — the rigorous semantic pill (console + capabilities folds) vs. the decorative pastel metadata pill (capability tag clusters, recipe tags). Same shape, opposite governance.
3. **Two pill *treatments*** — filled-with-border vs. outline-with-icon, called out as "two different component generations" on `recipes_block-dangerous-commands`.
4. **Two badge meanings for one hue** — purple = GitHub CTA *and* purple = active stepper step.
5. **The stepper** is the one component that *is* system-designed — praised on essentially every capability route as "the most polished / most intentional component." It proves the team *can* build to a single source of truth; they just haven't extended it to cards, pills, and surfaces.
6. **The "ILLUSTRATIVE REPLICA" banner** is reimplemented per console route with inconsistent register (`console_tokens` wraps to noise on mobile; `console_decision...` orphans "CONSOLE · SAMPLE DATA").

---

### What a mature single-source token system looks like here

1. **Spacing — adopt a 4/8px vertical-rhythm scale and a page-grid contract.** One `hero-to-metadata` spacing token (not 11 hand-tuned values). A `max-width` + 12-col grid that either fills or centers the right column — killing the "mobile layout in a desktop shell" defect. A page-shell with `min-height` governed so no route can emit a 4,000px void.

2. **Radius — formalize the 3-step radius scale that already exists** (`sm` pill, `md` card, `lg` panel) and bind pill treatment to it so a pill can't be filled-here / outlined-there.

3. **Elevation — define `surface-0/1/2` with a real, perceptible step** (tonal shift *or* shadow, not a sub-pixel hairline), and make *both* the marketing card and the console panel consume the same ramp so "card" means one thing.

4. **Typography — lock a 6-step modular scale with enforced minimum deltas** between adjacent levels (especially H2↔body, the chronic failure), fluid `clamp()` on H1 so it never wraps to 4 lines on mobile, and a contrast floor on eyebrows.

5. **Color — split the palette into two explicitly-named, mutually-exclusive token sets:**
   - `outcome.*` (execute/refuse/escalate/confirm/defer/rewrite) and `severity.*` (low→critical) — semantic, applied to chips *and* data viz.
   - `accent.*` / `neutral.*` for chrome — with the GitHub CTA demoted to a single brand-accent token that does *not* reuse the stepper's purple.
   - **Eliminate the decorative pastel metadata palette entirely**; metadata pills become neutral with one optional semantic accent. Add the legend the reviewers keep asking for, or remove the color.

The product already proves it can hit the bar — the **stepper** and the **outcome-pill palette** are genuine single-source-of-truth artifacts that reviewers consistently rate as keynote-quality. Maturity here is not invention; it's *propagation* — extending that same discipline to spacing, surfaces, and the metadata layer, and deleting the second, decorative copy of every component that already exists in a rigorous form.
