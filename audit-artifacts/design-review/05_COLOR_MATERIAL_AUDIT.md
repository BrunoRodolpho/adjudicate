# Color & Material Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

I have the full ledger. Writing the audit now from the evidence.

## COLOR & MATERIAL AUDIT

### Verdict

**Two products are wearing one design system, and neither material family is finished.** The evidence splits cleanly into a **light editorial canvas** (marketing, capabilities, recipes, transparency, blog — ~50 routes) and a **dark operator console** (the `console_*` family — ~12 routes). The light canvas verdict is **generic/template**: a near-monochrome off-white field where color does almost no work, "documentation-gray" prose walls, and pastel badge confetti masquerading as a token system. The dark console verdict is **technical/trustworthy at the fold, broken below it**: the white-card-on-black split and semantic decision badges are the single most premium material moment in the entire 232-screenshot corpus, but empty panels and dead voids undercut them on every viewport.

The unifying flaw across **both** families is **material absence, not material excess**. This is not an over-designed product — it is an under-pigmented one. The dominant defect ledger-wide is empty space reading as broken render (`home` premium 28 with an 80-95% void, `roadmap` premium 18 with no roadmap, `console` premium 22 with a 60-80% black void, `recipes_cap-blast-radius` premium 22). Surfaces, borders, and shadows are too timid to ever clutter; the problem is they're too timid to communicate.

---

### The neutral ramp: a two-point scale doing a ten-point job

The light canvas runs on essentially **three values**: off-white background, near-white card, near-black text. That is not a ramp — it's a near-collinear pair plus ink. The cost is documented repeatedly:

- **`blog` (premium 29)** — "Off-white background with near-white cards — barely perceptible contrast, feels unintentional… light grey-on-off-white looks unintentional." Color scored **4/4/4/4** across all four viewports. The cards literally disappear into the canvas.
- **`transparency_drift`, `transparency_integrity`, `transparency_pii`** — repeatedly "near-monochromatic," "grey-on-white," "cold neutral… a subtle warm undertone on the page background would add life." The disclaimer/info cards "use same border weight and background as cards, conflating editorial callout with data card."
- **`capabilities` full-page** — once the populated section ends, "no visual differentiation between sections (no dividers or tints) collapses the page into monotonous off-white."

