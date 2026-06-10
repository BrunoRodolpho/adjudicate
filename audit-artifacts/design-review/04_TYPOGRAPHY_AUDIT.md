# Typography Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

## Typography Audit

The site has no type system. It has type *habits* — and they contradict each other route to route. Across 58 routes the reviewer kept circling the same four failures: headlines that wrap into paragraphs because no mobile size exists, a scale so fragmented that section headlines and body weigh the same, all-caps eyebrow/label tokens that fall below legibility, and a single confident headline floating above content that was typeset by accident. What follows is a layer-by-layer indictment, then one scale to replace all of it.

---

### The fragmented scale — ~8 arbitrary sizes, no ratio

The ledger surfaces at least eight distinct, unrelated font sizes in active use, none related by a consistent ratio:

| Observed size | Where (route citation) |
|---|---|
| ~72–80px | `home` hero H1 (desktop_fold) — the ONE place type is genuinely big |
| ~50–56px | `how-it-works`, `deploy`, `recipes_cap-blast-radius`, `roadmap` H1s |
| ~48px | `console_dashboard`, `console_approvals`, `blog` fold, `capabilities_hallucination-scoring` H1s |
| ~44px | `capabilities` (=H1 "feels timid against a 1400px canvas"), `capabilities_agent-memory-store`, `capabilities_ai-bom` |
| ~40px | `capabilities_command-risk-guard`, `console_decision_*`, `console_command-risk`, `transparency_pii` |
| ~36px | `capabilities_incident-response-pack`, `console_approvals` (cited at both 36 AND 40 on the same route) |
| ~32–28px | mobile H1s, `transparency_red-team` (H1 "undersized relative to the horizontal canvas") |
| ~16–17px | body across nearly every route |
| ~15px → ~13–14px | `deploy` body (15px), `console` body ("~13–14px, too small for the wide card"), `recipes` card body (11–13px band) |
| ~11px and below | eyebrows, breadcrumbs, pill labels, `console` captions, footnotes |

This is the headline finding: **the same semantic layer renders at 36px, 40px, 44px, 48px, 50px, 52px, and 56px depending on which route you land on.** `capabilities_command-risk-guard` opens its H1 at ~40px; `recipes_cap-blast-radius` opens its H1 at ~50px; `home` opens at ~72px. There is no modular ratio (1.25, 1.333, golden) connecting any of these. The reviewer literally calls the `capabilities` H1 "timid against a 1400px canvas" (premium 28) while `home`'s 72px headline is the lone "Vercel/Linear keynote slide" moment (best_moment, every viewport). Same product, same nav, eight different ideas about how big a page title is.

---

### Layer-by-layer evaluation

#### Hero headline (H1)
**This is the single competent layer — and only on desktop.** The ledger is consistent that hero copy is the best-typeset thing on the site: `deploy` ("H1 typography is sharp, punchy… genuinely commands attention," typography scored 8, the highest single type score in the audit), `how-it-works` (two-line color-split thesis, the "sharpest moment on the fold"), `roadmap` ("Stripe/Linear-caliber editorial voice"), `transparency_pii` (serif H1 with a hard period, "the sharpest, most authoritative typographic decision on the route").

But the strength is fragile and breaks the moment the viewport narrows, because **no mobile headline variant exists**. The failures are everywhere and identical in kind:

- `roadmap` mobile: H1 wraps to **four lines**, "fully breaking the em-dash climax that gives the copy its personality." The worst wrapping failure in the audit — a punchline split across four lines.
- `blog_launching-adjudicate` mobile: H1 to **four lines** ("inadvertently bold," i.e. accidental, not designed).
- `recipes_block-dangerous-commands` mobile: H1 to **four lines**, "reads like body copy."
- `recipes_cap-blast-radius`, `recipes_cap-token-spend`, `recipes_least-privilege-access`, `blog_cap-token-spend` mobile: H1 to **three lines** with `'radius'` / single words orphaned on the final line.
- `comparisons` mobile H2 to three lines: "needed a shorter mobile variant — no visible fluid-type adjustment was applied."
- `capabilities_hallucination-scoring` mobile: H1 "should step down ~20% to avoid three-line wrapping."

The pattern is named explicitly by the reviewer on multiple routes: **"the title was never tested at mobile headline scale"** (`blog_cap-token-spend`). A single oversized desktop value is being shrunk fluidly with no breakpoint floor and no shortened copy, so on phones the headline stops being a headline and becomes a four-line paragraph.

**Measure failure on desktop too:** `capabilities` hero body sits at "~50 chars line-length — too tight for the canvas"; `blog_human-approval-resume` runs the opposite direction at "~90–95ch, well beyond the comfortable 65–75ch range"; `deploy`/`roadmap`/`capabilities_token-budget-guard` body "exceeds ~80–90 chars" at tablet. There is no `max-width` discipline on the prose column anywhere — line length is whatever the column happens to be.

#### Section headline (H2)
**The weakest, most consistently broken layer in the entire system.** The single most-repeated phrase in the typography observations is some variant of *"section headers are only one step above body weight."* It recurs on virtually every long page:

