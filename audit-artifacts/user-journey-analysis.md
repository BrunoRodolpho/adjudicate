# User-journey analysis

Three journeys executed against the live site (dev server, :5181) + the captured screenshots. **Brutally honest; assumes no existing users.** The recurring blocker — content gated behind a scroll-reveal that initializes at `opacity:0` — degrades *every* journey, so it's called out once here and treated as the #1 roadmap item.

---

## Journey 1 — First-time visitor ("what is this and why do I care?")

**Path:** land on `/` → read hero → scroll for proof → click a CTA → `/playground` or `/how-it-works`.

**What works**
- The **above-the-fold is genuinely strong** (`desktop/home__fold.png`): a confident outcome-first headline ("Guardrails for AI agents that go beyond block-or-allow"), a decision-spine subhead, a clean CTA cluster, the v1 production banner, and a one-click install chip. A developer learns *what / why / how-different* in ~5 seconds.
- If the body renders, the **MagicMoment** (Risk→Fix, `100% → 25%`) is a high-conversion "aha" and the 4-step spine carries the mental model well.

**Friction / dead-ends**
1. **Scroll past the hero → blank** (`desktop/home.png`, `mobile/home.png`). Below-fold sections initialize hidden and only paint on an IntersectionObserver callback; for no-JS, print, throttled mobile, or crawlers the homepage is an empty page. *Catastrophic first impression in those contexts; the journey dead-ends at the fold.*
2. **The hero install chip is truncated** to `pnpm add @adjudicate/cor` (`heuristics` finding) — the single most important copy-paste action is visibly clipped.
3. **Number mismatch:** the hero subhead lists **five** outcomes; the rest of the site says **six** — a credibility wobble at the trust-forming moment.
4. **CTA promise vs reality:** "Try the **5-min demo**" → a Guided/Sandbox playground that isn't framed as a timed demo. Minor expectation gap.
5. **Vocabulary drift:** `/how-it-works` renames REWRITE/DEFER/REQUEST_CONFIRMATION to *modify / wait / ask* — a second vocabulary on the other top entry page.

**Verdict:** The hook is excellent; the follow-through is undermined by the visibility bug and small copy inconsistencies. **First-success moment exists but is fragile.**

---

## Journey 2 — Evaluator / returning developer ("does it actually solve my problem? can I copy something?")

**Path:** `/capabilities` → a capability → `/recipes` → copy a recipe → `/playground` to try it.

**What works**
- `/recipes` is a strong solution-SEO surface — 8 outcome-tagged, problem-framed cards; live recipes render a **real receipt** (genuine proof, not a mockup).
- Capability pages carry verifiable provenance (ADR + source links) and live-kernel worked examples.

**Friction / dead-ends**
1. **`/capabilities` index looks broken** (`desktop/capabilities.png`): the scroll-reveal hides 3 of the 4 families, so the index reads as a near-empty page on first paint.
2. **Recipe deep-dives hide their payload on mobile** (`mobile/recipes_over-refund-clamp.png`): install, code, and the live outcome are all below an unrevealed fold — the most valuable part is invisible.
3. **Two maturity vocabularies collide:** Tier 1/Tier 2 (capabilities) vs Live/Illustrative (recipes) describe overlapping ideas with different words — the evaluator has to reconcile them.
4. **Verbatim duplication** on capability pages: the header subtitle and the first body paragraph are identical — reads as unfinished.

**Verdict:** The *content* is convincing and the live-kernel proof is a differentiator, but the reveal bug + vocabulary debt make the evaluation feel rougher than the underlying substance deserves.

---

## Journey 3 — Power user / operator ("show me the depth — the console, the sandbox, deployment")

**Path:** `/console` (replicas) → a replica → `/playground` Sandbox → `/deploy` → install.

**What works**
- The `/console` hub + 10 replicas are an ambitious "see the operator surface" showcase with an honest "Illustrative replica" boundary; the ConsoleTailLoop video adds life.
- The Sandbox (schema-aware form, real kernel) and the honest, repo-grounded `/deploy` story are credible for a technical buyer.

**Friction / dead-ends**
1. **Charts/tables render as empty boxes** on first paint (`desktop/console_dashboard.png`, `console_drift.png`) — the reveal gates the chart and `once:true` makes the blank permanent if the trigger misses.
2. **Mobile console is broken-ish:** the flagship audit table clips its right columns with no scroll affordance (`mobile/console_audit-explorer.png`); AI-BOM drops its entire detail pane and becomes a 2-item list (`mobile/console_ai-bom.png`).
3. **`/comparisons` has six dead `#playground` CTAs** — "Try in playground" links point at a non-existent anchor; a power user clicking them goes nowhere.
4. **IA gap:** `/blog`, `/roadmap`, `/contribute` are footer-only — a returning contributor can't find them from the header.

**Verdict:** The depth is real and impressive in breadth, but mobile density and the dead anchors create concrete dead-ends; the console's value is hard to feel on a phone.

---

## Cross-journey themes
- **One bug dominates:** content-visibility-on-scroll degrades all three journeys. Fixing it (content visible by default; motion as enhancement) is the highest-leverage single change.
- **Accessibility blocks the keyboard journey entirely:** no visible focus on any CTA/nav link, a shipped-but-unrendered skip link, and a mobile sheet that isn't a real dialog — keyboard and screen-reader users have a substantially worse journey than the visuals suggest.
- **Mobile is a second-class journey:** dense console surfaces clip, long pages trail thousands of px of empty space, and the flagship pages render blank on capture.
- **Polish vs robustness gap:** when it renders, the craft is high (round-2 motion/receipt/bento); the gaps are in *robustness and inclusivity*, not taste.
