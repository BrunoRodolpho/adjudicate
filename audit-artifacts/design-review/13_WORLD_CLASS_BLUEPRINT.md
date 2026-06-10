# World-Class Design Blueprint (canonical)

> The decision-level specification for rebuilding adjudicate's marketing site to deserve Apple / Linear / Stripe / Vercel / Notion comparison. This is the **authoritative constitution**; the Elite pass's source-grounded token tables in [`elite-pass/08_WORLD_CLASS_BLUEPRINT.md`](elite-pass/08_WORLD_CLASS_BLUEPRINT.md) are the **extended reference** (full ramps, every component state). Where they differ, this file governs intent; that file governs detail. All values are AA-safe and assume a from-scratch rebuild (no backward-compat).

---

## 1. Design Principles — the rules that govern every screen
1. **Content exists without JavaScript.** Motion enhances a visible baseline; it never gates content. If JS fails, the page is whole.
2. **The system has the opinion, not the author.** Every spacing, radius, size, color, and shadow value comes from a token. Raw utility values are a lint error.
3. **Hierarchy comes from type and space, not containers.** One container per *semantic role*, never per content block. A border must earn its 1px.
4. **Every page earns its length.** Footer anchors within one viewport of the last block. No void stands in for composition.
5. **Color encodes meaning.** The decision palette is sacred; everything else is neutral. No decorative confetti.
6. **One thing per screen is loud.** Each page has a single focal moment; everything else supports it.
7. **Every pixel is load-bearing.** Optical correction is part of done, not polish-if-time.
8. **Restraint over embellishment.** When unsure, remove. The most premium move is usually deletion.

---

## 2. Layout System
- **Container max-widths:** prose `720px` · standard `1120px` · wide/console `1280px` · full-bleed for signature moments.
- **Grid:** 12-col desktop / 8-col tablet / 4-col mobile. Gutter `24px` desktop, `20px` tablet, `16px` mobile.
- **Spacing scale (4/8 base):** `2 4 8 12 16 24 32 48 64 96 128 160`. Nothing off-scale.
- **Section rhythm (named tokens):** `section-y` = `clamp(96px, 12vh, 160px)` between major sections · `block-y` = `48–64px` between blocks within a section · `stack` = `16–24px` within a block. The recurring **hero subtitle dead-band dies here** — the subtitle→meta gap is one `stack` token, never an improvised 280px.
- **Composition law:** every route is either (a) **asymmetric** — editorial left + payload right (console peek / code / diagram / receipt / stats), or (b) **centered optical single column** for pure editorial. No accidental two-column-missing-its-right-panel.

---

## 3. Typography System
- **Font stack:** display + text → `"Inter var"` (or a more characterful grotesk for display, e.g. a tight geometric) ; mono → `"GeistMono"`/`"JetBrains Mono"` for code, receipts, console.
- **Modular scale (1.25 major-third, desktop):**

| Token | Size / line-height / tracking | Use |
|---|---|---|
| `display` | 72 / 1.02 / -0.03em | home hero only |
| `h1` | 56 / 1.05 / -0.02em | page heroes |
| `h2` | 36 / 1.1 / -0.015em | section headers — **the decisive tier jump** |
| `h3` | 24 / 1.2 / -0.01em | sub-sections |
| `body-lg` | 19 / 1.6 / 0 | lede / intro |
| `body` | 16 / 1.6 / 0 | default prose |
| `meta` | 14 / 1.5 / 0 | captions, metadata |
| `label` | 12.5 / 1.3 / 0.04em | eyebrows/labels (cap the all-caps tracking; never below 12.5) |
| `code` | 14 / 1.55 / 0 | mono |

- **Mobile sizes are dedicated** (display→44, h1→36, h2→26) so **headlines never wrap into paragraphs.**
- **Measure:** prose locked to **62–72ch**. Code blocks scroll, never reflow-shrink below 13px.
- **Hierarchy rule:** section headers (`h2`) must outweigh body by *both* size and weight — never let a code block visually outrank an H2 (the blog/how-it-works failure).
- **Editorial article system** (blog/how-it-works): lede paragraph, pull-quotes, callout boxes, captioned code. No raw-markdown dumps.

---

