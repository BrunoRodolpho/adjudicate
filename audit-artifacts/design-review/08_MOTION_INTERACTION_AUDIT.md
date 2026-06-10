# Motion & Interaction Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

I'll analyze the grounding ledger carefully before writing. Let me extract the key per-route signals that must drive the motion design—especially the dominant flaw across nearly every route.

The ledger makes one thing unambiguous: the single most common defect across all 58 routes is **content that fails to exist / fails to render / large blank voids** — not content hidden behind scroll-reveal that simply hasn't animated in. That distinction is load-bearing for this audit. Let me write the motion spec grounded in those specific observations.

## Motion & Interaction Audit

### Premise, and the one hard constraint that overrides everything

The ledger is brutal and consistent: the dominant failure across this entire build is **absence**, not concealment. `home` is a 13,000–20,000px canvas with content only in the first ~5–12% ("an unbroken off-white void," premium 28). `roadmap` literally has no roadmap — "~4,000px of empty whitespace between v1 section and footer" (premium 18). `console` is "a black void consuming 60–80% of full-page scroll on every viewport" (premium 22). `architecture` has the "SEVEN PRIMITIVES" heading with no body. Across `recipes_*`, `transparency_*`, and `console_*`, cards, tables, and code blocks **fail to render on mobile** — `transparency_pii`, `transparency_red-team`, `console_approvals` (blank Pending Queue under "3 awaiting review"), `console_drift` (ELEVATED badge clips to "0").

This means the motion system must obey one inviolable rule:

> **Motion enhances an already-painted baseline. No entrance animation may be the reason a thing is visible. Every element ships with its final opacity and final layout in the no-JS / pre-hydration DOM; motion only modulates the *transition into view*, and only for elements already within or near the viewport.** If JS never runs, the page is 100% present and readable.

Concretely, that is the opposite of the common `opacity:0; translateY(24px)` scroll-reveal pattern, which *gates existence*. Every spec below uses an **`@starting-style` / reveal-from-painted** approach: the steady state is the default; the animation is a one-shot departure-and-return that is a no-op if interrupted. Several reviewers explicitly misread voids as "failed lazy-load" and "render failure" — a scroll-reveal system layered on this build would convert those false negatives into *guaranteed* blank screens. We are designing motion that makes a sparse page feel intentional, not motion that hides a sparse page until it's too late.

Global tokens referenced throughout (define once, in CSS custom properties):

```
--ease-out-quart:  cubic-bezier(0.25, 1, 0.5, 1)     /* entrances, settle */
--ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1)      /* large hero moves */
--ease-standard:   cubic-bezier(0.4, 0.0, 0.2, 1)     /* hovers, toggles */
--ease-in-out-soft:cubic-bezier(0.45, 0, 0.55, 1)     /* color/badge pulses */
--spring-press:    stiffness 420, damping 32, mass 1  /* button/tab press */
--spring-card:     stiffness 260, damping 30, mass 1  /* card hover lift */
--dur-micro: 120ms  --dur-hover: 180ms  --dur-enter: 420ms  --dur-hero: 720ms
```

Universal guardrails:
- `prefers-reduced-motion: reduce` → all transform/opacity entrances collapse to a 0ms snap; only color/border hover feedback (≤120ms) survives.
- Entrance reveals fire **once**, via IntersectionObserver with `rootMargin: 0px` and a flag, and **only** for nodes already in the painted DOM. Anything below ~1.5 viewports is never animated — it's just there.
- No element starts below `opacity: 0.001`. The floor is `opacity: 1` in CSS; JS *temporarily* lowers it for ≤420ms after confirming the node is painted and in view. A hydration failure leaves everything at full opacity.

---

### home — `/` (premium 28; "strong opening, near-zero follow-through")

The fold is the one genuinely good frame ("gradient 'beyond block-or-allow' + radial purple bloom," composition/craft 7s). Motion's job here is restraint at the top and *honesty* below — it cannot paper over the void, but it must stop the gradient hero from being the only alive thing.

**Entrance (hero, fires on load, not scroll):**
- Eyebrow → H1 → subhead → CTA row → code block, staggered **60ms** apart, each: opacity `0→1` over **420ms** `--ease-out-quart`, transform `translateY(10px)→0`. 10px, not the typical 24px — Linear/Vercel restraint, and small enough that an interrupted animation is invisible.
- The gradient accent span ("beyond block-or-allow"): on top of the text reveal, a **720ms** `background-position` sweep `--ease-out-expo` so the violet gradient resolves left-to-right *once*. The radial bloom fades `0→1` opacity over **900ms**, **ease-out**, starting at 200ms. This is the keynote moment the reviewer named; give it the longest duration on the page.
- The ledger flags the CTA sharing the headline's hue ("CTA needs more contrast"). Don't fix that with motion — but a one-time **180ms** `box-shadow` bloom on the CTA at the end of the stagger (settle, `--ease-out-quart`) separates it temporally instead of chromatically.

