# FINAL_AUDIT_R4 — post-premium re-score (2026-06-10)

Supersedes `FINAL_AUDIT.md` (mean 59.6, Jun 9), which predated the transparency
premium pass, the coded brand moments, the `FamilyMap`/`DecisionFan` rollout,
and the `/architecture` push. This is a fresh full re-crawl (58 routes ×
desktop+mobile, `audit-artifacts/recrawl-r4/`) re-scored by 58 independent
design-director agents on a calibrated premium rubric (anchored to the 34.7
original / 59.6 prior baselines; 80+ = genuine Stripe/Linear/Vercel showcase).

## Headline

- **Mean 64.4** — trend **34.7 → 59.6 → 64.4**. The premium work moved the
  needle ~5 pts and lifted the ceiling 72 → 74, but **0 routes reached 80**.
- **Median 64, range 58–74** — the whole site is compressed into a tight
  "competent, not showcase" band. No broken routes (none <58), no showcase.
- **Distribution:** ≥80 = **0** · 70–79 = **5** · 65–69 = **17** · 60–64 = **33** · <60 = **3**.
- **Weakest axis: craft 62.4** (the optical/finish/signature layer), then
  spacing 64.0, composition 64.9, color 65.0, mobile 66.7. **Typography 68.0 is
  the strength** — the writing/type voice is already premium; the *design
  finish* is what lags.

Guards green at capture: SSR-visibility 70/70 routes 0 invisible; mobile-overflow
0; dead links 0. (Note: `web-audit-checks` passes because console tables use
`overflow-auto` — the mobile *column clipping* the agents saw is visual, inside a
scroll region, so it doesn't trip the page-overflow guard. WS-G affordance still
needed.)

## The two clusters that hold the mean down

**1. The 14 capability pages (all 61–66).** Every single one drew the *same*
verdict: *"'What it does' is an undesigned wall of prose at a wide measure"* +
*"flat white cards on white, no tonal banding"* + *"console-preview / public-data
sections are under-filled placeholders"* + *"one signature moment at best."*
This is a **single template** (`CapabilityPageLayout`) repeated 14×. Fixing the
template — break the prose wall (lead + pull-quote + list rhythm), alternate
tonal bands, add depth/material to the cards, and fill or remove the empty
console/public-data sections — **lifts 14 routes at once**. Highest ROI on the
site.

**2. The 9 console replica pages (58–70).** Recurring: *"undesigned placeholder
charts — flat fills, no axes / gridlines / labels"* (drift timeline, red-team
green block, integrity area chart, dashboard bars), *"dark-on-dark low-contrast
tables, rows blur together"* (tokens, approvals, ai-bom), and *"mobile column
clipping"* (audit-explorer HASH, drift SEVERITY, command-risk DESTRUCTIVE/
CATEGORY, tokens REM/BUDGET). Improving the shared chart + table primitives
(`console-kit`/`console-tour`) lifts the whole cluster. Overlaps WS-G.

## Discrete craft bugs (cheap, each worth ~5–15 pts)

These are finish defects, not "flatness" — fast wins:

- **`/` mobile** — ~400px dead band on the mobile hero (an empty white card
  between the install command and the outcome cards; hero visual with no mobile
  fallback). Drags home's mobile axis to 58 and caps the site's best page at 70.
- **`/how-it-works`** — two panels render nearly empty (the central hero diagram
  + the bottom "signed receipt" artifact box), reading as failed/placeholder. → 58.
- **`/comparisons`** — code clips mid-line (`15*60*1000, b`, `in v0.1`); branch
  diagram has redundant `EXECUTE`/`Execute` restated labels. → craft 55.
- **`/introspection`** — hero headline *"Your policy is no longer a black box"*
  is repeated verbatim as the graph-section heading; graph is sparse dots on
  empty canvas.
- **`/transparency/tokens`** — *"≈ ≈ 1.24M of ≈ ≈ 1.5M"* doubled approximation
  symbols (reads as a render bug on the most-read number); lopsided hero (83%
  stat hard-left, meter exiled far-right).
- **`/console/integrity`** — visible **"DIGEST MISMALTCH"** typo; placeholder
  amber area chart.