- `capabilities_access-governance-pack`: "H2 headings barely outweigh body text… the page feels like a prose wall."
- `capabilities_ai-bom`: "all five H2 section headers are identical in size and weight, making the page flat when scanned."
- `capabilities_red-team`, `capabilities_smart-approval-engine`, `capabilities_policy-coherence-analyzer`, `capabilities_incident-response-pack`: every section header identical weight → "impossible to scan the page structure at scroll speed."
- `blog_human-approval-resume` / `blog_stop-agent-draining-prod` / `blog_cap-token-spend`: **code blocks visually outrank H2 headings** — the hierarchy is *inverted*. Readers "navigate by cognitive effort rather than visual design" (worst_flaw, `blog_human-approval-resume`).
- `transparency_*` routes: "WHAT THIS SHOWS" and "WHAT THIS DOES NOT SHOW" labels carry equal weight, "blurring priority."

H2 is failing because the size jump from body (~16px) to section header is too small (the reviewer estimates "1 step above body weight," not a full tier) and the weight delta alone (bold) is doing all the work. On a long technical scroll this collapses the page into one undifferentiated text field.

#### Body
Body copy at ~16px is the most *adequate* layer, but it is undermined by two things: **no consistent measure** (covered above — ranges from 50ch to 95ch with no max-width) and **size drift downward** in dense contexts. `console` body drops to "~13–14px, too small for the wide card"; `recipes` cards compress "title, description, path, and CTA into an 11–13px band" so nothing scans; `deploy` runs body at ~15px gray. Leading is generally praised ("comfortable," "well-leaded," "1.6 line-height") — leading is the one metric the site mostly gets right. The problem is everything around it.

#### Metadata / tags / pills
Legibility failures dominate. Pill and tag label text is repeatedly flagged at or below the WCAG floor:
- `architecture` pill-step labels (STATE, TAINT, AUTH, BUSINESS): "extremely small on mobile, likely failing WCAG AA."
- `capabilities` badge pill text: "too small to read comfortably; pills compress into near-indistinguishable shapes at mobile scale."
- `capabilities_ai-bom`: "`@ADJUDICATE/CONFORMANCE` especially at risk" at 375px.
- `console_command-risk`: italic footer note "~9px equivalent — effectively unreadable."
- `console_approvals`: warning banner "~11px across 5–6 wrapped lines" — "a critical safety caveat rendered unreadable."

Beyond size, the tag layer also wraps catastrophically — `capabilities_*` routes uniformly report pill clusters wrapping to "3–5 ragged rows" on mobile with "inconsistent left-edge alignment," turning a semantic system into "pill soup."

#### Eyebrow / overline labels
The all-caps tracked label (`CAPABILITY`, `GUARDRAIL RECIPE`, `ROADMAP`, `CONTRIBUTE`) is a recurring legibility casualty. The reviewer's verdict is brutal and repeated:
- `capabilities_hallucination-scoring`: "CAPABILITY eyebrow is too small/low-contrast to serve its wayfinding purpose… tracking is insufficient for its size and reads as accidental."
- `recipes_least-privilege-access`, `recipes_gate-prod-deploys`, `recipes_redact-pii`: "GUARDRAIL RECIPE eyebrow is so low-contrast it functionally disappears" / "below minimum readable contrast at mobile size, failing basic legibility."
- `incident-response-pack`, `transparency_integrity`: eyebrow "too faint to anchor the page."

The eyebrow is supposed to be the wayfinding tier; on this site it's invisible.

#### Nav
**The one layer that works at every breakpoint on every route.** Nav is the most-praised typographic element in the entire ledger — "the most composed, premium-feeling element on the fold" (`introspection`), "the most polished horizontal strip" (`capabilities`, `blog`, `console_audit-explorer`, `recipes_block-dangerous-commands`). Wordmark + V1 badge + spaced links + purple GitHub pill. It proves the team *can* typeset — they just did it once and never propagated it. Minor flaw: nav active-state differentiation is "subtle and easy to miss" (`transparency` routes), and the announcement-bar font is repeatedly noted as a different/smaller register than nav, creating "micro-hierarchy inconsistency at the very top" (`console_decision_*`, `console_dashboard`).

#### Buttons / CTAs
Typographically fine where they exist (the purple GitHub pill is consistently legible and well-weighted). The failure is *absence*, not type: `deploy` has "no CTA anywhere — a deploy page with no Install/Get started button is a hierarchy and conversion failure"; `playground` toggle "reads as static text, not an interactive affordance." And the one chronic type problem: CTA purple and the headline-gradient purple share the same hue on `home`, so "the CTA needs more contrast differentiation to pop independently."

