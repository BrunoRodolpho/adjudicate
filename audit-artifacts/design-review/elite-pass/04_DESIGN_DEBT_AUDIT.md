# Design Debt Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

Confirmed. The recipe tag row renders three structurally different pills side-by-side: `Badge tone="neutral"` (gray, square-ish radius via Badge's `rounded-full` but `text-[11px]` weight), `Badge tone="shipped/roadmap"` (colored), and `DecisionChip` (colored + icon + different padding). Three visual grammars in one row — exactly the screenshot complaint.

I now have all the grounding I need. Writing the audit.

---

## Design Debt Audit — adjudicate marketing site (`apps/web`)

This audit cross-references the GROUNDING LEDGER (232 screenshots, 58 routes) against the real source: `tailwind.config.ts`, `globals.css`, `content/decisions.ts`, and the `components/ui/` primitives. Every recommendation targets the **token or shared component**, never a page. Debt items are ordered by how much each degrades coherence across the route set.

The single structural truth underneath almost every screenshot complaint: **there is no spacing scale, no radius scale, no type scale, and no unified pill component.** The Tailwind config (`tailwind.config.ts`) extends *colors, one letter-spacing token, and three gradients* — and nothing else. There is no `borderRadius`, no `spacing`, no `fontSize`, no `theme.extend.boxShadow`. The system is "Tailwind defaults + a color palette," which is why 58 routes drift: every author reaches for raw utilities, and raw utilities have no opinion.

---

### DEBT 1 — Pill/badge proliferation: four incompatible systems, no shared primitive

**Severity: highest. This is the loudest noise source named in the ledger and it recurs on nearly every route.**

**WHERE it exists.** Four distinct pill grammars coexist, often in a single 70px band:

1. `components/ui/Badge.tsx` — `rounded-full`, `text-[11px]`, `uppercase tracking-section`, four tones (`neutral / shipped / roadmap / adr`) that map to `border-edge`, `border-execute/40`, `border-defer/40`, `border-escalate/40`.
2. `components/ui/DecisionChip.tsx` — `rounded-full` but with `gap-1.5/gap-2` icon padding, decision color from `content/decisions.ts` (`bg-execute/10` etc.), an icon, and a *different internal padding scale* (`px-2.5 py-1` vs Badge's `px-2.5 py-0.5`).
3. `components/ui/StepStrip.tsx` chips — `rounded-full border px-3 py-1.5`, with a nested `size-5 rounded-full` numbered counter and `bg-gradient-primary` active state.
4. The monospace package badge — `Badge tone="neutral"` carrying `capability.pkg.name` / `recipe.guardOrPack.npmPackage`, which renders an all-caps lowercase-package string that visually fights the colored pills.

The collision is structural, not incidental. In `CapabilityPageLayout.tsx` lines 73–86, the hero renders `<Badge tone="adr">` + `<Badge tone={shipped|roadmap}>` + `<Badge tone="neutral">{pkg.name}</Badge>` on one row, then a *second* row of `<DecisionChip>`s. That is the "two-row stacked badge section" the ledger flags on `capabilities_access-governance-pack` (*"Six colored outcome pill icons … form a rainbow band louder than the page title"*), `capabilities_command-risk-guard` (*"Eight simultaneous badge colors"*), `capabilities_hallucination-scoring` (*"five badge/pill variants in one row"*), and `capabilities_red-team` (*"Six distinct badge treatments"*). In `RecipeLayout.tsx` lines 51–55 the identical pattern produces the recipes' *"three mismatched pills (plain outline, teal-filled, orange-icon)"* called out on `recipes_least-privilege-access`, `recipes_cap-token-spend`, `recipes_redact-pii`, and `recipes_over-refund-clamp`.

**HOW it emerged.** The six decision colors were ported "one-to-one from `apps/console`" (config comment, lines 8–11) and given a dedicated chip (`DecisionChip`). Separately, status/metadata needs grew a generic `Badge` with semantically *overloaded* tones — note `shipped` reuses `execute` green, `roadmap` reuses `defer` amber, `adr` reuses `escalate` violet. So a "Shipped" badge is the same green as an EXECUTE chip, and a "Roadmap" badge is the same amber as a DEFER chip: **status and outcome share hue with no semantic relationship**, which is why the ledger repeatedly reads the metadata row as a "filing system" rather than a product claim. Each new surface (StepStrip, package badge, capability tier) bolted on its own variant because no single "Pill" primitive existed to extend.

**SYSTEM-level elimination.** Collapse to exactly **two** pill primitives with a shared token contract:
- `<DecisionChip>` stays as the *only* colored, semantic pill — reserved exclusively for the six outcomes. Nothing else may use decision hues.
- Replace `Badge` with a single neutral `<MetaTag>` primitive: one monochrome treatment (`border-edge text-muted`), one radius token, one padding token. Tier, ADR id, package name, "Shipped"/"Illustrative" all render as *typographically* differentiated metadata in this one neutral style — never as colored pills. Stop reusing `execute`/`defer`/`escalate` for non-outcome status; that hue→meaning conflation is the debt.
- Add `borderRadius.pill` and a `spacing` token for pill padding to `tailwind.config.ts` so both primitives reference the same source. Then enforce: a route may show *at most one* outcome-chip cluster and *at most one* neutral metadata line. This single change resolves the "badge soup" verdict on all 14 capability routes and all 8 recipe routes simultaneously.

---

### DEBT 2 — Radius anarchy: six radius tokens, 325 usages, zero scale

**Severity: very high. Pervasive on every card-bearing route; the reason cards "feel assembled, not designed."**

**WHERE it exists.** `grep` across `src` returns six radius tokens with no system: `rounded-sm` ×105, `rounded-full` ×81, `rounded-xl` ×47, `rounded-md` ×36, `rounded-lg` ×28, `rounded-2xl` ×28. They mix *within a single component tree*: `Card.tsx` is `rounded-xl`, `CodeBlock.tsx` is `rounded-lg`, the console-replica link in `CapabilityPageLayout.tsx` line 164 is `rounded-lg`, the recipe code link in `RecipeLayout.tsx` line 109 is `rounded-lg`, the NavBar dropdown is `rounded-xl`, pills are `rounded-full`. The ledger names this precisely: `architecture_data-flow` — *"Pipeline and trust-boundary cards carry different apparent border radii — no unified radius token"*; `console_ai-bom` — *"Three border-radius values: full-pill, ~6px (pack cards), ~12px (console frame) — no radius system"*; `console_decision_…` — *"Two distinct border-radius values in use … no defined radius scale."*

**HOW it emerged.** `tailwind.config.ts` defines **no `borderRadius` extension**, so every author picked a raw default per component with no governing decision. `rounded-sm` (105×) dominating is the tell — it's the *default a developer types when unsure*, not a chosen value. Card-within-card nesting (e.g. `CodeBlock` `rounded-lg` inside a `Card` `rounded-xl` inside a `Section`) then exposes the mismatch as concentric frames of different curvature, which the ledger reads as "frame-within-frame depth collapse" on the console and capability routes.

**SYSTEM-level elimination.** Define a 3-step radius scale in `tailwind.config.ts` and ban raw radius utilities:
```
borderRadius: { card: "0.75rem", control: "0.5rem", pill: "9999px" }
```
- `rounded-card` → all cards, callouts, code blocks, provenance cards, console frames.
- `rounded-control` → buttons that aren't pills, inputs, inline code-link chips.
- `rounded-pill` → the two pill primitives only.

Then enforce nesting rule: a card and its inner code block share `rounded-card` *or* the inner element drops its radius entirely (full-bleed). This kills the concentric-frame artifact on every console and capability route in one pass.

---

### DEBT 3 — No type scale: H1 and section-H2 collapse into one tier

**Severity: high. Direct cause of the "flat hierarchy" verdict on capability, recipe, blog, and how-it-works routes.**

**WHERE it exists.** There is no `fontSize` extension in the config, so heading sizes are hand-set per component and *converge*:
- `DepthHeader.tsx` h1 (line 39): `text-3xl md:text-4xl font-semibold`.
- `CapabilityPageLayout.tsx` `Block` h2 (line 232): `text-xl font-semibold`.
- `SectionHeading.tsx` h2 (line 23): `text-3xl md:text-4xl` — *identical to the DepthHeader h1.*
- `Hero.tsx` h1: `text-4xl md:text-6xl font-bold`.

Across routes, `grep` shows the page H1 is `text-3xl md:text-4xl` on **9 routes**, while H2s range across `text-xl` (17×), `text-2xl` (15×), `text-3xl` (11×), `text-4xl` (8×). So on a capability page the h1 (`text-4xl`) and a `SectionHeading` (`text-4xl`) are the *same size*, while the `Block` section titles are `text-xl` — there's no consistent primary/secondary/tertiary ramp. This is the ledger's repeated finding: `capabilities` — *"Four section headers match hero body copy weight — hierarchy between section-title and body collapses"*; `blog_launching-adjudicate` — *"Section headings are slightly-larger body text"*; `how-it-works` — *"H1 weight is optically too light against body copy."*

**HOW it emerged.** Each header component was authored independently against Tailwind's default `fontSize` ramp with no shared "display / title / heading / body" contract. `DepthHeader` (depth/capability/recipe pages) and `SectionHeading` (home/marketing sections) were never reconciled, so the same visual rank renders at two different sizes depending on which component a route happens to use.

**SYSTEM-level elimination.** Add a named type scale to `tailwind.config.ts` (`fontSize.display`, `.title`, `.heading`, `.subheading`, `.body`) with locked size + line-height + tracking pairs, and route **all four header components** (`DepthHeader`, `SectionHeading`, `Block`, Hero) through it so a given semantic rank is always one token. Specifically: page h1 = `display`, section h2 = `heading`, sub-block h2 = `subheading`. Tighten tracking at display sizes in the token (the ledger's repeated "headline tracking feels browser-default"). This is a token + four-component edit that fixes hierarchy on every route that uses a header, not a per-page font bump.

---

### DEBT 4 — Inverted nav CTA hierarchy, baked into the Button default

**Severity: high. Appears in the fold of literally every route (the nav is global).**

**WHERE it exists.** `NavBar.tsx` lines 102–107: `<Button … variant="ghost">Open console</Button>` then `<Button … external>GitHub</Button>`. The GitHub button passes **no `variant`**, so it inherits `Button.tsx`'s default `variant = "primary"` (line 30) → `bg-gradient-primary text-white shadow-lg` (the loudest treatment in the system). The console CTA is a ghost text link. The product's own destination ("Open console") is visually subordinate to an external repo link, on every page. The ledger flags this on essentially every route: `architecture` — *"GitHub pill … dominating 'Open console' — CTA hierarchy is inverted"*; `home` — *"GitHub icon in nav button"*; `blog`, `capabilities`, `console`, `recipes`, `roadmap`, `transparency` all repeat it.

**HOW it emerged.** `Button`'s `variant` defaults to `primary`, and the GitHub button was added without an explicit variant — so the *most aggressive* style became the *default a forgetful caller gets*. The gradient is then the only saturated element in an otherwise monochrome nav, magnifying the inversion.

**SYSTEM-level elimination.** Two coordinated token changes:
1. Change `Button`'s default `variant` to `"outline"` (least dangerous default), forcing every primary CTA to be *opted into* deliberately. A primary gradient button should be a conscious per-page conversion decision, not a fallback.
2. Reserve `bg-gradient-primary` for **one** primary action per viewport (the brand-gradient token is currently sprayed across 13 files per grep — Button, StepStrip active chip, Hero, FinalCTA, KernelCube, etc.; that dilution is why the gradient "reads as a generic SaaS launch pattern"). Demote the nav GitHub button to `ghost`/`outline` and, if a nav primary is wanted, make it "Open console." Because this is a Button-default + NavBar edit, it corrects the inverted hierarchy on all 58 routes at once.

---

### DEBT 5 — The fold "dead zone": a media-query padding collision in the shared layout

**Severity: high. The ledger's single most-repeated optical flaw — "~120–200px dead zone" — on every capability, recipe, and several depth routes.**

**WHERE it exists.** The capability/recipe fold is composed of `DepthHeader` (`pb-6 pt-10`, i.e. 24px bottom) immediately followed by `<Section className="pt-10">`. But `Section.tsx` line 30 hard-codes `py-24 md:py-32` (96px / **128px**) as its base class, and the `pt-10` passed via `className` is *appended after*. Both emit `padding-top`; at the `md` breakpoint the `md:py-32` variant re-asserts 128px of top padding that the non-responsive `pt-10` (40px) does not reliably override. Net: `DepthHeader pb-6` + `Section`'s effective `~128px` top padding stack into the **~140–200px void between the subtitle and the first badge row** that the ledger names on `capabilities_access-governance-pack`, `_agent-memory-store` (*"~200px dead air"*), `_ai-bom`, `_behavioral-drift`, `_command-risk-guard`, `_config-integrity-seal`, `_hallucination-scoring`, `_incident-response-pack`, `_pii-guard`, `_policy-coherence-analyzer`, `_red-team`, `_release-gating`, `_smart-approval-engine`, `_token-budget-guard`, and every `recipes_*` route. It is one layout bug, replicated 30+ times because every route renders the same two components in the same order.

**HOW it emerged.** `Section` was designed as a marketing-section wrapper with generous `py-24 md:py-32` rhythm. It was then reused as the *body container directly under a header* via a `className="pt-10"` override that silently loses to the base class's responsive variant. No spacing token mediated the header→body seam, so the override was a guess that doesn't hold at `md`.

**SYSTEM-level elimination.** Stop overriding padding by appending a className to a component that owns a responsive padding base. Two-part fix:
1. Give `Section` an explicit `spacing` prop (e.g. `pad="hero" | "body" | "tight"`) backed by spacing tokens, instead of a hard-coded `py-24 md:py-32` that callers fight with raw utilities. A header-adjacent body uses `pad="tight"` (a small, *responsive-correct* top token).
2. Add a `spacing` scale to `tailwind.config.ts` so the header→body seam is one named value used by `DepthHeader pb-*` and `Section pt-*` together, guaranteeing they sum to an intentional rhythm at every breakpoint. This is a single shared-component change that closes the dead zone on every capability and recipe route.

---

### DEBT 6 — Duplicated outcome-color system: two parallel six-outcome definitions

**Severity: medium-high. A maintenance/coherence fault that surfaces as light/dark color mismatch between marketing and console-replica surfaces.**

**WHERE it exists.** The six outcomes are defined **twice**, in two different color spaces:
- `content/decisions.ts` (marketing-light) → `text-execute`, `bg-execute/10`, mapped in `tailwind.config.ts` to `#10B981` emerald-500, `#EF4444` red-500, `#F97316` orange-500, etc.
- `components/console-kit/decision-theme.ts` (console-dark) → `text-emerald-300`, `bg-emerald-500/10`, `border-emerald-500/40`, **plus a `dot` and a `summary` field** ("Allow"/"Block"/"Hold"/"Modify") that the marketing tokens lack.

So EXECUTE is `execute`/`#10B981` on a capability page but `emerald-300`/`emerald-500` on the embedded console replica *on the same scroll*. The ledger reads this as the "REWRITE/EXECUTE badge tokens inside the mockup use a color system disconnected from the marketing shell" on `console`, and the broader "the same six outcomes wear the same colours" promise (config comment line 9) is only half-kept — the *shade* differs by 200 between the two definitions.

**HOW it emerged.** A deliberate "copy, don't share" decision (ADR-128, referenced in both files) duplicated the console's design kit rather than extracting a shared `@adjudicate/ui`. That's defensible for *isolation*, but it left two color sources with no single token of truth, so they drift in shade and in supplementary fields (the `summary`/`dot` only exist console-side).

**SYSTEM-level elimination.** Keep the two render targets but unify the *source of truth*. Promote the six outcome hues to a single typed token map (kind → `{ light, dark, summary, icon }`) consumed by both `decisions.ts` and `decision-theme.ts`, generated from one file. The console keeps its dark `-300/-500` ramp and the marketing surface keeps its `-500` ramp, but both *derive from one declared base* so a hue change propagates once. This eliminates the shade-mismatch the ledger sees on `console`, `console_audit-explorer`, and every capability page that embeds a replica, without violating the copy-don't-share package boundary (it's a build-time codegen, not a runtime import).

---

### DEBT 7 — `recipe.problem` rendered verbatim twice — duplicate-text debt in the shared layout

**Severity: medium-high where it appears (8 recipe routes), but it's a content-pipeline defect, not styling.**

**WHERE it exists.** `RecipeLayout.tsx` uses `recipe.problem` as the `DepthHeader subtitle` (line 42) **and** as the body of the "The problem" Block (line 62). The component's own docstring admits it: line 21 — *"'The problem' — the problem prose, restated as the lede."* The ledger calls this the worst-quality signal on `recipes_block-dangerous-commands` (*"hero intro repeated verbatim as 'The problem' body — destroys editorial authority"*), `recipes_cap-blast-radius`, `recipes_gate-prod-deploys`, `recipes_pause-for-human` (*"the same sentence appears three times"*), `recipes_redact-pii`, and `recipes_over-refund-clamp`.

**HOW it emerged.** The recipe content model (`content/recipes.ts`) has a single `problem` field, and the layout needed both a subtitle and a body, so it reused the one field for both rather than the content model carrying a distinct `lede` and `problem`.

**SYSTEM-level elimination.** Fix the *content schema*, not the pages. Add a distinct `lede` (one-line hook for the subtitle) and keep `problem` (expanded body) as separate fields on the `Recipe` type in `content/recipes.ts`, and bind `DepthHeader subtitle={recipe.lede}` / Block body `{recipe.problem}`. One type + one layout binding change removes the verbatim repetition from all 8 recipe routes. (The same single-source pattern should be audited on capability pages, where `oneLiner` is the subtitle and `whatItDoes` is the body — those are already distinct, which is the correct shape to mirror.)

---

### DEBT 8 — Section divider hairlines as a substitute for spacing rhythm

**Severity: medium. Pervasive on capability, transparency, and depth routes; reads as "docs tooling, not product."**

**WHERE it exists.** `CapabilityPageLayout.tsx` `Block` (line 231) wraps every section title in `border-b border-edge pb-3`; `RecipeLayout.tsx` (line 141) does the same. So *every* section on a capability or recipe page is announced by a full-width hairline rule under its heading. The ledger flags this on `capabilities_command-risk-guard` (*"Seven horizontal rules across the full page — documentation pattern"*), `capabilities_behavioral-drift` (*"H2 hairline dividers … a Markdown convention"*), `capabilities_config-integrity-seal`, `transparency_command-risk`, and the blog routes.

**HOW it emerged.** With no spacing scale (DEBT 5's root), authors needed a way to signal "new section" and reached for a border rule instead of whitespace — the classic symptom of a pre-spacing-scale codebase. It became a shared pattern in `Block` and propagated everywhere `Block` is used.

**SYSTEM-level elimination.** Remove the `border-b` from `Block` and replace section separation with a spacing token (the `spacing` scale from DEBT 5) plus the type-ramp contrast from DEBT 3. When section titles are a clearly larger `heading` token with generous token-driven space above them, the hairline becomes redundant. This is a one-line edit in the two shared layout `Block` helpers that de-docs-ifies every capability and recipe route.

---

### DEBT 9 — Icon sizing has no scale (9 distinct literals)

**Severity: medium-low. A finish-quality fault the ledger catches at the optical-precision level on many routes.**

**WHERE it exists.** `grep` for `size={…}` returns nine literals: `16` (41×), `14` (34×), `12` (17×), `20` (10×), `18` (10×), `13` (5×), `28` (4×), `24` (2×), `11` (1×). They're chosen per call site: `DepthHeader` back-arrow `size={12}`, `DecisionChip` `12`/`14` by chip size, `Callout` icon `18`, `ProvenanceCard` `13`/`14`, `AnnouncementBanner` `12`/`14`. The `size={13}` and `size={11}` outliers are the tell — arbitrary one-offs. The ledger repeatedly notes "icon optically heavier/lighter than its label" (`architecture`, `blog`, `console_audit-explorer` — *"badge dot circles optically mis-centered"*).

**HOW it emerged.** No icon-size token, so each author matched an icon to nearby text by eye, producing a near-continuous spread of values and inconsistent icon-to-cap-height ratios.

**SYSTEM-level elimination.** Define a 3–4 step icon-size constant set in a shared `lib` module (e.g. `ICON.xs=12, sm=14, md=16, lg=20`) tied to the type ramp's line-heights, and replace raw `size={…}` literals with these. Pair each text token with its canonical icon size so an icon beside `body` text is always `md`, beside a pill label always `xs`. This is a mechanical find-replace governed by one constants file; it resolves the icon-baseline misalignments without touching layout.

---

### Cross-cutting root cause (the one fix that unlocks the rest)

Every item above traces to the same omission: **`tailwind.config.ts` extends color but defines no `borderRadius`, no `spacing`, no `fontSize`, no `boxShadow` scale.** The system is a palette without a grid. The highest-leverage move is to *add those four scales to the config first* (DEBT 2, 3, 5, and the icon scale all become single-token edits once they exist), then refactor the ~8 shared primitives (`Badge`→`MetaTag`, `DecisionChip`, `Button`, `Card`, `Section`, `DepthHeader`, `SectionHeading`, `Block`) to consume only named tokens. Because all 58 routes are assembled from this same thin set of primitives, fixing the primitives — not the pages — is what moves the elite scores. The ledger's lowest-scoring routes (capabilities 22, console 22, console_ai-bom 24, recipes 24) are low for the *same four reasons* as the higher ones; there is no per-route design problem here, only an unparameterized design system.

**Key source references:** `apps/web/tailwind.config.ts` (missing scales; overloaded status hues lines 46–67), `apps/web/src/app/globals.css` (no design tokens beyond color-scheme), `apps/web/src/content/decisions.ts` (marketing outcome tokens) vs `apps/web/src/components/console-kit/decision-theme.ts` (duplicate console outcome tokens), `apps/web/src/components/ui/{Badge,DecisionChip,StepStrip,Button,Card,Section,DepthHeader,SectionHeading}.tsx`, `apps/web/src/components/capabilities/CapabilityPageLayout.tsx` (badge cluster lines 73–86; fold-gap stack lines 56–71; `Block` hairline line 231), `apps/web/src/components/recipes/RecipeLayout.tsx` (three-pill row lines 51–55; duplicate `recipe.problem` lines 42 + 62), `apps/web/src/components/ui/NavBar.tsx` (inverted CTA lines 102–107).