- **`/console/tokens`** — dark-on-dark tables barely legible; burn-bar column
  near-invisible.
- **`/blog/human-approval-resume`** — code line clips (`createStateDeferGuard<…>({`)
  with no scroll affordance.

## Universal theme

Across ~40 routes: **flat tonal monotony** (white-on-white, hairline-bordered
cards, no alternating bands or material depth) + **no signature moment** +
**prose walls**. This is the `craft` + `spacing` axis story and maps directly to
WS-D (tonal-band rhythm, currently under-adopted) and a per-archetype signature
moment.

## Reprioritized roadmap (by ROI, supersedes the Phase 1/2/3 emphasis)

| Pri | Work | Routes moved | Maps to |
|---|---|---|---|
| **1** | **Capability-page template** — break prose wall, tonal bands, card depth, fill/cut empty sections, one signature moment | **14** | (new) → folds into Phase 3 |
| **2** | **Console chart + table craft** — real charts (axes/grid/labels), fix dark-on-dark contrast, `ResponsiveTable` affordance | **9** | WS-G + Phase 3 |
| **3** | **Discrete craft bugs** — home mobile dead-band, how-it-works panels, comparisons code, introspection headline, tokens `≈≈`, integrity typo | 6–8 | (new) |
| **4** | **Tonal banding site-wide** — adopt `Section` tone rhythm + `py-section` tokens to kill white-on-white monotony | most | WS-D |
| **5** | **Blog editorial** — shiki highlighting + layout counterweight (kill the off-center dead gutter) | 6 | WS-E (started) |
| 6 | Hero right-column; optical layer; a11y/contrast specs; chip/maturity/states cleanups | — | WS-F, WS-K, WS-V, WS-C/I/L |

**Read:** the plan's workstreams remain valid, but the scores say the dominant
levers are the **capability template (14)**, **console craft (9)**, and the
**discrete bugs** — none of which were headline workstreams. These should lead;
the optical/spec/cleanup tail (WS-K/V/C/I/L) is genuinely lower-ROI now.

## Per-route scores (sorted ascending)

(Comp/Type/Color/Space/Craft/Mob = the six axes, 0–100.)