**Prescription — establish a real 6-step neutral ramp:**
- `bg` (canvas, ~#FAFAF9 warm off-white) → `surface` (card, must be a *perceptible* step, not 2% lighter) → `surface-raised` → `border-subtle` → `border` → `text-muted` → `text`.
- The single most leverage-bearing fix in this entire audit: **make `surface` differ from `bg` by a visible amount** (target a 1.05–1.10:1 luminance ratio you can actually see, or invert it — tinted card on white). On `blog` and `transparency` the card-vs-canvas relationship is currently below perceptual threshold. This one change rescues four routes.
- Introduce **warmth**. The ledger names "cold," "clinical," "sterile," "anaemic" on `capabilities_ai-bom`, `blog_cap-token-spend`, `how-it-works`, `transparency_integrity`. A 2–4% warm hue shift on the neutral ramp converts "unstyled document" into "intentional paper."

---

### Surfaces & elevation: the light/dark material split is the product's strongest idea — and it's unmanaged

The **light-canvas vs dark-console split is real and load-bearing**, and where it's executed deliberately it produces the corpus's best moments:

- **`console_dashboard` (premium 42), `console_tokens` (premium 38), `console_decision` (premium 44)** — "hard white card / dark console split at the fold," "communicating the product's dual identity," "the strongest evidence of purposeful, information-rich product design." The white hero card floating on full-bleed black is repeatedly cited as the best moment on its route.

But the split is **undisciplined** in three ways the ledger pins precisely:

1. **The "box on dark" problem** — `console_decision` and `console_integrity`: "Hero white card on black background transition is abrupt — a subtle gradient or softer edge would lift it from 'box on dark' to intentional framing." The cards float without grounding.
2. **The dark surface dissolves into the page** — `console_audit-explorer`, `console_dashboard`, `console_ai-bom`: "dark console container bleeds into the black page background with insufficient edge separation," "sidebar and detail panel share dark backgrounds with no visible divider — spatial separation collapses." Two dark surfaces with no elevation delta between them.
3. **Responsive abandonment of the material itself** — `console_audit-explorer` is the smoking gun: "Background switches desktop-black to tablet off-white — a major regression that erases the terminal-aesthetic identity." The dark material is a desktop-only luxury that evaporates at the breakpoint where it's most needed.

**Prescription — formalize a two-tier elevation model per material:**
- **Light canvas:** `bg` → `card` (visible step) → `card-raised` (callouts/code). Stop using identical border+background for editorial callouts and data cards (`transparency_ai-bom`, `transparency_red-team`).
- **Dark console:** define `console-bg` (full black field) → `console-chrome` (the window/titlebar) → `panel` (data surface, a measurable step lighter than chrome) → `panel-raised` (selected row / active card). The traffic-light titlebar already reads as premium chrome everywhere it appears — give the panels *beneath* it an elevation delta so the sidebar/detail split survives.
- **Lock the dark material across breakpoints.** The terminal aesthetic is the brand's single best asset; never let it revert to off-white on tablet/mobile.

---

### Borders vs shadows: the discipline is right; the execution is invisible

The product is correctly **border-led, not shadow-led** — and that is the premium choice. The ledger almost never complains about heavy/blurry/stacked drop shadows (the classic over-design tell). Shadows appear deliberately and sparingly: `console_dashboard` "rounded corners… consistent and deliberate," `capabilities_token-budget-guard` "stepper card has a soft shadow that reads premium." Good instinct.

But the borders are **so thin they fail to do the structural work shadows would otherwise do:**
- `architecture_data-flow` — pipeline connectors are "plain hairline pills — wireframe-grade, not visualization-grade."
- `console_integrity`, `console_command-risk` — "horizontal rules under headers are hairline-thin and nearly invisible."
- `capabilities_ai-bom` — "'Public transparency view' card is visually inert — indistinguishable from the background, no affordance signalling interactivity."
- `playground` — "Toggle card has a barely-there hairline border… reads as static text, not an interactive affordance."

So the **border-vs-shadow rule should be:**
- **Borders for static structure** (cards, dividers, tables) — but at a weight you can see. Currently they're tuned to the same near-invisible value as the canvas contrast problem. Bump `border-subtle` to a real, perceptible line.
- **Shadow reserved exclusively for interactive elevation** (the one thing currently done well — the stepper). An element that can be clicked gets a shadow; an element that's just structure gets a border. This gives the `playground`/`capabilities` inert "cards-that-look-like-text" the affordance they're missing **without** adding clutter, and keeps shadow scarce enough to stay meaningful.

---

### Card proliferation & unnecessary borders: NOT the problem — the opposite is

This is the audit's counterintuitive finding. Most premium-bar critiques flag card proliferation. **This product has the inverse pathology:** uniform, undifferentiated card *flatness* and outright *missing* cards.

- **`recipes` (premium 34)** — "All eight cards at identical visual weight with no grouping or featured card — the page is a flat inventory dump… reads as a raw database export." Not too many cards — too *same*.
- **`capabilities` (premium 28)** — "Three of four capability families render with no cards" — the defect is card *absence*, hundreds of pixels of void.
- **`transparency` / `transparency_ai-bom` / `transparency_red-team`** — cards "render as empty grey rectangles" or "do not render on mobile." The card *content* is missing, not over-proliferated.

The one genuinely strong card pattern — **`capabilities` dual-corner badge card** (ADR ref + Tier badge) — is praised as "concise, information-dense… would look at home in a Linear or Vercel docs surface." The system *can* make a good card; it just doesn't differentiate weight (no featured card, no hierarchy) and doesn't reliably render content into the ones it draws.

**Prescription:** Don't reduce cards — **rank them.** Introduce one elevation tier above the default card for "featured" (the hero recipe, the primary capability family). The flatness, not the count, is what reads as a database export.

---

### Accent & semantic color: two systems fighting — one excellent, one confetti

The product has **two distinct color vocabularies**, and they have opposite quality:

**System A — semantic outcome color (EXCELLENT, the product's best chromatic asset):**
- The six/four-outcome decision pills (EXECUTE/REFUSE/ESCALATE/REQUEST_CONFIRMATION/DEFER/REWRITE) are the standout on nearly every capability route: `architecture_data-flow` ("most visually deliberate moment"), `capabilities_command-risk-guard` ("the entire decision space in one scannable, color-mapped glance"), `console_audit-explorer` ("genuinely distinctive operator-tool aesthetic").
- The red-danger / blue-safe comparison cards on **`architecture` (best moment of the whole corpus-opener)** "communicate the product's core value proposition instantly."
- Status semantics in the console — APPROVED teal / DECLINED red / EXPIRED gray (`console_approvals`), green Sealed / amber Drift / red violation (`console_integrity`), amber ELEVATED (`console_drift`) — are consistently the best-scored color moments.

**System B — metadata tag pills (CONFETTI, undermines the above):**
- `capabilities` — "ADR and Tier badge pills use uncoordinated pastel tints (pink, teal, orange, purple) that feel like Tailwind defaults, not a token system… confetti rather than semantic system."
- `capabilities_policy-coherence-analyzer` — "three outline-color systems on five pills with no shared logic; feels ad-hoc."
- `capabilities_token-budget-guard` — "Tag pill color system (pink/red/amber/green/teal) has no visible semantic grammar; no legend, no grouping — looks decorative."
- `capabilities_release-gating` — "Five outcome badges use 5 different hues with no shared token logic — feels assembled, not designed."
- `playground`, `recipes` — "4-5 colors with no on-screen semantic legend — noise, not signal."

**Prescription — collapse to one accent grammar:**
- **Promote System A to law.** Every outcome/status verb gets exactly one token, used identically everywhere it appears. This is already 80% true — formalize it.
- **Demote System B to neutral.** ADR refs, tier badges, package paths are *metadata*, not *status* — render them in the **neutral ramp** (gray outline pills), not chromatically. The pastel rainbow is the single biggest "template" tell in the light canvas. Color must mean something; metadata means nothing chromatically, so it should carry no hue.
- **One brand accent for action only.** The violet/purple GitHub CTA is the lone brand color and it's consistently effective — but the ledger repeatedly flags it *competing* with content (`capabilities` "purple GitHub CTA in nav is the most intentional color moment on the entire page" — damning, because nav chrome shouldn't out-color content; `console_approvals` "purple GitHub button injects an accent color absent from the page's semantic palette"; `home` "Primary CTA purple and headline gradient share the same hue — CTA needs more contrast"). Keep purple as the action accent, but give content sections their own accent energy so the nav stops winning the eye-path by default.

---

### Contrast relationships: weak where it counts, illegible at small sizes

Beyond the card-vs-canvas failure already covered, the ledger logs specific contrast breaks:
- **Pill/badge micro-text fails legibility** at mobile/tablet repeatedly: `capabilities_ai-bom` "all-caps micro-text in tag pills too small at 375px," `capabilities` "pills compress into tiny colored blobs," `architecture` pill-step labels "likely failing WCAG AA."
- **Amber-on-dark contrast risk** flagged explicitly: `console_tokens` "Amber 130,000… may fail WCAG AA contrast on the dark table background."
- **Ghost badges with insufficient contrast:** `roadmap` "CORE API FROZEN ghost badge is nearly invisible — outline too faint to distinguish status." A status badge you can't read is worse than no badge.
- **Eyebrow labels vanish:** `capabilities_hallucination-scoring`, `recipes_*` — "CAPABILITY/GUARDRAIL RECIPE eyebrow too small/low-contrast to function as wayfinding."

**Prescription:** Set a contrast floor. Every status pill must clear WCAG AA against *its actual background* (test amber/teal on the dark panel, not just on white). Establish a minimum legible size for all-caps tracked labels (~12px floor) and stop shipping eyebrows below it. Replace ghost/outline status badges with filled-tint badges so severity is never carried by a hairline outline alone.

---

### Gradient policy: one gradient, used once, used well — leave it that way

Gradients are essentially **absent**, which is correct for this product's register. The only one cited is the **`home` headline "beyond block-or-allow" violet gradient + radial purple bloom** — repeatedly the corpus's best single moment: "the one moment that would hold up on a Vercel or Linear keynote slide." `how-it-works` uses a **two-line color split** (black/violet thesis) to genuinely "do semantic work, not decoration."

**Prescription — keep gradients scarce and semantic:**
- **Permit** the hero brand-gradient (one per major landing surface, max).
- **Permit** color-as-syntax (the black/violet thesis split — color encoding meaning).
- **Forbid** decorative gradients on cards, buttons, and backgrounds. The product's restraint here is a strength; the failure mode to avoid is *adding* gradient noise to compensate for the flat neutral field. Fix the flatness with the **neutral ramp and surface steps above**, not with gradients.

---

### Target material system (summary)

| Layer | Light canvas | Dark console |
|---|---|---|
| **Ground** | warm off-white `bg` | full-black `console-bg` |
| **Surface** | `card` — *visible* step from bg | `panel` — visible step from chrome |
| **Raised** | `card-raised` (callouts, code) | `panel-raised` (selected/active) |
| **Chrome** | nav, banner | traffic-light titlebar |
| **Border** | `border-subtle` at a *perceptible* weight (static structure only) | hairline only where panels already separate by elevation |
| **Shadow** | reserved for interactive elevation only (the stepper model) | reserved for the floating hero card — grounded, not "box on dark" |
| **Status accent** | semantic outcome/decision palette (System A) — promoted to law | same palette, contrast-tested on dark |
| **Metadata** | neutral gray pills (System B demoted — no hue) | neutral gray pills |
| **Brand accent** | violet — action/CTA only, must not out-color content | violet — action only |
| **Gradient** | hero brand-gradient + color-as-syntax only | none |

**The one-sentence mandate:** This product is not noisy or over-designed — it is **under-pigmented and under-elevated**. Stop adding chromatic confetti to metadata, start making surfaces and borders perceptible, lock the dark-console material across every breakpoint, and promote the already-excellent semantic decision palette to the system's single source of color truth. The dual-material split (`console_dashboard`, `console_decision`) and the semantic outcome pills (`capabilities_command-risk-guard`, `architecture`) prove the team can hit the premium bar — the material system just needs the discipline to do it on every route, not three.