## 4. Color System
- **Neutral ramp (the missing 10-step, light canvas):** `canvas #FAFAF9` → `surface #FFFFFF` → `surface-2 (2% tint, no border)` → borders `#ECECEC / #E0E0E0` → text `ink #18181B`, `body #3F3F46`, `muted #52525B` (AA on canvas), `faint #6B7280` (AA — darkened from today's failing `#A1A1AA`).
- **Dark console ramp:** `black #0A0A0B` → `panel #131316` → `panel-2 #1A1A1F` → border `#26262C` → text `#F4F4F5`, `console-muted #A1A1AA` (AA on panel — raised from today's failing faint).
- **Semantic decision palette (sacred, one source — `outcomes.ts`):** each outcome has a `*-strong` (text, AA) and a `*-fill`/`*-tint` (surface). EXECUTE emerald · REFUSE rose · REWRITE amber(**use the AA `rewrite.strong`, not the failing orange**) · DEFER blue · ESCALATE violet · REQUEST_CONFIRMATION cyan.
- **Status palette (small, governed):** shipped / roadmap / info / warn — these and *only* these may add color. **No other accent colors exist** (kills the teal/pink/lilac confetti and the one-off blog `indigo-600`).
- **Accent discipline:** one brand accent for primary CTA + key emphasis. Everything else is neutral or semantic.

---

## 5. Elevation System
- **Depth model — flat by default.** Hierarchy via tone + space first; elevation is rare and meaningful.
- **Shadow ramp (soft, multi-layer, low-opacity):** `e1` = `0 1px 2px rgba(0,0,0,.04)` (resting cards) · `e2` = `0 4px 12px rgba(0,0,0,.06)` (hover/popover) · `e3` = `0 12px 32px rgba(0,0,0,.10)` (dialogs/signature). No hard 1px-offset "cheap" shadows.
- **Border discipline:** a border OR a shadow OR a tint — **never two at once** on the same surface. Max **two** nesting levels of bounded surface, ever (today: up to five). Live-data surfaces use the dark-panel material; prose uses tint-or-nothing.

---

## 6. Component Standards
- **Buttons:** primary (accent fill, `e1`, radius `md`), secondary (neutral outline), ghost (text + chevron). One height scale (40 / 32 / 28). **`:focus-visible` ring on all.** CTA pairs share radius + optical baseline. Min touch target 44px.
- **Cards:** one `Card` primitive, radius `lg`, tint-or-`e1` (not both), one internal padding token. No nested cards beyond depth 2.
- **Pill / badge:** **one** primitive, driven by `outcomes.ts` + status palette. Dot optically centered on label x-height. Filled and outlined variants read at the same height (inset correction).
- **Forms (playground/sandbox):** one field system, labeled, `:focus-visible`, inline validation, mono for JSON.
- **Tables:** one `ResponsiveTable` — desktop dense, mobile horizontal-scroll with edge-fade + sticky first column; never clip, never drop a pane (tabs/accordion on mobile instead).
- **Navigation:** single source → header + footer + breadcrumbs; current-page state visually distinct from CTAs; mega-menu only if it earns it.
- **Dialogs:** one `Dialog` primitive — `role="dialog"`, focus trap, Escape, focus restore, `e3`. The mobile menu IS this.
- **Empty / loading / error / 404:** bespoke, branded, on-system. An empty state is *designed*, never a blank region.

---

## 7. Motion System
- **Durations:** micro `120ms` (hover/press) · standard `220ms` (entrance/reveal) · large `360ms` (page/dialog) · cinematic `600–900ms` (signature receipt).
- **Easing:** standard `cubic-bezier(.2,.0,0,1)` (entrance) · exit `cubic-bezier(.4,0,1,1)` · spring for playful affordances `stiffness 220 / damping 26`.
- **Reveal:** content visible at rest; entrance adds `opacity 0→1` + `translateY 8–12px→0` **only when JS + motion-OK**. `prefers-reduced-motion` → no transform, full content. Never `viewport once:true` as a visibility gate.
- **Hover:** cards lift `translateY(-2px)` + `e1→e2`, `160ms`. Links underline-grow. No layout shift (transform/opacity only).
- **Scroll choreography:** restrained — stagger children `40–60ms`, one signature scroll moment per page max. Linear/Vercel restraint, not a carnival.
- **Skeletons:** for any async (playground), tonal shimmer on the real layout, not spinners.

---

## 8. Responsive Philosophy
- **Desktop = composed density.** Fill the measure: alternating tonal bands, right-column payloads, denser technical surfaces. Never sparse.
- **Tablet = the brand survives.** The console terminal material, the pills, the type tiers all carry — no degradation to generic off-white.
- **Mobile = reflow, never drop.** Tables scroll, panels become tabs/accordions, code fits, touch targets ≥44px, no horizontal page scroll at 390/360. Dedicated mobile type sizes. **The mobile experience is first-class, not a casualty.**

---

## 9. Premium Experience Principles
What makes it feel **trustworthy:** content that always renders, AA contrast everywhere, a signed-receipt moment that proves the thesis, consistent vocabulary (six outcomes, one set of names).
**Sophisticated:** one type voice, one neutral ramp, restraint — deletion over decoration, tone over borders.
**Modern:** the white-card-on-black operator material, soft multi-layer shadows, optical precision, tasteful scroll-driven motion.
**Premium:** *one loud moment per screen*; the product remembered for **the signed black-box receipt**, the **six-outcome decision**, and the **operator console** — three signature moments, built full-bleed and cinematic, with everything else made quiet enough to let them land.

---

## The non-negotiables (if only five things ship)
1. **Add the four missing scales to the token layer** (spacing/radius/type/elevation) — the keystone.
2. **Content visible by default** + footer-anchoring — kill the voids.
3. **One pill + one semantic color system + a real neutral ramp** — kill the confetti and under-pigmentation.
4. **De-containerize** — hierarchy by type+space; max depth-2 surfaces.
5. **The signed-receipt signature moment** — give the product its one breathtaking thing.

Ship these five and the site crosses from *assembled* to *designed*. The remaining detail lives in `elite-pass/08_WORLD_CLASS_BLUEPRINT.md`.