**Hover:**
- Primary CTA: `transform: scale(1.0→1.015)` + shadow lift, `--spring-press`. Press: `scale 0.985`, **120ms**. No color change (the hue problem is structural).
- Step-flow indicators (reviewer: "too small, reads decorative"): on hover of the row, a **180ms** sequential fill of the arrow connectors, `--ease-standard`, to make them read as a flow not decoration. Restraint: connectors only, not the labels.

**Scroll choreography below the fold:** This is where honesty matters. The page is mostly empty. Do **not** add long scroll-reveals to manufacture drama over a void — that's exactly the "failed lazy-load" misread. Instead: any real feature section that exists gets a **single** `translateY(8px)→0` + `opacity` reveal over **360ms** as it crosses 15% into viewport, fired once. The faint mid-page card the reviewer could barely see ("near-zero visual weight") should ship at full contrast and use a **140ms** border-color hover, nothing more. **Loading/skeleton:** none on the marketing home — content is static; a skeleton here would itself read as the broken-load the reviewers fear.

---

### how-it-works — `/how-it-works` (premium 44; "monotonous six-frame grid, color poverty")

Best moment is the two-line color-split thesis ("LLMs generate possibilities." black / "Production systems require decisions." violet). Worst flaw is six structurally identical frames with zero rhythm — fatigue by frame 3. Motion's job: **break the sameness without adding length**, since tablet/mobile already suffer "punishingly long" scroll.

**Thesis entrance:** The two lines are the page's signature. Line 1 reveals (opacity + `translateY(8px)`, **400ms**); line 2's **violet** resolves via a **520ms** color transition from the body near-black to violet, `--ease-in-out-soft`, delayed 220ms — so the reader watches "decisions" *become* the brand color. This is semantic motion (color doing syntax work, exactly what the reviewer praised statically) and it costs nothing on interrupt because both lines are already painted in their final position.

**Frame choreography (the anti-monotony lever):** Each of the six frames reveals its text-left / diagram-right pair with a **90ms** intra-frame lead (text leads diagram by 90ms), **360ms** `--ease-out-quart`, `translateY(8px)`. The variation that fights fatigue: alternate the reveal *direction* by frame parity — odd frames text-from-left (`translateX(-10px)`), even frames text-from-right. Subtle, one-shot, and it gives the grid a rhythm the static layout lacks. Frame 3's violet decision-block (the reviewer's standout) gets a **200ms** scale-settle `0.98→1` on reveal — the one frame allowed a flourish.

**Diagram cards** degrade to "illegible grey noise" on mobile per the ledger. Motion can't fix legibility, but **do not** animate diagrams on mobile at all (reduced-motion-style snap) — animating noise amplifies the prototype feel. **"THE ARTIFACT" closing section** is "nearly content-free / reads as unfinished." Absolutely no reveal animation here — an empty section that fades in is the textbook "did it load?" failure. Ship it static and fix the content.

---

### capabilities (index) — `/capabilities` (premium 28; three of four families render empty)

The card pattern ("dual-corner ADR + Tier badge") is the standout; three empty family sections are "an unacceptable finish state... reads as a render failure." **Motion mandate: the reveal cadence must be tied to actual card presence, never to section headers.** An empty section must have *zero* motion — a heading that animates in above a void is the exact signal reviewers misread as broken.

**Card grid entrance:** Cards within a *populated* family reveal in a **stagger of 50ms** along reading order, each **380ms**, opacity + `translateY(10px)` + a barely-perceptible `scale 0.99→1`. The dual badges (ADR/Tier) get a **120ms** delayed pop *after* their card settles, so the information-dense corners are the last thing to land — rewarding the eye on the page's best detail. The "confetti" pastel-badge problem is chromatic, not motion; leave it.

**Hover:** Card lift `translateY(0→-3px)` + shadow, `--spring-card`. "OPEN CAPABILITY" link arrow translates `x: 0→4px` on card hover, **180ms** `--ease-standard`. Restrained — Linear's exact card idiom.

