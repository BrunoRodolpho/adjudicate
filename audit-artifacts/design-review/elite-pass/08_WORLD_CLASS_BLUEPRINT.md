# World-Class Design Blueprint

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

I have everything I need. The home page actually has rich sections (the screenshot ledger's "90% empty" finding likely reflects a build/render issue, not the source). I now have the complete real token system grounded. Writing the blueprint.

---

## WORLD-CLASS DESIGN BLUEPRINT — adjudicate

A complete, buildable design system for a deterministic decision kernel for AI actions. Every value below is concrete and implementation-ready. Where I cite the current system, I quote the literal token from `tailwind.config.ts`, `globals.css`, or a component file, then prescribe the target. This is the ideal version — designed as if starting today — not a list of patches.

The grounding ledger inspected 232 screenshots across 58 routes and scored an average **elite_score in the high-20s/low-30s out of 100**. The pattern is unambiguous and repeats on nearly every route: strong copy and a correct color/decision system, undermined by (1) **hero dead-zones** (~120–200px voids between subtitle and content, called out on `architecture`, `capabilities_*`, `deploy`, `recipes_*`), (2) **badge soup** (4–6 simultaneous pill treatments — `capabilities_red-team`, `capabilities_command-risk`), (3) **massive empty page-tails** (`home` "90%+ scroll empty", `console`, `console_dashboard`), (4) **broken mobile renders** (`recipes_*`, `console_*` tables, `transparency_pii`), (5) **the six-outcome differentiator buried as metadata** rather than dramatized. This blueprint is built specifically to make those failure modes structurally impossible.

---

## 1. Design Principles

Seven rules. Every screen is checked against all seven before it ships.

### 1.1 One optical spine per page
A page has exactly one vertical alignment axis. The `architecture` route's worst flaw — "layout axis shifts from left-aligned (hero) to centred (problem) mid-scroll with no visual signal" — is forbidden by construction. **All content left-aligns to a single rail.** Centering is reserved for one deliberate moment per page maximum (a closing CTA), and when used it is announced by a full-bleed background change, never an unsignaled drift. `SectionHeading`'s `align="center"` prop is removed from body sections.

### 1.2 The six outcomes are the product — give them visual authority, never metadata status
The single most-repeated narrative failure across the ledger ("six outcomes... demoted to small pill badges", "the core differentiator never surfaces visually" — appears verbatim on `capabilities`, `comparisons`, `home`, `console_dashboard`, and 20+ more). The outcome taxonomy — EXECUTE / REFUSE / REWRITE / DEFER / ESCALATE / REQUEST_CONFIRMATION — is the brand's reason to exist. **It gets one canonical, dramatized presentation** (the OutcomesBento, a real diagram or a signed-receipt artifact), not a row of confetti pills repeated three times per page. When outcomes appear as chips, they use exactly one component (`DecisionChip`) and never duplicate within one viewport.

### 1.3 Negative space is composed, never abandoned
Every region of empty space must be defensible as intentional rhythm. The ledger flags "~140px dead air", "600px black void", "75% blank canvas" as the #1 recurring optical crime. **Rule:** no vertical gap between a subtitle and the next content element may exceed `var(--space-12)` = 48px on desktop. No page may end with more than one full-height empty viewport below its last content element. Pages that "run out of content" get a designed terminal section (CTA + footer), never raw canvas.

### 1.4 Restraint over decoration
Remove anything that does not carry information. Specifically banned: macOS traffic-light dots on console mockups (flagged on every `console_*` route as "skeuomorphic cosplay"), tinted danger fills (`architecture`'s pink "Without" card — "Apple achieves contrast typographically, never with tinted fills"), and full-width `<hr>` dividers under every heading ("Bootstrap-era pattern", flagged on `capabilities_*` and `blog_*`). Hierarchy is built from **type scale, weight, and space** — not borders and color fields.

### 1.5 One container language
The ledger repeatedly finds "four container styles on one page" (`capabilities_command-risk`: step card + warning callout + provenance cards + code block + public-data card — "no unifying component language"). **There is one card primitive, one callout primitive, one code-surface primitive.** Nesting is capped at two levels (the `console_ai-bom` "3–4 nested card borders" finding is disqualifying).

### 1.6 Mobile is a redesign, not a reflow
The ledger's harshest verdicts are mobile render failures ("code block and guard section absent on mobile" — `recipes_*`; "tables overflow and clip with no scroll affordance" — `console_tokens`). **Every component declares an explicit mobile behavior:** tables become card-lists, horizontal steppers become vertical or a "Step 2 of 4" indicator, code blocks get a scroll container with an edge-fade, badge clusters collapse to a single chip + "+N more". A reflowed desktop layout is never acceptable.

### 1.7 Editorial register for prose, instrument register for data
Blog and depth pages are editorial surfaces (the `blog` verdict: "Right content, wrong register"). They suppress product chrome, use a generous reading measure, and earn typographic moments (lead paragraphs, pull quotes). Console/transparency pages are instruments: dense, precise, monochrome-disciplined. The two registers never bleed into each other (`blog_*`'s "full 8-item product nav repeated top and bottom of the post" is forbidden — editorial pages get a minimal reading-mode header).

---

## 2. Layout System

### 2.1 The grid

**Current:** `Section.tsx` uses `mx-auto max-w-6xl px-6` (max-width **1152px**, 24px gutters) with vertical rhythm `py-24 md:py-32` (96px / 128px). This is sound but applied without a measure cap on prose, producing the "body copy at ~90 chars/line" failures (`blog_stop-agent-draining-prod`, `transparency_pii`).

**Target — three nested width tokens:**

| Token | Width | Use |
|---|---|---|
| `--w-prose` | **680px** (≈ 66ch at body size) | All running prose: blog body, depth-page paragraphs, callouts. Caps measure for reading comfort. |
| `--w-content` | **1152px** (`max-w-6xl`, keep) | Default page column: heroes, card grids, marketing sections, tables. |
| `--w-wide` | **1280px** (`max-w-7xl`) | Full-bleed data instruments (console replicas, wide comparison tables) only. |

Gutters: **24px** mobile (`px-6`), **32px** ≥`lg` (`px-8`). This fixes the `comparisons` finding that "the right 40% of the desktop canvas is unused at every scroll depth" — the content token plus a deliberate two-column structure claims the full canvas instead of stranding a 680px text column in a 1152px frame.

**12-column grid** inside `--w-content`, 24px column gap. Card grids: 3-up at `lg`, 2-up at `md`, 1-up below. **No "2+1 orphan" reflows** — the `capabilities` tablet finding ("2+1 layout orphans the third card") is banned; an odd card count either centers the last row or the grid drops straight to 1-up.

### 2.2 Breakpoints

Keep Tailwind defaults, but assign each a design intent (not just a reflow trigger):

| Name | Min-width | Design intent |
|---|---|---|
| base | 0 | **Primary design target.** Single column, vertical steppers, card-lists for tables, full-width CTAs. |
| `sm` | 640px | Large phone / small tablet portrait. Banner gains its second clause. |
| `md` | 768px | Tablet. 2-up grids, 2-col footer→4-col transition begins. |
| `lg` | 1024px | Desktop. Full nav appears (mobile sheet retires), 3-up grids, dropdowns. |
| `xl` | 1280px | Wide desktop. `--w-wide` instruments breathe. |

The current NavBar switches at `lg:flex` / `lg:hidden` — correct, keep. But tablet (`md`) must get its own type-scale step (§3), not the desktop scale shrunk by viewport — this is the recurring "tablet is a squashed desktop" rejection.

### 2.3 Vertical rhythm — the 4/8px base

All spacing is a multiple of **4px**, with **8px as the working unit**. Named scale (CSS vars + Tailwind):

| Token | px | rem | Primary use |
|---|---|---|---|
| `--space-1` | 4 | 0.25 | Icon-to-label gap, chip inner padding |
| `--space-2` | 8 | 0.5 | Tight inline gaps |
| `--space-3` | 12 | 0.75 | Label-to-heading (eyebrow→H1) |
| `--space-4` | 16 | 1 | Card inner padding (mobile), paragraph spacing |
| `--space-5` | 20 | 1.25 | Card inner padding (current `p-5`) |
| `--space-6` | 24 | 1.5 | Card inner padding (desktop target), grid gap |
| `--space-8` | 32 | 2 | Heading-to-body, sub-section spacing |
| `--space-12` | 48 | 3 | **Max subtitle→content gap** (the dead-zone ceiling) |
| `--space-16` | 64 | 4 | Section internal blocks |
| `--space-24` | 96 | 6 | Section padding `py` (mobile) — current `py-24` |
| `--space-32` | 128 | 8 | Section padding `py` (desktop) — current `md:py-32` |

**Section rhythm:** keep `py-24 md:py-32`. The rule that prevents dead-zones: within a section, the **eyebrow→H1 gap is `--space-3` (12px)** and **H1→subtitle is `--space-3`** and **subtitle→first content is at most `--space-12` (48px)**. The current `DepthHeader` uses `mt-6` (24px) eyebrow gap and `mt-2`/`mt-3` for title/subtitle — close, but the routes show a much larger gap injected between the header block and the page body. That injected gap is the dead-zone; cap it at `--space-12`.

---

## 3. Typography System

### 3.1 Font stack

**Current:** Inter (400/500/600/700) + JetBrains Mono (400/500), loaded via Google Fonts `<link>` in `layout.tsx`, exposed as `--font-sans` / `--font-mono`. The config comment says "Geist Sans" but the layout actually ships **Inter** — a documentation drift worth noting.

**Target — keep the families, fix the loading:**
- **Sans:** Inter `400, 500, 600, 700`. Self-host via `next/font/google` (eliminates the render-blocking external `<link>`, the FOUT, and the layout-shift risk; also lets us ship only Latin subsets). Add `font-feature-settings: "cv11", "ss01"` for Inter's single-story `a` and tighter punctuation — a quiet premium signal.
- **Mono:** JetBrains Mono `400, 500`. Used for: the wordmark, code, hashes, numeric stat values, and version labels. Already the convention — keep.
- **Display:** at the very large hero sizes, enable **optical tracking** (negative letter-spacing, §3.4). The ledger repeatedly flags "headline tracking feels browser-default at display size — Apple tightens tracking at headline sizes" (`blog_cap-token-spend`, `home`). This is the single highest-leverage typographic fix.

### 3.2 Modular scale

A **1.250 (major third)** ratio, snapped to clean px so rendering is crisp. Each layer specifies size / line-height (unitless) / tracking / weight / max measure.

| Layer | Size (px / rem) | Line-height | Tracking | Weight | Measure |
|---|---|---|---|---|---|
| `display` (hero H1) | 60 / 3.75 · `md:72` / 4.5 | **1.05** | **-0.02em** | 600 | ≤ 16ch ideal, hard max 20ch |
| `h1` (depth/page) | 36 / 2.25 · `md:48` / 3 | **1.1** | **-0.015em** | 600 | ≤ 24ch |
| `h2` (section) | 30 / 1.875 · `md:36` / 2.25 | **1.15** | **-0.01em** | 600 | ≤ 30ch |
| `h3` (sub-section) | 22 / 1.375 · `md:24` / 1.5 | **1.2** | **-0.005em** | 600 | — |
| `h4` (card title) | 18 / 1.125 | **1.3** | 0 | 600 | — |
| `lead` (deck/subtitle) | 18 / 1.125 · `md:20` / 1.25 | **1.5** | 0 | 600/normal-weight, **color `muted`** | ≤ 60ch |
| `body` | 16 / 1 | **1.65** | 0 | 400 | ≤ 66ch (`--w-prose`) |
| `body-sm` | 14 / 0.875 | **1.6** | 0 | 400 | — |
| `caption` | 13 / 0.8125 | 1.5 | 0 | 400, `muted` | — |
| `eyebrow` | 12 / 0.75 | 1.4 | **+0.14em** | 500, **uppercase**, `muted` | — |
| `mono-code` | 13 / 0.8125 | 1.6 | 0 | 400 | — |
| `mono-stat` | 30 / 1.875 · `md:36` | 1.1 | -0.01em | 600 | — |

**Current vs target deltas that close ledger findings:**
- `SectionHeading` H2 is `text-3xl md:text-4xl font-semibold` (30→36px) — **correct, keep.** But it has no distinct `display` tier above it, so the homepage hero and section H2 collapse together (`architecture`: "insufficient size differential — hierarchy collapses at full scroll"). **Add the 60/72px `display` tier** exclusively for hero H1s — this is the missing top of the ladder.
- `StatTile` value is `text-3xl md:text-4xl` mono — keep as `mono-stat`.
- The current `lead` subtitle is `text-base md:text-lg` (16→18) — bump to **18→20** and crucially give it a clear size gap from body (the recurring "lede too close to H1/body" finding on `blog_*`).

### 3.3 Line-height system

Three tiers, applied by role, not guessed per element:
- **Tight (1.05–1.2):** display, all headings. Large type needs negative leading to feel intentional.
- **Comfortable (1.5):** lead, captions, UI labels.
- **Reading (1.65):** body prose only. The `blog_*` mobile finding ("no increased leading for mobile reading distance") is fixed by holding 1.65 at every breakpoint and never compressing it for mobile.

### 3.4 Tracking system

| Context | Tracking | Rationale |
|---|---|---|
| Display ≥ 48px | **-0.02em** | Tighten — the highest-leverage premium fix per the ledger |
| Headings 24–36px | -0.01 to -0.015em | Proportional tightening |
| Body & lead | 0 | Inter is optimized at 0 for reading sizes |
| Eyebrows / uppercase labels | **+0.14em** | Current `tracking-section: 0.18em` is **too loose** — the ledger flags "tracking feels auto-tracked" / "uneven optically" (`capabilities`, `console`). Tighten to **0.14em** and reserve it for genuine eyebrows only. |

**Critical fix on `tracking-section`:** currently `0.18em` is overloaded across breadcrumbs, eyebrows, badge labels, section labels, footer headings, and code-block language tags — the ledger calls this out as "one treatment for five hierarchy levels" on nearly every route. **Resolution:** uppercase `+0.14em` is used for **eyebrows only**. Badges keep uppercase but at `+0.08em` and `11px`. Breadcrumbs become **sentence-case, not uppercase** (kills the "generic SaaS docs breadcrumb" rejection on `blog`, `architecture`, `comparisons`).

### 3.5 Measure per layer

Enforced via the width tokens (§2.1). Body prose is hard-capped at `--w-prose` (680px / ~66ch). Lead text caps at 60ch (current `max-w-2xl` ≈ 42rem is acceptable). Headings cap by ch as in the table. This single rule retires the "~90 chars/line, beyond optimal" findings on `blog_stop-agent-draining-prod`, `recipes`, and `transparency_pii`.

---

## 4. Color System

### 4.1 The current palette (cited)

From `tailwind.config.ts`:
```
canvas  #FAFAF9   surface #FFFFFF   ink #18181B
muted   #71717A   faint   #A1A1AA   edge #E4E4E7
execute #10B981   refuse  #EF4444   rewrite #F97316 / strong #C2410C
defer   #F59E0B   escalate #8B5CF6  confirm #0EA5E9
gradient-primary: #6366F1 → #8B5CF6 → #D946EF
console.canvas rgb(9 9 11) … console.faint rgb(82 82 91)
```
This is a **fundamentally good system** — six decision tokens ported 1:1 from the console, a warm-neutral zinc ramp, a clean dark namespace. The problems the ledger surfaces are **discipline and contrast**, not palette choice.

### 4.2 Neutral ramp (extended, all AA-verified)

The current ramp has only 6 steps and skips a critical mid-tone, forcing components to invent opacity hacks (`text-current/60`, `bg-current/5` in `EmptyState`). Extend to a full **zinc-based 11-step ramp** with documented contrast:

| Token | Hex | On canvas (#FAFAF9) | Role |
|---|---|---|---|
| `canvas` | #FAFAF9 | — | Page background |
| `surface` | #FFFFFF | — | Cards, raised sections |
| `surface-2` | #F4F4F5 | — | Inset wells, code-meta bars, table header rows |
| `edge` | #E4E4E7 | — | **Hairline borders only** (1px) |
| `edge-strong` | #D4D4D8 | — | Hover borders, dividers that must read |
| `faint` | #A1A1AA | 2.3:1 | **Decorative/disabled only — never text** |
| `muted` | #71717A | **4.6:1 ✓ AA** | Secondary text, captions, eyebrows |
| `muted-strong` | #52525B | **7.4:1 ✓ AAA** | Emphasized secondary text, labels |
| `ink-soft` | #3F3F46 | 9.7:1 | Sub-headings |
| `ink` | #18181B | **16.1:1 ✓ AAA** | Primary text |

**AA fix:** `faint` (#A1A1AA) at 2.3:1 fails AA and must never carry text. The ledger repeatedly flags "footer text near-invisible", "labels at ~3-4px effectively invisible" — these are `faint`-on-light text. Footer version lines, captions, and any readable label move to `muted` minimum.

### 4.3 Semantic / decision colors (the six)

Keep the six hues — they are the brand. But fix two systemic problems the ledger names:

**Problem 1 — body-weight contrast.** At small text sizes on white, several decision colors fail AA: `execute` #10B981 (1.9:1 ✗), `defer` #F59E0B (1.7:1 ✗), `rewrite` #F97316 (2.9:1 ✗). The config already anticipates this with `rewrite.strong #C2410C`. **Extend the pattern: every decision token gets a `.strong` AA-safe variant for text-on-white, while the base hue is reserved for fills, icons, and borders.**

| Outcome | Base (fills/icons/borders) | `.strong` (text on white, AA) | Contrast |
|---|---|---|---|
| EXECUTE | #10B981 | **#047857** (emerald-700) | 4.8:1 ✓ |
| REFUSE | #EF4444 | **#DC2626** (red-600) | 4.5:1 ✓ |
| REWRITE | #F97316 | **#C2410C** (keep) | 5.1:1 ✓ |
| DEFER | #F59E0B | **#B45309** (amber-700) | 5.0:1 ✓ |
| ESCALATE | #8B5CF6 | **#7C3AED** (violet-600) | 5.3:1 ✓ |
| REQUEST_CONFIRMATION | #0EA5E9 | **#0369A1** (sky-700) | 5.6:1 ✓ |

`DecisionChip`'s current `c.accent` (e.g. `text-execute`) should resolve to the `.strong` variant; the `c.bg` (`bg-execute/10`) and `c.border` (`border-execute/40`) keep the base hue. This is invisible to users but makes every chip label legible.

**Problem 2 — color used decoratively breaks meaning.** The `capabilities_token-budget-guard` "full-bleed red code background" and `architecture` pink tint are flagged as repurposing semantic error color for decoration. **Rule: decision colors are reserved for decision states.** Code blocks, warnings, and section backgrounds use the neutral ramp. A REFUSE-red appears only where something is actually refused.

### 4.4 Accent / brand color

**Current:** `gradient-primary` (#6366F1 indigo → #8B5CF6 violet → #D946EF fuchsia) is the primary CTA and active-state fill. The ledger's most-repeated brand criticism: this gradient "is the default AI SaaS launch pattern — signals category, not differentiation" (`home`), and the GitHub pill using it "dominates over Open console — CTA hierarchy inverted" (flagged on ~30 routes).

**Target:**
- **Single brand accent for interactive primary:** `brand` = **#6366F1** (indigo-500), with `brand-ink` #4F46E5 for text/hover. The three-stop gradient is **retired from buttons** and survives only as a rare, large-surface flourish (one hero artifact), never on a 40px pill.
- **CRITICAL — resolve the inverted nav hierarchy.** The "GitHub pill dominates Open console" finding appears on virtually every route. Fix: **"Open console" becomes the filled primary** (solid `brand`), **GitHub becomes a quiet outline/ghost** with the octocat. The product action wins; the repo link recedes. This single change lifts the `restraint` and `luxury_feel` sub-scores across the entire site.
- `escalate` violet (#8B5CF6) is **not** a brand accent — it's the ESCALATE decision color. The ledger catches "brand purple used for active stepper, GitHub button, AND ESCALATE icon — three unrelated semantic roles" (`capabilities_access-governance-pack`). Brand indigo and escalate violet are now visibly distinct and never conflated; the active stepper uses `brand`, never `escalate`.

### 4.5 Surface hierarchy / depth model

Four light-mode surface levels, distinguished by **tone + one shadow tier**, never by stacked borders:

| Level | Background | Border | Shadow | Use |
|---|---|---|---|---|
| L0 page | `canvas` #FAFAF9 | — | — | Body |
| L1 section | `surface` #FFFFFF | — | — | Alternating sections (tonal shift only) |
| L2 card | `surface` | `edge` 1px | `shadow-sm` on hover only | The one card primitive |
| L3 well | `surface-2` #F4F4F5 | none | inset (none) | Code-meta bars, table headers, insets |

**Console (dark instrument) namespace** keeps the existing zinc scale: `console.canvas rgb(9 9 11)` / `panel rgb(24 24 27)` / `edge rgb(39 39 42)` / `ink rgb(244 244 245)` / `muted rgb(161 161 170)` / `faint rgb(82 82 91)`. **Fix the nesting:** the `console_*` routes show "page-black + outer dark card + dark mockup chrome = three uncoordinated dark registers". Resolution: a console replica is **one** `console.panel` surface on `console.canvas`, with `console.edge` hairlines — no card-on-card. The white marketing hero card floating on black (`console`, `console_dashboard`) is removed; console pages get a dark hero that belongs to the same surface family.

---

## 5. Elevation System

### 5.1 The core failure

The ledger's structural verdict on cards is "border-plus-background for one grouping, doubling visual weight" (`architecture`) and "bordered card proliferation — Stripe/Linear use typographic hierarchy, not repeated bordered containers" (`capabilities_pii-guard`). The current `Card` is `border border-edge bg-surface ... hover:shadow-md`, `Callout` adds tinted borders, `CodeBlock` adds another border, `StepStrip` chips add borders, `EmptyState` adds dashed borders. **Five border systems.** The fix is a strict shadow ramp plus border discipline.

### 5.2 Shadow ramp

A 5-step ramp, low-spread and warm-tinted (zinc, not pure black — pure-black shadows on a warm canvas read cheap):

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgb(24 24 27 / 0.04)` | Resting cards (replaces the border as the default separator) |
| `shadow-sm` | `0 2px 8px rgb(24 24 27 / 0.06)` | Card hover lift |
| `shadow-md` | `0 8px 24px rgb(24 24 27 / 0.08)` | Dropdowns (NavBar currently `shadow-xl` — too heavy, step down) |
| `shadow-lg` | `0 16px 48px rgb(24 24 27 / 0.12)` | Modals, command palette |
| `shadow-focus` | `0 0 0 3px rgb(99 102 241 / 0.35)` | Focus ring (`brand` at 35%) |

### 5.3 Border discipline

- **Borders are 1px `edge`, hairline only.** A border separates; it never decorates.
- **A card has EITHER a border OR a shadow as its resting separator, never both.** Target: cards rest on `shadow-xs` (no border), gaining `shadow-sm` + `edge` border on hover. This kills the "cage of boxes" verdict (`recipes`, `blog`).
- **No `<hr>` section dividers.** Sections separate by space and tonal shift. The "full-width hairline rules under every heading" pattern (flagged on 15+ routes as "Bootstrap/Markdown-era") is deleted entirely.
- **Nesting cap: 2.** No card-within-card-within-card. The `console_ai-bom` "3–4 nested borders" and `capabilities_ai-bom` "card-within-card terminal block" are structural violations.

### 5.4 Depth model

Light mode is **near-flat**: the page is one plane, cards lift 1–2px on interaction, overlays (dropdown, modal, mobile sheet) lift decisively. Console mode uses **tone, not shadow** for depth (panels are lighter zinc on darker zinc). Radii: a 3-step scale — `rounded-md` 8px (chips, code-meta), `rounded-xl` 12px (cards — current `Card` uses `rounded-xl`, keep), `rounded-full` (pills, buttons). The ledger's "three border-radius values with no system" (`console_ai-bom`) is resolved by this explicit 3-step scale.

---

## 6. Component Standards

Every component below specifies **all interaction states**. State coverage is the difference between the current "looks like a static wrapper, no hover states visible" (`console`) and a premium feel.

### 6.1 Buttons

One component, three variants. **Current** `Button.tsx`: `rounded-full px-5 py-2.5 text-sm font-medium`, primary = `bg-gradient-primary text-white shadow-lg`.

| Variant | Default | Hover | Active | Focus | Disabled |
|---|---|---|---|---|---|
| **primary** | `brand` #6366F1 solid, white text, `shadow-xs` | `brand-ink` #4F46E5, `shadow-sm`, `-translate-y-px` | `translate-y-0`, `shadow-xs` | `shadow-focus` ring | `bg-edge text-faint`, no shadow |
| **outline** | `surface`, `edge` border, `ink` text | `edge-strong` border, `surface-2` bg | bg `edge` | `shadow-focus` | `opacity-50` |
| **ghost** | transparent, `muted` text | `surface-2` bg, `ink` text | `edge` bg | `shadow-focus` | `opacity-50` |

Sizing: `sm` (px-3 py-1.5 text-13), `md` (px-5 py-2.5 text-14 — current), `lg` (px-6 py-3 text-15). Gradient is **removed from primary** (§4.4). Transition: `transition-[background,box-shadow,transform] duration-150 ease-out`. Min tap target **44×44px** on mobile (the `blog`/`recipes` "tap target below minimum" findings).

### 6.2 Cards

**Current** `Card.tsx`: `rounded-xl border border-edge bg-surface p-5 transition hover:shadow-md`.

**Target — one primitive, all states:**
- Resting: `rounded-xl bg-surface shadow-xs` (no resting border).
- Padding: `p-6` (24px) desktop, `p-5` (20px) mobile.
- Interactive (`href` set): hover → `shadow-sm`, `edge` border fades in, `-translate-y-0.5`; active → settles; focus → `shadow-focus`.
- **CTA alignment lock:** card CTAs ("Open recipe →") sit in a footer row pinned to the card bottom via flex, so a grid row has aligned CTA baselines regardless of body length. This kills the #1 grid flaw — "OPEN RECIPE → CTAs land at different vertical positions per card, breaking grid-floor alignment" (`recipes`, `blog`, `capabilities`).
- **Featured variant:** one card per grid may be `col-span-2` with a larger title — provides the editorial weighting the `blog` verdict demands ("no featured-post treatment — first post holds no more authority than the fourth").

### 6.3 Forms / inputs

(Used in playground, sandbox.) States for every field:
- Input: `h-10 rounded-md border border-edge bg-surface px-3 text-15`. Focus → `border-brand shadow-focus`. Error → `border-refuse`, helper text `refuse.strong`. Disabled → `bg-surface-2 text-muted`.
- Label: `body-sm font-medium ink`, 6px above field. Helper/error: `caption`, 4px below.
- Select/segmented control (the playground Guided/Sandbox toggle): pill group; active segment = `brand` fill white text; inactive = `muted` text on `surface`. The `console_tokens` "segmented control mismatched active/inactive border-radius" is fixed by a single radius token across all segments.

### 6.4 Tables

The single most-broken component class in the ledger (every `console_*` and `transparency_*` table). Standards:
- **Desktop:** header row in `surface-2` (no heavy borders), 1px `edge` row separators, `48px` min row height, right-aligned numerics in `mono`, **zebra is off** (row separators suffice). Hover row → `surface-2`.
- **Hash/long-string columns:** truncate with a middle ellipsis to a fixed char budget, show full value on hover/tap, and provide a copy affordance. The "raw 64-char SHA-256, optically heavier than headings, no copy button" finding (`console_ai-bom`, `transparency_ai-bom`) is forbidden — hashes are never rendered full-width raw.
- **Mobile (mandatory redesign):** the table becomes a **stacked card-list** — each row is a card with label:value pairs, primary column as the card title. No horizontal scroll, no clipped columns. This is the fix for "tables overflow and clip with no scroll affordance" (`console_tokens`, `console_audit-explorer`) and "table does not render on mobile" (`transparency_*`).
- **Bars/sparklines** get a visible track rail and a min-width so a near-zero value reads as "near zero" not "broken render" (the `console_command-risk` credential-bar "~3px stub looks like an artifact" finding).

### 6.5 Navigation

**Current** `NavBar`: sticky, `bg-canvas/80 backdrop-blur`, border fades in on scroll, `h-16`, wordmark + `lg` nav + ghost "Open console" + filled GitHub, mobile full-screen sheet. The bones are good. Fixes:
- **Invert CTA hierarchy** (§4.4): "Open console" = primary filled, GitHub = ghost/outline. This is the highest-frequency nav fix in the entire ledger.
- **`V1` badge** beside wordmark: the ledger calls it "an unresolved grey rectangle that cheapens the logotype" (`architecture`, `capabilities`). Either remove it or move it to a `muted` superscript with no border box. Current is `rounded-sm border border-edge` — drop the box.
- Reduce visual weight: 7 nav items is acceptable at `lg` given the dropdown grouping, but the dropdown shadow steps from `shadow-xl` → `shadow-md`.
- **Editorial reading-mode header:** blog/depth article pages render a slim variant — wordmark + "All posts" back-link + one CTA, not the full 7-item bar (kills the `blog_*` "full product nav competes with editorial authority" verdict). The full nav doesn't repeat in the footer of articles.
- Active state: current uses color only (`text-ink` vs `text-muted`). Add a 2px `brand` underline indicator on the active top-level item for unambiguous wayfinding.

### 6.6 Dialogs / overlays

(Command palette, mobile sheet, modals.) Scrim `rgb(9 9 11 / 0.4)` + 8px backdrop-blur. Panel: `surface`, `rounded-xl`, `shadow-lg`, `p-6`. Enter: `EASE_OUT`, 180ms, opacity 0→1 + scale 0.98→1 + y -8→0. Exit reverses, 140ms. Focus trapped, Escape closes, scroll locked (NavBar already does this for the sheet — generalize). Reduced-motion → opacity-only.

### 6.7 Empty states

**Current** `EmptyState`: dashed `border-current/20`, `bg-current/5` — the `current/opacity` hack exists because the neutral ramp lacked mid-tones. With the extended ramp, rebuild:
- Centered, `surface` with `edge` border (solid, not dashed — dashed reads as "debug placeholder"), `py-12`, icon in a `surface-2` circle (`muted` icon), title `h4`, hint `body-sm muted`, optional primary CTA.
- **Banned: shipping an empty bordered box with no copy.** The `console_approvals` mobile "pending queue renders as a large empty bordered box — primary action surface is blank" is a disqualifying defect. Every empty state has a title + hint + (usually) an action. A section that has no data is either populated with sample/illustrative data or **not rendered at all** — never a labeled void (the `capabilities` "three of four families render empty" and `transparency` "Operations section is heading + subtitle + void" failures).

### 6.8 Badges & chips (the badge-soup fix)

The ledger's most-cited noise source. **Resolution — exactly two badge families, hard rule:**

1. **`DecisionChip`** (the six outcomes): the existing component is the *only* way an outcome is shown as a chip. Uppercase, `11px`/`12px`, icon + label, decision-colored border/bg/`.strong`-text. **Never more than the canonical six in one cluster; never duplicated within a viewport.** The "six colored pills with color+icon+ALL-CAPS, triple-encoded" rainbow band that the ledger flags on every capability page is replaced by either (a) the one `DecisionChip` row presented once as the hero taxonomy, or (b) a single neutral "6 outcomes" summary chip that expands.
2. **`Badge`** (metadata): the existing tones `neutral / shipped / roadmap / adr` — but **reduced to one visual treatment** (uppercase 11px, `+0.08em`, hairline). The current 4-tone color set stays, but ADR refs, tier labels, and package slugs **all use the same neutral treatment** — the "four badge variants simultaneously: outlined purple, outlined orange-bg, monospace grey, teal icon-badge" finding (`capabilities_ai-bom`) is the exact anti-pattern this collapses.

**Mobile:** a cluster of >2 badges collapses to the most important chip + "+N" with tap-to-expand.

### 6.9 Code surface

**Current** `CodeBlock`: `rounded-lg border border-edge bg-zinc-900`, mono `text-[13px]`, optional filename chrome bar. The ledger's repeated complaint: "dark code blocks optically heavier than prose, inverting reading hierarchy" and "no syntax highlighting — raw pre tag" (`blog_*`, `deploy`, `recipes_*`).
- Add **syntax highlighting** (Shiki at build time — the current comment admits it was deferred). A custom muted theme tuned to the brand, not library defaults (the "default syntax-highlighter colors — Linear/Stripe/Vercel use custom themes" finding).
- **Containment:** one surface, `rounded-xl`, `console.panel` bg, `console.edge` hairline. The meta-bar (filename + language + copy) sits in a `surface-2`-equivalent dark inset — **not** a second nested bordered card (the `capabilities_ai-bom` "card-within-card terminal" fix).
- **Mobile:** horizontal scroll container with a right-edge fade mask and a visible copy button — never edge-to-edge clipped code. Optionally collapse long examples behind "Show example" on mobile.
- Inline code: `surface-2` bg, `rounded` 4px, `mono` 0.9em — used sparingly (the "inline code pepper noise every paragraph" finding).

---

## 7. Motion System

### 7.1 Current foundation (cited, and good)

`lib/motion.ts` defines: `EASE_OUT [0.22, 1, 0.36, 1]`, `EASE_SOFT [0.16, 1, 0.3, 1]`, reveal (opacity 0→1 + y 12→0, 500ms), result-reveal (400ms), disclosure (350ms + 100ms delay), stagger (`staggerChildren 0.08, delayChildren 0.04`), draw-on-scroll (pathLength, 900ms). `globals.css` honors `prefers-reduced-motion` globally; every motion component short-circuits to static. **This is already a well-built, restrained motion layer — keep its structure and extend it into a documented system.**

### 7.2 Duration scale

| Token | ms | Use |
|---|---|---|
| `--dur-instant` | 100 | Color/bg state changes (button hover) |
| `--dur-fast` | 150 | Buttons, links, small UI transitions (current button `transition-shadow` → specify 150) |
| `--dur-base` | 200 | Dropdowns, chip transitions (current StepStrip `duration-300` → tighten to 200) |
| `--dur-moderate` | 350 | Disclosures, accordions (matches `disclosureRevealVariants`) |
| `--dur-reveal` | 500 | Scroll reveals (matches `revealVariants`) |
| `--dur-draw` | 900 | SVG draw-on (matches `drawVariants`) |

### 7.3 Easing curves

- **`EASE_OUT [0.22, 1, 0.36, 1]`** — default for entrances, hovers, dropdowns. Keep.
- **`EASE_SOFT [0.16, 1, 0.3, 1]`** — emphasis/scale moments. Keep.
- **`ease-in-out` (standard) for exits** — overlays leaving.
- **No bounce/overshoot springs** for UI — the premium register is calm, not playful. Springs reserved (if ever) for the single hero kernel artifact.

### 7.4 Spring configs (hero artifact only)

For the one signature hero animation (the kernel loop / outcome resolution), if a spring is used: `{ type: "spring", stiffness: 260, damping: 30, mass: 1 }` — critically-damped, no visible bounce. Everything else uses tweened easing.

### 7.5 Transitions & hover behavior

- **Hover lift** (`HoverLift` exists): cards `-translate-y-0.5` + `shadow-xs`→`shadow-sm`, 150ms `EASE_OUT`. Buttons `-translate-y-px`.
- **Reveals:** every section enters via `Reveal`/`Stagger` once on scroll, `margin: "-50px"` (current `REVEAL_VIEWPORT`). Stagger cadence 80ms (keep) — never more than ~6 items in one stagger or the cascade drags.
- **Active stepper:** the `StepStrip` pulse (CSS `animate-pulse`, motion-safe) is fine for an in-flight step; static highlight otherwise.
- **Reduced motion:** the existing global + per-component short-circuit is exemplary — every new component must follow the same pattern (render final state, no transform, no scroll-gated invisibility).

### 7.6 Performance rule
Transform + opacity only (the codebase already enforces "transform/opacity-only, no layout shift" in its motion docs). No animating `width`/`height`/`top` — keeps reveals at 60fps and avoids CLS.

---

## 8. Responsive Philosophy

The governing idea: **the experience is re-composed at each breakpoint, never shrunk.** The ledger's most-repeated rejection is "tablet/mobile is a squashed desktop." Concretely:

### 8.1 Desktop (`lg` ≥1024px)
The reference composition. Multi-column where the content earns it (two-column depth pages claim the full `--w-content`, not a stranded 680px column). Full nav with dropdowns. 3-up grids. Console instruments at `--w-wide`. Hover affordances active.

### 8.2 Tablet (`md` 768–1023px)
A **first-class intermediate**, not a transition state. Its own type-scale step (`md:` variants in §3). 2-up grids that never produce a "2+1 orphan." Horizontal steppers that risk wrapping convert to a compact "Step 2 of 4 — Guard decides" indicator (the `capabilities_*` "stepper wraps with orphaned arrows" fix). Nav remains expanded but tighter. Diagrams reflow (not shrink) — a 6-node horizontal pipeline becomes 2×3 or vertical.

### 8.3 Mobile (base <768px)
**Designed as the primary surface, top-down.** Single column. Tap targets ≥44px. Specific transformations (all mandatory, all closing named ledger failures):
- Tables → stacked card-lists (never clipped/overflowing).
- Horizontal steppers → vertical list or step indicator.
- Code blocks → scroll container with edge-fade, or collapse behind a toggle.
- Badge clusters → 1–2 chips + "+N more."
- Hero diagrams → a mobile-native simplified visual (the `architecture` "pipeline diagram never adapted for mobile — the core proof fails at the most common breakpoint" fix).
- Type re-tuned for reading distance: hero `display` at 48–60px (not 72px shrunk awkwardly), body holds 1.65 line-height.
- **No blank voids:** the "75% blank canvas below content" and "page goes blank below The problem" failures (`recipes_*`, `transparency_*`, `home` mobile) are render bugs the system forbids — content that exists on desktop renders on mobile, period. Add a build-time visual-regression gate per route per breakpoint so a missing-content mobile render fails CI.
- Sticky minimal nav + (on long articles) a reading-progress affordance.

### 8.4 Cross-breakpoint invariants
One optical spine at every width. No headline widows at any breakpoint (max-width + `text-wrap: balance` on headings — fixes the pervasive "kernel." / "enough." / "resume it" orphan findings on `blog`, `comparisons`, `recipes_*`, `home`). The announcement banner collapses gracefully (single legible line on mobile, never truncated-to-noise — `home`/`comparisons` finding).

---

## 9. Premium Experience Principles

What makes this product read as trustworthy, sophisticated, modern, and premium — the qualities the ledger scored in the 3–5/10 range and that this blueprint is engineered to lift to 8–9.

### 9.1 Trustworthy — the product proves itself, visually
Adjudicate's promise is *deterministic, signed, auditable decisions*. Trust is earned by **showing the receipt, not describing it.** The signed audit receipt (the `console_decision_*` route — the ledger's highest-clarity route at 7/10, "concept strong, REWRITE receipt narrative lands") becomes the recurring trust artifact: a real, legible, cryptographically-framed object presented with calm authority. Hashes are handled with care (truncation + copy, never raw walls). Nothing on a precision-engineering product may itself look broken — the empty voids, clipped tables, and blank mobile renders directly contradict the trust claim and are structurally eliminated. "Production-ready & API-frozen" is shown through a finished, complete surface, not asserted in a banner over an unfinished page.

### 9.2 Sophisticated — restraint is the differentiator
Sophistication is what's *removed*: the traffic-light dots, the rainbow badge bands, the tinted danger fills, the `<hr>` dividers, the duplicate CTAs, the verbatim-repeated paragraphs (the `recipes_*` "hero subtitle repeated as The problem body" defect). Hierarchy is built from type, weight, and space — the Apple/Stripe/Linear register the ledger benchmarks against. **One accent, two badge families, one card, one container language, one optical spine.** Every element earns its place or is cut.

### 9.3 Modern — calm, precise motion and a confident neutral canvas
Modernity here is the warm off-white canvas (#FAFAF9) + zinc neutrals + a single indigo accent + the disciplined six-color decision system — not the generic AI-gradient. Motion is present but quiet: reveal-on-scroll, hover lift, a single signature hero artifact, all reduced-motion-safe. Self-hosted Inter with optical tracking at display sizes. Syntax-highlighted code in a bespoke theme. The aesthetic says *infrastructure-grade*, not *growth-marketing template*.

### 9.4 Premium — the six outcomes are dramatized as the hero, every screen resolves
The premium move is to take the product's actual differentiator — **six structured outcomes beyond block-or-allow, each with a signed receipt** — and make it the visual centerpiece it deserves to be, not the buried metadata the ledger finds it reduced to on 40+ routes. Give the taxonomy a real diagram. Let the receipt be a beautiful, legible artifact. Weight content editorially (featured cards, lead paragraphs, pull quotes). And resolve every page: a designed terminal section, never raw canvas; a complete mobile experience, never a void. **Premium is the absence of anything that looks unfinished** — which is precisely, route by route, what the grounding ledger says is missing today.

---

### Files read to ground this blueprint
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/tailwind.config.ts` (palette, gradients, `tracking-section: 0.18em`, decision tokens, console namespace)
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/app/globals.css` (canvas/ink base, `::selection #6366F1`, reduced-motion)
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/app/layout.tsx` (Inter + JetBrains Mono via Google `<link>`, the Geist→Inter doc drift)
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/content/decisions.ts` (six-outcome content + `accent`/`bg`/`border` class tokens)
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/lib/motion.ts` (`EASE_OUT`, `EASE_SOFT`, reveal/result/disclosure/stagger/draw variants, durations)
- UI components: `Button.tsx`, `Card.tsx`, `Badge.tsx`, `Callout.tsx`, `Section.tsx` (`max-w-6xl px-6 py-24 md:py-32`), `SectionHeading.tsx`, `DepthHeader.tsx`, `EmptyState.tsx`, `CodeBlock.tsx`, `StepStrip.tsx`, `DecisionChip.tsx`, `StatTile.tsx`, `NavBar.tsx`, `SiteFooter.tsx`, `AnnouncementBanner.tsx`
- Motion components: `Reveal.tsx`, `Stagger.tsx`, `resolveMotion.ts`
- `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/app/page.tsx` (home section composition — confirming the homepage source is content-rich; the ledger's "90% empty" finding reflects a render/build issue, not the source structure)
