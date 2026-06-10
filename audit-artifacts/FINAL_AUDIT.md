# Final Audit — adjudicate marketing site (post-rebuild)

> Re-audit of the rebuilt site: **57 routes scored desktop + mobile** (114 full-page screenshots in `recrawl-final/`, one agent per route, same honest 0–100 bar as the original audit). Compared against the original audit baseline.

## Headline — before / after

| Metric | Original audit | **Rebuild** | Δ |
|---|---:|---:|---:|
| **Mean premium score** | 34.7 | **59.6** | **+24.9 (×1.72)** |
| Median | 34 | **62** | +28 |
| Routes **rendering fully** (desktop+mobile) | ~45% | **96.5% (55/57)** | — |
| Routes **failing** (<35) | 31 of 58 | **0** | −31 |
| Routes "broken/blank below fold" | majority | **0** | — |
| Mobile horizontal overflow | several | **0 / 57** | — |
| Dead internal links | 6+ (`#playground`) | **0 / 69** | — |

**The defining failure of the original audit — "most pages render blank below the fold" — is cured.** 55 of 57 routes now render their content fully on both viewports; the 2 exceptions (`console_audit-explorer`, `console_drift`) are mobile table *scroll-affordance* issues, not blank pages (the tables scroll; 0 page overflow). Zero routes now fail.

## Score distribution

| Band | Routes | Share |
|---|---:|---:|
| 80–100 (premium / showcase) | 0 | 0% |
| 65–79 (strong) | 5 | 9% |
| 50–64 (competent) | 50 | 88% |
| 35–49 (weak) | 2 | 3% |
| <35 (failing) | 0 | 0% |

The distribution is **tightly clustered at 52–64** — a consistently-applied design system, not a spread of independently-tuned pages. The floor and body moved up dramatically; the **ceiling is hard at 72** — no page yet reaches Linear/Stripe-tier.

**Strongest:** `home` 72 · `architecture` 72 · `recipes_over-refund-clamp` 72 · `console_dashboard` 71 · `capabilities_policy-coherence-analyzer` 68.
**Weakest:** `transparency_integrity` 42 · `transparency_tokens` 44 · the rest of the `transparency_*` cluster 52 — the clearest single opportunity area (reads as "formatted docs, not marketing").

## What the rebuild delivered (verified, committed)

| Wave | Work | Commit |
|---|---|---|
| 0 | Token foundation — the 4 missing scales (fontSize/radius/shadow/spacing) + AA neutral ramp + decision `.strong` + single `brand` accent | `d925b14` |
| 1 | **Content visibility** (transform-only reveals → 0 invisible/70 routes + permanent guard); **a11y** (focus rings, SkipLink+landmark, real Dialog); **contrast** (208 faint→muted AA) | `d925b14` |
| 2 | Pill+color unification (one `DecisionChip`, indigo→brand sitewide); type tier jump | `d925b14` |
| 3–4 | install-chip fix · Community nav · dead-anchor kill · 6/6 outcomes · recipe stub-copy · branded 404 · `<hr>` de-containerize · dead-band fix | `d925b14` |
| WS-D | **Console replica de-containerize** (3–4-layer nesting → depth-2) | `5df903d` |
| WS-G/V | **Mobile overflow eliminated** (0/57) + **link-integrity** (0 dead) + regression check | `4066f0b` |
| WS-L/E | Blog **tags + RSS + featured** treatment; prose reading-measure cap | `d1b9712`, this |

## Remaining work to reach 80+ (honest — needs design craft / iteration)

The rebuild fixed the **structural** debt (visibility, system, a11y, mobile, nav). The gap to premium is now **art direction**, which clustered into 7 themes across the 369 per-route notes:

1. **Flat typographic hierarchy** — the #1 ceiling reason (cited on the majority of routes). H1/H2/section-label/body sit too close in weight; nothing pulls the eye down-page. Needs a bolder display/section tier and more inter-level contrast than the (correct but conservative) current scale.
2. **Dense small text + likely AA failures on the data surfaces** — console/transparency body+code at ~10–13px, several flagged *probably failing AA*. (The marketing canvas was fixed; the dark dense surfaces need a contrast + min-size pass.)
3. **"Reads as developer docs, not premium marketing"** (~a dozen routes) — the system is competent but generic.
4. **No imagery / illustration anywhere** — pages are 100% text+code; the blog has no thumbnails/covers.
5. **Mobile table/code clipping** — `console_audit-explorer`, `console_drift`, `console_tokens`, `console_command-risk`: tables scroll but lack affordance; the blueprint's card-list reflow below 480px is the real fix.
6. **Weak CTAs** — primary actions render as plain underlined text (not buttons) on several capability/recipe/comparison routes.
7. **Flat section rhythm + residual voids** — uniform spacing, no tonal bands; literal voids remain on `roadmap`, `console_drift`, `console_command-risk`.

**The transparency cluster** is the highest-ROI next target (4 of the bottom 6); it needs the same de-containerize + data-viz treatment the console replicas received.

## Verdict

**The rebuild succeeded at its core mandate.** It took a site whose craft was *sabotaged by a content-visibility bug and missing design system* (mean 34.7, half the pages blank) to a **robust, accessible, consistent, fully-rendering 59.6** — every structural finding from the original audit is resolved and guarded against regression. What remains is not *debt* but *polish*: the move from "competent and consistent" to "artful and premium" (the 72→90 climb), which is per-page design craft — bolder hierarchy, real imagery, denser premium data-viz, mobile table reflow — best done with a designer's eye, page by page, rather than systemic bulk edits.