| Route | Overall | Comp | Type | Color | Space | Craft | Mob | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/how-it-works` | **58** | 62 | 74 | 60 | 63 | 52 | 64 | A genuinely premium frame-by-frame concept and Linear-grade headline, undercut by two empt |
| `/console/tokens` | **58** | 60 | 64 | 55 | 57 | 52 | 53 | Strong hero and console-window framing, but the dark-on-dark tables read as unfinished and |
| `/console/red-team` | **59** | 60 | 63 | 57 | 60 | 56 | 64 | A credible terminal-replica concept undercut by a giant flat-green trend block and generic |
| `/introspection` | **61** | 60 | 70 | 63 | 60 | 58 | 68 | Competent, well-written introspection page with a strong console moment, undermined by a d |
| `/console/approvals` | **61** | 63 | 58 | 66 | 60 | 59 | 57 | Polished editorial header sitting on a dense, under-designed dark console — competent and  |
| `/capabilities/command-risk-guard` | **61** | 60 | 62 | 66 | 63 | 57 | 68 | Disciplined, semantically-colored capability doc that reads competently designed but flat  |
| `/capabilities/config-integrity-se…` | **61** | 60 | 63 | 62 | 59 | 60 | 70 | Competent infra detail page with one strong terminal moment, but flat white prose-and-card |
| `/capabilities/access-governance-p…` | **61** | 62 | 60 | 58 | 63 | 60 | 66 | Competent, well-structured capability doc let down by a flat tonal palette and an unbroken |
| `/transparency/drift` | **61** | 62 | 67 | 58 | 60 | 58 | 63 | Reads like a capable, well-typeset startup doc — strong headline and prose, but the body i |
| `/transparency/tokens` | **61** | 58 | 68 | 60 | 63 | 56 | 64 | One genuinely good amber stat moment, undercut by a lopsided dead-air hero and a 'approx a |
| `/transparency/integrity` | **61** | 62 | 67 | 55 | 58 | 59 | 66 | An honest, well-written transparency doc with one good color moment, but flat table-like s |
| `/playground` | **62** | 60 | 66 | 70 | 58 | 60 | 64 | Coherent scenario-card grid with strong semantic color, but the "interactive" shell is an  |
| `/blog` | **62** | 63 | 68 | 55 | 61 | 60 | 70 | Clean, well-written editorial index that reads competent-startup, not showcase — restraine |
| `/roadmap` | **62** | 64 | 63 | 58 | 65 | 61 | 60 | Disciplined, well-structured timeline page with strong editorial voice, but it's a monochr |
| `/console/drift` | **62** | 63 | 70 | 72 | 62 | 58 | 55 | A credible terminal-replica console surface with a tasteful amber accent, undercut by an u |
| `/console/command-risk` | **62** | 60 | 68 | 70 | 62 | 58 | 52 | Competent, well-organized console replica with restrained semantic color and a nice footer |
| `/capabilities/ai-bom` | **62** | 63 | 64 | 60 | 62 | 60 | 66 | Competent, well-structured capability doc with one strong dark focal block, undercut by a  |
| `/comparisons` | **63** | 66 | 72 | 63 | 68 | 55 | 64 | Strong editorial bones and a smart 3-act structure, undercut by clipped code blocks and re |
| `/transparency` | **63** | 65 | 70 | 58 | 66 | 60 | 70 | Clean, legible governance page that reads as competently assembled — but flat, single-tone |
| `/console/ai-bom` | **63** | 64 | 66 | 62 | 61 | 60 | 58 | A competently-assembled console mock with a clean hero, but the dense data panel reads as  |
| `/capabilities/token-budget-guard` | **63** | 64 | 66 | 62 | 63 | 60 | 65 | Clean, consistent capability-template page with a strong H1 and a credible worked-example  |
| `/capabilities/red-team` | **63** | 64 | 62 | 68 | 61 | 63 | 62 | Competent capability page with one real signature moment (the console bar chart), but flat |
| `/capabilities/behavioral-drift` | **63** | 62 | 63 | 64 | 61 | 64 | 70 | Clean, well-structured capability doc with one strong terminal moment, but a linear left-r |
| `/capabilities/policy-coherence-an…` | **63** | 64 | 63 | 62 | 62 | 60 | 72 | Coherent, on-brand capability page with solid mobile parity, but flat material and a monot |
| `/capabilities/smart-approval-engi…` | **63** | 64 | 66 | 60 | 63 | 62 | 68 | Clean header and a strong dark worked-example moment, undercut by a flat prose wall and un |
| `/capabilities/incident-response-p…` | **63** | 64 | 65 | 66 | 62 | 61 | 67 | Competent, semantically-colored capability page that reads as a capable startup — let down |
| `/recipes/block-dangerous-commands` | **63** | 64 | 62 | 70 | 61 | 60 | 68 | A cleanly structured, semantically colored recipe doc that reads competent and trustworthy |
| `/transparency/red-team` | **63** | 64 | 66 | 65 | 60 | 62 | 64 | A strong editorial hero metric carries a page that goes flat and assembled below the fold. |
| `/recipes` | **64** | 66 | 68 | 70 | 64 | 63 | 58 | Strong editorial framing and a real signature diagram, but the centerpiece reads thin/plac |
| `/capabilities/release-gating` | **64** | 65 | 70 | 62 | 63 | 61 | 60 | A credible, well-written capability page with a genuinely substantial worked-example panel |
| `/capabilities/hallucination-scori…` | **64** | 64 | 65 | 66 | 63 | 64 | 70 | Competent, restrained capability doc with one genuinely designed transcript moment, underc |
| `/recipes/pause-for-human` | **64** | 60 | 70 | 66 | 65 | 63 | 74 | A clean, readable recipe page whose semantic console block shines, but the desktop layout  |
| `/recipes/cap-blast-radius` | **64** | 67 | 70 | 58 | 65 | 63 | 70 | Well-structured editorial recipe with a great code block and semantic badges, but monochro |
| `/transparency/pii` | **64** | 66 | 68 | 61 | 64 | 63 | 67 | A data-dense transparency page with one strong signature moment (the bar-scaled sensitivit |
| `/transparency/ai-bom` | **64** | 66 | 65 | 63 | 62 | 62 | 64 | A genuinely transparent, well-structured manifest surface let down by dense, low-contrast  |
| `/blog/stop-agent-draining-prod` | **64** | 58 | 73 | 62 | 66 | 63 | 72 | Confident editorial typography and a sharp semantic footer, but a single column pinned rig |
| `/capabilities` | **66** | 68 | 67 | 64 | 65 | 64 | 70 | A well-structured, dense capabilities catalog with a smart family taxonomy and semantic ch |
| `/console/dashboard` | **66** | 68 | 65 | 70 | 66 | 63 | 72 | A genuine signature moment — the dark operator-console chart replica — wrapped around flat |
| `/capabilities/pii-guard` | **66** | 64 | 70 | 66 | 65 | 66 | 74 | A well-structured capability page with one real signature moment (the colored REWRITE diff |
| `/capabilities/agent-memory-store` | **66** | 66 | 70 | 62 | 65 | 67 | 70 | Clean, honest capability page with one genuinely designed signature (the worked-example st |
| `/recipes/cap-token-spend` | **66** | 64 | 68 | 70 | 65 | 64 | 70 | A well-narrated, semantically colored infra recipe that reads professional — but flat tona |
| `/recipes/gate-prod-deploys` | **66** | 67 | 74 | 63 | 66 | 64 | 71 | A clean, well-typed infra recipe with one genuine signature moment (the DECISION verdict c |
| `/recipes/least-privilege-access` | **66** | 66 | 67 | 65 | 67 | 64 | 72 | Clean, well-narrated recipe page with strong mobile parity — professional docs craft, but  |
| `/transparency/command-risk` | **66** | 67 | 72 | 64 | 65 | 62 | 70 | Confident editorial voice and a real data-viz hero, but flat tonal bands and an under-fini |
| `/blog/cap-token-spend` | **66** | 68 | 65 | 67 | 67 | 64 | 70 | A clean, professional engineering long-read with strong code blocks — reads as a capable s |
| `/architecture` | **68** | 69 | 72 | 71 | 67 | 65 | 60 | Writes and structures like a real infra doc — semantic comparison band and two-tone hero s |
| `/console/audit-explorer` | **68** | 67 | 70 | 76 | 66 | 65 | 60 | The semantic decision pills + dark console card are a real signature moment, but a thin he |
| `/console/integrity` | **68** | 70 | 71 | 74 | 65 | 63 | 70 | A genuinely designed operator-console replica with real data discipline and semantic color |
| `/console/decision/6b865891a8dee91…` | **68** | 67 | 68 | 74 | 64 | 70 | 73 | A confident hero and a genuinely well-crafted decision-diff mock, undercut by a thin, coll |
| `/recipes/over-refund-clamp` | **68** | 71 | 68 | 66 | 67 | 70 | 64 | A genuinely well-structured Stripe-style recipe with a real signature diff moment, held ba |
| `/blog/launching-adjudicate` | **68** | 64 | 76 | 67 | 70 | 66 | 72 | Genuinely well-set editorial type and Stripe-grade prose, but a conservative single left c |
| `/blog/human-approval-resume` | **68** | 64 | 78 | 71 | 66 | 65 | 72 | Editorially confident, type-led blog post that reads like a real product team's engineerin |
| `/recipes/redact-pii` | **69** | 71 | 73 | 66 | 70 | 68 | 71 | A genuinely well-structured editorial recipe with a designed outcome panel and confident t |
| `/` | **70** | 73 | 74 | 78 | 70 | 71 | 58 | A genuinely strong, editorially-confident landing page with a standout semantic-color deci |
| `/deploy` | **70** | 70 | 73 | 66 | 70 | 68 | 72 | Confident, editorial infra page carried by strong terminal code blocks and semantic callou |
| `/console` | **70** | 72 | 67 | 73 | 71 | 69 | 74 | A genuinely strong route — the live console mockup is a real signature moment — but the lo |
| `/contribute` | **71** | 71 | 74 | 72 | 68 | 73 | 74 | A genuinely well-built contributor docs page — disciplined typography, semantic badges, an |
| `/architecture/data-flow` | **74** | 76 | 75 | 74 | 72 | 73 | 76 | A genuinely well-designed data-flow story — semantic color-coded outcome pills, labeled co |
