# Breathtaking Transformation Plan

> The architectural design changes required to move adjudicate's marketing site from **mean 34.7 / "developer-assembled"** to genuinely deserving Apple / Linear / Stripe / Vercel / Notion comparison. Not incremental — these are the *structural* moves, ordered so each unlocks the next. Page-level patches are explicitly rejected wherever a system-level fix exists.

## The thesis
The site fails for **one reason in eight costumes**: there is no design system underneath it — `tailwind.config.ts` defines a palette and nothing else, so every surface is improvised. The transformation is therefore **not 200 fixes; it is ~8 architectural decisions, each applied once at the system layer.** Get these right and the 60 audit findings + the Top-50s collapse into a handful of commits that change every route simultaneously.

---

## Move 1 — Install the missing scales into the design system *(the keystone)*
**This is the highest-leverage change on the entire board.** Extend the token layer with the four scales it never had:
- **Spacing** — a single 4/8px-based scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128) *plus a named section-rhythm scale* (`section-y`, `block-y`, `stack`) so vertical rhythm is chosen by a token, never by a raw number.
- **Radius** — one ramp (sm 6 / md 10 / lg 14 / pill 9999) so cards, pills, inputs, and buttons stop disagreeing.
- **Type** — one modular scale (below) replacing the ~8 ad-hoc sizes.
- **Elevation** — one shadow ramp + a border-discipline rule so "depth" is a token, not a guess.

**Why it's first:** the debt pass proved every spacing accident, type habit, and pill divergence traces to "raw utilities have no opinion." Give them an opinion **once** and the dead-bands, the fragmented headers, and the mismatched shapes all resolve at the source. Architecturally, this is a config + a handful of primitive edits — and it changes 58 routes.

## Move 2 — Content visible by default + footer-anchoring *(kill the voids)*
Two changes that together eliminate the disqualifying flaw:
- **Progressive-enhancement motion** (RC-1): content renders at `opacity:1` in SSR/no-JS; motion is a transform-only enhancement on a *visible baseline*, never a gate. No more blank-on-scroll, no more blank mobile, no more "did it load?"
- **A page-length contract**: every page's content anchors the footer within one viewport of the last block — no 600–1200px terminal voids, no 13,240px / 90%-empty `home`. Long pages earn their length with calibrated density (Move 3); short pages *are short*.

## Move 3 — A calibrated density system *(fix the bimodal failure)*
The Elite density pass found the site is **sparse-to-empty on desktop and dense-to-overloaded on mobile** — no calibrated middle. Architect density as a deliberate posture per page-type:
- **Desktop:** fill the measure the way Linear/Stripe/Vercel do — alternating tonal section bands for pacing, a balancing right-column counterweight (Move 6), and information *density* where the product is technical (the console surfaces should be denser, not emptier).
- **Mobile:** a real reflow strategy (Move 7 of the execution plan) — tables scroll, panels become tabs/accordions, code blocks fit — so nothing drops.

## Move 4 — One pill + one semantic color system *(kill the confetti)*
Collapse the **four incompatible badge grammars** and **two divergent decision chips** into **one governed pill primitive** driven by **one semantic color module** (the canonical six outcomes + a small status palette: shipped/roadmap/info/warn). Color then encodes *meaning*, never decoration. The under-pigmented light canvas gets a **proper neutral ramp** (8–10 steps) so surfaces, borders, and text can finally express hierarchy without resorting to badge sprinkles.

## Move 5 — De-containerize: hierarchy over decoration *(kill the noise)*
Adopt the noise pass's rule product-wide: **one container type per *semantic* role, never per content block.** Delete the 4–5-layer nested borders. Group with **whitespace intervals + a 2–3 step type scale** (heavier section label, generous top margin, lighter body). Where a true surface boundary is needed (live data vs prose), use a **single ~2% tonal tint, no border** — the Apple/Stripe treatment. Borders and shadows become rare, intentional, load-bearing — not wallpaper.

## Move 6 — Compositional architecture: earn the right half
End the "abandoned two-column" look on every route. Two sanctioned patterns, no third:
- **Asymmetric with a counterweight** — left editorial column + a right *payload* (a live console peek, a code preview, a diagram, a stat block, a receipt). This is the default for capability/recipe/architecture pages and doubles as content that fills the void.
- **Centered single optical column** — for pure-editorial pages (blog, roadmap), measured and optically centered (not box-centered).

## Move 7 — Type architecture with a real tier jump
Replace type habits with one confident scale (full spec in the Blueprint): a **decisive H1→section-header size/weight jump** so section headers become scannable landmarks instead of bold body; **dedicated mobile sizes** so headlines stop wrapping into paragraphs; a fixed **measure (~62–72ch)** so prose stops running edge-to-edge. The editorial routes (blog, how-it-works) get a real **article system** — drop caps/lede, pull-quotes, callouts, captioned code — so they stop reading as raw markdown.

## Move 8 — Build the experience around 3–4 signature moments
Premium sites are *remembered for one thing*. adjudicate already owns the assets; it just buries them. Make these the spine:
1. **The signed receipt** materializing — tamper-proof, hash-chained, the "black box recorder for AI." This is the emotional climax; give it a full-bleed, cinematic moment.
2. **The white-card-on-black operator console** — carry that terminal material identity *across all breakpoints* (today it degrades to generic off-white on tablet/mobile).
3. **The six-outcome decision moment** — the Risk→Fix split-screen, the pills animating in. The "beyond block-or-allow" thesis made visible.
4. **The Guard-decides stepper** as the recurring narrative device.

Everything else is supporting cast and should get quieter so these can be loud.

## Move 9 — An optical-correction layer
Once the system is in place, add the perceptual polish that separates "designed" from "assembled": optical-center pill dots on x-height, nudge stat numerals up against header mass, give filled pills inset/radius correction so they read level with outlined siblings, hang or remove trailing display periods, unify CTA radii. Small, systematic, applied at the primitive level — felt everywhere, named nowhere.

---

## Sequencing (each move unlocks the next)
```
Move 1 (scales) ─┬─> Move 4 (pill+color) ─> Move 5 (de-containerize)
                 ├─> Move 7 (type)        ─> Move 6 (composition)
Move 2 (visibility+anchor) ─> Move 3 (density) ─> Move 8 (signature moments)
                                                  Move 9 (optical) = final polish
```
Moves 1 + 2 are the foundation and must come first — they remove the soil (no-system) and the disqualifier (voids). Moves 3–7 are the system build-out and largely parallelize. Moves 8–9 are where it becomes *breathtaking* rather than merely *correct*.

## What "done" feels like
A visitor lands, reads a confident fold, scrolls — and **the page keeps delivering**: calibrated density, alternating tonal bands, a payload in every right column, section headers that scan, one coherent pill language, a console that stays premium on their phone, and a signed-receipt moment that makes the product's whole thesis land in three seconds. The trust earned at the fold is *kept*, all the way down. That is the difference between 34 and 85 — and it is ~8 decisions, not 200 patches.