**Skeleton states (this is where it matters most):** If families load async, render **card-shaped skeletons** matching the dual-badge silhouette — never bare animated headings over white. Skeleton shimmer: `background-position` sweep, **1400ms** linear loop, low-contrast (≤6% luminance delta) so it reads as "loading" not "flashing." Critically: a skeleton must occupy the **same height** as the real card so there is no layout shift on resolve, and resolve is a **200ms** crossfade skeleton→content. This converts the three "broken-looking" empty sections into legible loading states — the single highest-leverage motion fix on the route.

---

### capability detail — `/capabilities/{behavioral-drift (52), command-risk-guard (42), token-budget-guard (44), pii-guard, release-gating (47)...}`

Shared anatomy across all ~15: a polished **4-step stepper** (the consistent standout — "Guard decides" active pill), an above-fold **dead-air gap** (~120–280px, flagged on *every* detail route as "reads as a layout bug"), and a flat gray body where "H2s barely outweigh body text."

**The stepper is the franchise asset — animate it deliberately:**
- Entrance: four pills reveal left-to-right, **70ms** stagger, each **300ms** `--ease-out-quart`. The arrow connectors *draw* between pills (`stroke-dashoffset` or width `0→full`, **160ms** each) so the pipeline reads as sequential, not as four static chips. The active "Guard decides" pill lands last with a **220ms** fill transition (background `transparent→violet`) `--ease-in-out-soft` + a one-time **2px** shadow bloom. This is the moment that makes the stepper feel like "a real component system" (the reviewer's words) rather than a graphic.
- On mobile, where the stepper "loses its horizontal flow metaphor": animate a **vertical** connector draw (top-to-bottom) instead of suppressing it — preserve the sequence semantics the horizontal version loses.

**Dead-air gap:** Motion does not fill it — it's a layout bug; fix the spacing. But the tag/pill cluster that floats below it should reveal **immediately after** the subtitle (60ms gap), so the eye is pulled across the gap by timing rather than left to read it as missing content.

**Worked-example terminal block** (standout on `behavioral-drift`, "amber-on-dark, CLEARED/DECISION KIND"): reveal as one unit, **420ms** `--ease-out-quart`, `translateY(12px)`. Then a **single** typing-cadence reveal of the decision line is permissible — but cap it: characters appear over ≤600ms total, `steps()`, and the block is fully present (full text, full opacity) if JS is off. No looping cursor. The amber REWRITE/REFUSE badges pulse **once** on first view (border-color brighten, **240ms** `--ease-in-out-soft`) to draw the eye to the semantic payload — never a repeating pulse (repeating = "live/broken" ambiguity the console routes already suffer).

**Section H2 scannability:** instead of a reveal, give each H2 a **140ms** left-border accent that draws in (`scaleY 0→1`, transform-origin top) as it enters — a Linear idiom that adds the weight the flat hierarchy lacks, cheaply.

---

### recipes (index) — `/recipes` (premium 34; "flat inventory dump, eight equal-weight cards")

Worst flaw is sameness with no featured item. Motion can introduce **hierarchy through cadence** the static grid refuses to.

**Grid entrance:** Reveal cards in a **diagonal wave** (row+column index → delay, 40ms step), each **340ms**, opacity + `translateY(10px)`. A diagonal wave (vs. pure top-down) reads as "designed," fighting the "database export" feel without adding any persistent decoration.
**Color tag pills** (the only chromatic rhythm): pills within a card reveal **after** the card body, 30ms stagger, **180ms** each — so the eye lands title-first, then color, fixing the reviewer's "tags sit at the weakest scan position."
**Hover:** card lift `--spring-card` `-3px`; "open recipe" arrow nudges `x:4px`. **Touch targets:** the ledger flags sub-44px tap targets on mobile — that's a sizing fix, but ensure the hover/press states have a **120ms** active background tint so taps feel acknowledged on touch.

---

### recipe detail — `/recipes/{block-dangerous-commands (28), cap-blast-radius (22), pause-for-human (22)...}`

These are the **most dangerous routes for any reveal animation**: the ledger reports the code block and "The guard" section **literally do not render on mobile** ("~70–80% blank void... indistinguishable from a load failure") on nearly every recipe detail. A scroll-reveal here would make a *working* desktop build look identically broken.

**Therefore: no scroll-reveal of body content on these routes, period.** The hero (eyebrow/H1/subtitle/badges) gets one **380ms** load-time stagger, identical to capability detail. Everything below — sections, code block — ships fully painted, full opacity, no entrance.

**Code block** is the consistent standout ("dark, syntax-highlighted, the only craft moment"). Give it the only interaction:
- **Copy button:** on click, icon morphs clipboard→check over **160ms** `--ease-standard`, label "Copy→Copied" crossfades, reverts after 1600ms. A **120ms** scale-press on the button. This is genuine premium feel and is purely interactive (never gates content).
- Install/`INSTALL` tab affordance: active-tab underline slides between tabs `--spring-press`, **200ms** — Linear's tab idiom.
- Syntax highlight: static. No typing animation on recipes (unlike capability worked-examples) — these blocks are reference material the user copies; animation would delay utility.

The duplicated-copy and blank-mobile bugs are content/render failures motion must not touch.

---

### console replicas — `/console` and `/console/{dashboard (42), audit-explorer (42), ai-bom (47), approvals (36), drift (34), tokens (38), command-risk (38), red-team (38), integrity (38)}`

The richest motion opportunity and the highest concentration of "looks broken" failures: blank charts ("trend chart is a blank dark rectangle on every viewport"), tables that don't render or overflow on mobile, "60–80% dead black void." The terminal/macOS-chrome aesthetic ("traffic-light dots, LOCALHOST:5180, SIMULATED pill") is the universal standout.

**The fold is the asset** — white hero card meeting the dark console with hard-edge contrast (reviewers' favorite frame, repeatedly). Entrance:
- Hero card reveals first (**420ms**, `translateY(12px)` + opacity).
- The dark console panel slides up from **+16px** with `--ease-out-expo` over **640ms**, delayed 180ms — a slightly longer, weightier move than the card, so the two materials feel like distinct layers settling. This dramatizes the "dual nature / day-night split" the reviewers loved, using timing.
- macOS traffic-light dots: a **one-time** sequential fade-in (red→yellow→green, 80ms apart, **160ms** each) on first console paint. It's the signature detail; let it announce itself once. Never blink them.

**Live-data framing (critical honesty rule):** The console replicas are **illustrative/SAMPLE DATA** (every route's banner says so). So:
- Charts and tables must render their final state with **no perpetual loading animation**. A spinning loader on a static replica is the exact "is this broken?" trap.
- The **stacked area chart** (`dashboard`) / **bar chart** (`command-risk`, `red-team`): a **one-shot** draw-on reveal is appropriate and premium — area paths `clip-path` wipe left→right over **700ms** `--ease-out-quart`; bars grow from baseline (`scaleY 0→1`, transform-origin bottom, **520ms**, 40ms stagger). This reads as "data populating," reinforces the live-tool fiction *honestly* (it resolves and stops), and is a no-op if JS is off because the SVG ships at final geometry and the animation only replays the last frame's value.
- **The blank-chart bug is a render failure, not a motion gap** — but a correct **empty state** (axes + "no data in window" copy, statically present) must exist so that if data is genuinely absent, the panel reads as intentional, never as the void the reviewers saw.

**Decision/status badges** (EXECUTE/REFUSE/REWRITE color system — the semantic standout): on row reveal, badges fade in with their row; on the **single anomaly row** (red "Signed: no", amber "Drift", red "-28,600"), one **280ms** border-luminance pulse `--ease-in-out-soft` on first view to draw the eye — then static. The reviewers specifically praised these anomaly rows; timing makes them the last thing to land.

**Tables:** rows reveal in **24ms** stagger, **220ms** each, `translateY(6px)` — quick, so a 12-row table fully lands in ~500ms. On mobile, where tables "clip / overflow / disappear": **no row animation**; render the responsive card-reflow statically. Motion must never be the reason a mobile table row appears.

**Replay affordance** (`audit-explorer` teal "REPLAY SIMULATION"): clicking it re-runs the chart/row draw-on choreography — this is the one place a *repeatable* animation belongs, because the user explicitly requested it. Button press `--spring-press`; a **180ms** ripple from the cursor.

**`console_decision_{hash}` diff view** (premium 44; standout = "PROPOSED vs REWRITTEN diff, orange-highlighted changed value"): the changed value (`30000` in orange) gets a **one-time** highlight sweep — background `transparent→amber-tint→transparent` over **900ms** `--ease-in-out-soft`, delayed until the diff is in view, so the eye is led to exactly the byte that changed. The hash-transition arrow pill draws (`x` translate, **200ms**). This is the single most "premium" possible motion on the console family and directly amplifies the named best moment.

---

### playground — `/playground` (premium 42; "monotone, zero interactive delight, passive CTA")

This is the route the ledger most explicitly indicts for *lacking* interaction ("reads like a brochure, not an invitation to act"; "toggle card has no visual weight, easy to overlook as interactive"). Motion here is corrective, not decorative.

**Guided/Sandbox toggle (the page's job):** make it unmistakably interactive.
- Rest state: subtle, continuous **affordance hint** — a **2px** shadow that breathes (`box-shadow` opacity 0.4↔0.7, **2600ms** ease-in-out loop). This is the *one* sanctioned looping animation in the whole spec, justified because the reviewer's core complaint is that nothing "demands a click." Kept under 8% perceptual delta so it whispers.
- On toggle: the active-state indicator slides between Guided/Sandbox with `--spring-press` (**240ms**); the underlying panel content crossfades **200ms** + `translateY(6px)`. A satisfying, physical switch.

**Scenario cards** ("PIX, KYC, release, shell"): hover lifts `--spring-card`; the purple icon chip does a **160ms** `scale 1→1.08→1` settle on card hover — gives the grid the "delight surface" the reviewer says it lacks. Tag chips: no per-chip animation (the ledger says 4–5 colors already read as noise; animating them worsens it).

**"Watch the kernel decide" (the standout heading):** pairs with a Run action. On run: a **compact** inline decision animation — input pill → arrow draw (**200ms**) → outcome badge pops in (`scale 0.9→1`, `--spring-press`). Caps the "watch" promise concretely. Loading state during a real kernel call: a **3-dot** progress in the outcome slot (sequential opacity, **1000ms** loop) — bounded, clearly "thinking," replaced the instant the result lands.

---

### comparisons — `/comparisons` (premium 34; "comparison table renders empty on every viewport")

The fatal flaw is structural ("column headers but no rows — the page's core promise is visually unfulfilled"). **Motion must not animate the table in** — an empty table that fades up is the worst possible reinforcement of the existing bug. The table ships with rows present and static, full stop.

What motion *can* do: the editorial argument is sound; the scenario callout card (tablet standout) reveals once (**380ms**, `translateY(10px)`) as it enters. The three section labels get the **140ms** left-border draw used on capability H2s. The bad/good comparison framing (echoing `architecture`'s red/blue standout): if a populated comparison table exists, its **differentiator column** cells get a **one-time** staggered background-tint resolve (24ms/row) so the Adjudicate column visually "wins" on first view — converting the reviewer's "no color differentiation" complaint into a timed reveal. But this only fires once rows are confirmed in the DOM.

---

### Cross-cutting: the patterns that keep this from becoming "animation for its own sake"

| Pattern | Spec | Why it's safe against the void problem |
|---|---|---|
| Entrance reveal | `opacity 0→1` + `translateY(8–12px)`, 340–420ms, `--ease-out-quart`, fires once, in-view only | Node is painted first; interrupt = full-opacity steady state. Never gates existence. |
| Hero / material moves | `translateY(12–16px)`, 640–720ms, `--ease-out-expo` | Reserved for the 2–3 named keynote moments per route; longer = weightier, not slower-feeling. |
| Hover lift | `translateY(-3px)` + shadow, `--spring-card` | Pure interaction; no bearing on content presence. |
| Press | `scale 0.985`, 120ms | — |
| Anomaly/diff highlight | one-shot color sweep, 280–900ms, `--ease-in-out-soft` | Leads the eye to the named best moment; never loops (avoids live/broken ambiguity). |
| Skeleton | matched-silhouette, height-locked, 1400ms shimmer, 200ms crossfade-resolve | The *correct* answer to async-empty sections — replaces the blank voids that read as broken. |
| Reduced motion | all transforms → 0ms snap; only ≤120ms color hover survives | — |

**What is explicitly banned given this build's failure mode:**
- No scroll-reveal on `recipes/*` body content, `comparisons` table, `console_*` mobile tables, or any "THE ARTIFACT"/empty-section heading — every one of these is a place a reviewer already misread real emptiness as a load failure; animation would make a *working* build look identically broken.
- No perpetual spinners on the SAMPLE-DATA console replicas.
- No looping pulses on status badges (the console routes' "is this live?" ambiguity).
- The single sanctioned loop is the playground toggle's breathing affordance, justified by the explicit "nothing demands a click" finding.

The throughline: this build's reviewers scored it down for *absence*, repeatedly mistaking missing content for failed loads. A naïve scroll-reveal system would institutionalize that mistake. The system above keeps every element present and readable without JS, spends its longest, most deliberate motions only on the handful of moments reviewers actually praised (the gradient hero, the white-card/dark-console split, the 4-step stepper, the PROPOSED/REWRITTEN diff, the color-split thesis), and uses *cadence and timing* — not new decoration — to manufacture the hierarchy and rhythm the flat layouts lack.