#### Captions / monospace / code
Code is typeset as raw documentation, not designed artifacts. Monospace is repeatedly **too small on mobile and clips data**:
- `console_audit-explorer` mobile: HASH column header clips to "`HAS`", hash values fragment, TIME column disappears entirely — "the core feature is non-functional."
- `console_drift` mobile: ELEVATED badge clips to "`0`" instead of "`0.31`" — **the data is destroyed by a font/width failure**, not just degraded.
- `console_tokens` mobile: column headers clip to "`REM`", "`BUDGE`."
- `blog_*` mobile: code "requires pinch-to-zoom," "rendered at desktop font-size, completely illegible."
- The `console_*` truncated-hash problem and the install-command issue: `home` mobile flags "`pnpm add @adjudicate/cor`" as "likely clipped or horizontally overflowed" — **the truncated hero install command**, exactly the wrapping failure called out: a code token that overflows its container because monospace has no responsive size step and the container has no scroll affordance.

---

### Prescription: ONE confident type scale

A single modular scale on a **1.25 (major third) ratio**, with a hard mobile step-down at each display tier and a defined measure per layer. Numbers are deliberate — replace the eight ad-hoc sizes with these seven and nothing else.

**Type families:** Display/UI — one geometric-humanist sans (the existing one is fine). Mono — one mono, used ONLY for code/hashes/package paths, never for eyebrows or captions.

| Layer | Desktop size / line-height | Mobile size / LH | Weight | Tracking | Measure (max-width) |
|---|---|---|---|---|---|
| **Hero H1** | 64px / 1.05 | **40px / 1.1** (hard floor; clamp, don't fluid-shrink below) | 680 (semibold-plus) | −0.02em | **≤ 16 words / ~20ch per line**; cap hero text block at 14ch–28ch so it breaks to 2 lines max, never 3+ |
| **Section H2** | 32px / 1.15 | 26px / 1.2 | 680 | −0.01em | n/a (full bleed of content col) — **must be a full tier (2 steps) above body, not one** |
| **Subsection H3** | 24px / 1.25 | 20px / 1.3 | 600 | 0 | — |
| **Body** | 17px / 1.6 | 16px / 1.6 | 420 | 0 | **66ch hard `max-width`** on every prose column (kills both the 50ch and the 95ch problems) |
| **Lead / deck** | 20px / 1.5 | 18px / 1.5 | 440 | 0 | 60ch |
| **Eyebrow / overline** | 13px / 1.2 | 13px / 1.2 (do NOT shrink below 13) | 600 | **+0.12em** | — — raise contrast to ≥ 4.5:1; current tracking + contrast both fail |
| **Metadata / pill / caption** | 13px / 1.3 | **13px floor (never below 12)** | 500 | +0.04em | — |
| **Mono / code** | 14px / 1.5 | **14px floor** + horizontal-scroll container; never let hashes/headers clip | 450 | 0 | container scrolls; truncate with explicit ellipsis affordance, never silent clip |

**Non-negotiable rules that fix the cited failures:**

1. **Mobile headline floor + copy budget.** No H1 may wrap past 2 lines at 390px. Enforce a `clamp(40px, …, 64px)` floor *and* a per-page short-headline variant. This single rule kills the four-line `roadmap`/`recipes`/`blog` wraps and restores the em-dash punchlines.

2. **One ratio, seven sizes — delete the other ~8.** 64 / 32 / 24 / 20 / 17 / 13 / 14(mono). Every `capabilities_*` and `recipes_*` H1 that currently renders at 40/44/50/52/56 collapses to the single 64px display value, ending the "is the title big or timid?" inconsistency between `capabilities` (44, "timid") and `deploy` (56, "commands attention").

3. **H2 is two steps above body, not one.** 32px / 680 vs 17px / 420 is a 1.9× size jump plus a 260-weight delta. This alone resolves the "prose wall / flat scroll / code outranks headers" verdict that recurs on every long page (`capabilities_*`, `blog_*`, `transparency_*`).

4. **66ch hard measure on all prose.** Fixes `blog_human-approval-resume` (95ch), `capabilities` (50ch), and the tablet ~90ch drift in one constraint.

5. **13px floor, +0.12em tracking, ≥4.5:1 contrast on eyebrows/pills/captions.** Restores wayfinding on the `CAPABILITY`/`GUARDRAIL RECIPE`/`ROADMAP` overlines and lifts pill labels off the WCAG floor flagged on `architecture` mobile and `capabilities_ai-bom`.

6. **Mono never below 14px; code containers scroll, hashes truncate with a visible affordance.** Ends the `console_drift` "`0.31`→`0`" data-destruction, the `console_audit-explorer` "`HAS`" clip, and the `console_tokens` "`BUDGE`" clip — these are typographic failures masquerading as data failures.

7. **Mono is for code only.** Stop using all-caps mono for eyebrows and breadcrumbs (`recipes_*` "BACK TO RECIPES styled as plain monospace caps — reads as afterthought"). Eyebrows are sans + tracked caps; mono is reserved for `@adjudicate/*`, hashes, and terminal content so the two registers stop competing (the "two distinct all-caps micro-label treatments share no token" fragmentation on `recipes_block-dangerous-commands`).

The site already proves it can hit the bar — the nav and the desktop hero H1 are genuinely good. The entire fix is to **promote those two correct decisions into a system and enforce it down to mobile.** Right now there is one beautiful headline sitting on top of seven sizes of accident.
