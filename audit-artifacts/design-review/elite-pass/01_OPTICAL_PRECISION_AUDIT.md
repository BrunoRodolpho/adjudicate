# Optical Precision Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

I'll write the OPTICAL PRECISION AUDIT based on the grounding ledger. Let me work directly from the `optical_issues` data across all 58 routes.

## OPTICAL PRECISION AUDIT

Alignment evaluated **optically** — by perceived edge, perceived weight, and perceived center, not by DOM geometry or math. Every issue below traces to a specific route's inspected screenshots. Pixels are treated as load-bearing: subtle 1–2px misalignments are surfaced alongside gross failures.

### How to read this audit

The 232 screenshots surface four recurring classes of optical-correction debt. Most are not bugs in the CSS sense — the DOM is "correct." They are failures of *perception*: an element that is mathematically centered but reads off, an icon that is sized right but weighs wrong, an edge that aligns in the grid but not to the eye. The fix in nearly every case is a perceptual override (optical inset, nudge, weight rebalance, optical-size bump) applied on top of the mathematically-correct layout.

---

## 1. Visual vs Mathematical Centering

This is the single most pervasive optical failure across the ledger: elements centered by bounding box that read off-center because their internal mass is asymmetric. It appears in buttons, badges/pills, numerals, icons-in-pills, and whole hero cards.

### 1a. Hero cards & columns centered by box, weighted by content

- **`console`, `console_decision_...`**: The white hero card is centered by its bounding box but the **left-aligned text inside pulls the visual weight left** — the card "feels optically off-center" despite correct math. *Fix:* nudge the card container right by a few px, OR shift internal text toward optical center, OR commit to an intentional left-rail and stop centering the box.
- **`console`, `console_dashboard`, `console_audit-explorer`, `console_command-risk`**: The white header card's left edge **does not optically align with the nav wordmark above it** — a subtle column-shift. The DOM may share a container, but the perceived left rails diverge. *Fix:* establish one optical left-rail spanning nav wordmark → hero card → content column; align to the wordmark's ink edge, not its box.
- **`comparisons`**: H1 sits flush-left with **no right-side anchor**; the right two-thirds is void, so the page reads "half-rendered." *Fix:* either commit to asymmetric composition with a right-column counterweight, or optically recenter the single column.

### 1b. Numerals not optically centered in tiles/cells

- **`console_dashboard`** (worst instance, compounds across all six tiles): Stat-tile numerals are **not optically centered — the dot+label header adds top mass that pushes every numeral visually downward** within its tile. This is flagged as the route's *worst optical flaw* precisely because it repeats six times in one row. *Fix:* optical-center the numeral against the *available* space below the header, not against the full tile box — nudge each numeral up ~2–4px.
- **`console_command-risk`** (desktop & tablet): Disposition numeral cells are equal-width thirds but **"1/1/2" reads left-biased** — needs optical-centering correction per cell. *Fix:* center on perceived glyph mass, accounting for digit widths (a "1" carries less optical width than its advance).
- **`console_ai-bom`** (desktop): "REWRITTEN label is ~2x the width of BLOCKED; **large numerals appear optically left-biased in cells**." Same digit-width perception failure.

### 1c. Button labels & CTAs not baseline/center-aligned

- **`architecture_data-flow`** (desktop): "CTA headline is left-aligned while its button is right-aligned in the same row — tension unresolved." Two competing anchors on one optical line.
- **`console`** (fold): "'Open console' text and active 'Console' nav item render at near-identical weight" — current-page state and CTA conflate; no optical weight differential.
- **`recipes_cap-token-spend`** (fold): "Open console and GitHub buttons sit adjacent but have **different border radii — shapes read mismatched**." Optical shape inconsistency in a CTA pair.
- **`deploy`** (fold), **`home`** (fold): Primary CTA button and ghost link "share a horizontal axis but **text baselines do not align**." *Fix:* align optical baselines of the two label types (a filled pill and a text link cap-align differently against their boxes).

### 1d. Pills/chips/segmented controls — math-centered, weight-skewed

- **`capabilities_access-governance-pack`**, **`capabilities_command-risk-guard`**, **`capabilities_token-budget-guard`**, **`capabilities_red-team`**, **`console_audit-explorer`**: Colored dots/icons inside outcome pills "**sit high relative to label text, making each pill top-heavy**" / "badge dots sit marginally high inside each pill — not optically centered on text baseline." This is the most repeated pill-centering defect in the corpus. *Fix:* optical-center the dot against the label's x-height midpoint (not cap-height, not the pill box), nudging dots down ~1px.
- **`console_tokens`** (fold): Segmented control — "active border-radius appears **tighter than inactive**" and active pill "reads taller than inactive siblings at the same DOM height" because the **fill adds optical mass**. *Fix:* the active/filled state needs a tiny radius and/or inset correction so filled and outlined pills read as one family.
- **`architecture_data-flow`** (fold): "Active pill (filled) gains optical mass; reads taller than inactive siblings at the same DOM height." Same fill-weight illusion as a stepper.
- **`capabilities_release-gating`** (fold): Numeral '2' in the active purple step-pill "reads high due to heavier font weight — needs a **-1px optical nudge downward**." A textbook optical-centering prescription already implied by the data.
- **`capabilities_smart-approval-engine`**, **`capabilities_config-integrity-seal`**: Active stepper pill is so visually heavy (gradient fill) it "**pulls optically left due to longer label — needs ~2px extra right padding**." *Fix:* asymmetric padding on filled pills to optically center variable-length labels.

### 1e. Trailing-period optical mass (recurring micro-flaw)

A subtle but real centering problem: a sentence-terminating period at display size adds **unbalanced rightward (or, on the wrong line, leftward) optical mass** to a heading, making it feel lopsided or unanchored.

- **`console_ai-bom`** (fold): "Period on 'AI-BOM explorer.' adds leftward optical mass at display size with no right counterbalance."
- **`console_audit-explorer`** (desktop), **`console_decision_...`** (desktop): trailing period "adds right-side optical weight at display size — reads unintentional."
- **`transparency`** (fold): "Period in the hero heading protrudes optically beyond the text block edge, making the heading feel unanchored on the right."
- **`transparency_tokens`** (fold): "H1 terminal period creates a heavy dot that presses against the right edge… making the heading feel lopsided."

*Fix:* hang the period into the right margin (optical punctuation hang), reduce its weight, or remove terminal periods from display headings entirely.

---

## 2. Icon-to-Text Optical Balance & Sizing

Icons are consistently set to a *mathematical* size and *baseline* alignment that fails optically — they float high, sink low, or out-weigh / under-weigh the text they pair with.

### 2a. Icons aligned to baseline/box instead of optical center

- **`architecture_data-flow`** (desktop): "Info-banner icon sits slightly high of text baseline — the pairing is visually unresolved."
- **`console_drift`** (fold): "Traffic-light dots sit ~1-2px low relative to adjacent text cap-height — **needs upward optical nudge**."
- **`console_audit-explorer`** (fold): "Play triangle in 'REPLAY SIMULATION' sits optically low — **math centering does not compensate for right-pointing weight**." A right-pointing triangle's centroid is left of its bounding-box center; box-centering makes it read low/left. *Fix:* optical-center the triangle on its visual centroid.
- **`console_tokens`** (desktop): "Back-arrow baseline sits slightly high relative to accompanying text — arrow and label don't share one optical midline."
- **`transparency`** (fold), **`transparency_integrity`** (all viewports — flagged *worst optical flaw*): "Shield icon aligns to full line-height baseline, not cap-height midpoint — **it sinks below the heading it anchors**." *Fix:* align the icon's optical center to the heading's cap-height midpoint, not the line box.
- **`transparency_drift`** (fold/tablet): "Trend arrow icon is math-aligned to text baseline, not to its **visual center of mass** — reads as floating low."
- **`capabilities_ai-bom`** (fold): "Breadcrumb arrow glyph cap-height does not align with the vertical midpoint of the ALL-CAPS label beside it."

### 2b. Icon weight ≠ adjacent text weight (paired-unit imbalance)

- **`introspection`** (fold): "GitHub pill icon is visually heavier than its label text, creating left-side imbalance within the button."
- **`console_ai-bom`** (fold): "GitHub pill icon is bottom-heavy against the button cap-height — icon and label not visually centered as a unit."
- **`contribute`** (fold): "GitHub pill icon is top-heavy relative to label text — button feels visually unbalanced."
- **`recipes_cap-token-spend`** (desktop): "Copy button icon weight is lighter than its adjacent label, making the unit feel optically imbalanced."
- **`blog`** (multiple): "'Read post →' arrow is optically heavier than surrounding text, making the link appear unintentionally bold" — and inversely on mobile, "BACK TO HOME arrow is optically lighter than its label text." The same arrow glyph mis-weighs in both directions depending on type size.
- **`capabilities`** (fold): "Breadcrumb arrow sits optically too close to the B in BACK — needs more inter-glyph breathing."

*Fix (pattern):* match icon optical weight to label weight at each size — bump or trim stroke weight, and correct optical kerning between glyph and first letter. The arrow-weight inversion across breakpoints (`blog`) specifically demands **per-size icon weight tuning**, not a single fixed glyph.

### 2c. Icons under-sized / over-sized relative to their role (optical-size bump needed)

- **`capabilities`** (desktop): "Stacked-layers section icon at 16px recedes optically against the bold heading — clear weight mismatch." *Fix:* optical-size bump the icon up, or thicken its stroke, to hold against bold display type.
- **`contribute`** (desktop): "Stacked-layers section icon at 16px recedes optically against the bold heading."
- **`capabilities_command-risk-guard`** (fold): "Outcome pill icons read ~1px too small relative to label cap-height, leaving labels optically unanchored." *Fix:* +1px optical-size bump on pill icons.
- **`capabilities_token-budget-guard`** (fold): "Icon-bearing outcome tags have circle icons sitting slightly low, pulling label text off-center."
- **`console`**, **`console_command-risk`**, **`console_red-team`** (mobile/tablet): macOS traffic-light dots "**remain desktop-sized — at tablet/mobile they proportionally dominate**" / consume ~25% of the title bar. This is the inverse problem — icons that need a *downward* optical-size correction at small viewports but get none. *Fix:* responsive optical-size scaling for decorative chrome (or removal).
- **`deploy`** (mobile): "Arrow icon on adapter cards reads too small at mobile scale — loses affordance legibility." Affordance icons need an optical-size *floor* at mobile.
- **`capabilities`** (fold): "OPEN CAPABILITY arrow links are visually lighter than card body text — CTA disappears." Under-weighted relative to its function.

### 2d. Decorative dots that out-weigh their labels

- **`console_command-risk`** (fold): "Traffic-light dots optically heavier than adjacent monospaced label text, pulling eye to a decorative affordance."
- **`console_red-team`** (desktop): "Traffic light dots are heavier visual weight than adjacent monospace label, making the title-bar left side feel unbalanced."
- **`console_integrity`** (desktop): "Traffic-light dots are heavier than the LOCALHOST label beside them, unbalancing the mock chrome bar."

*Fix:* these dots should recede to ~50% of current optical weight (lower saturation/size) so they pair with, rather than dominate, their monospace labels — or be removed (the ledger's repeated luxury rejection).

---

## 3. Perceived-Edge vs DOM-Edge Alignment (cards, columns, code blocks)

Many elements share a DOM left/right edge but **break the optical rail** because of weight differences, padding asymmetry, or border-vs-text edge mismatch.

### 3a. Eyebrow/breadcrumb left-edge breaks from H1 (weight bleed)

A precise, repeated micro-flaw: an all-caps eyebrow and a bold H1 **share a DOM left margin but diverge optically** because the bold weight's ink "bleeds" past the box edge, making the lighter eyebrow appear inset.

- **`recipes_block-dangerous-commands`** (fold & mobile): "'GUARDRAIL RECIPE' eyebrow and title below sit at different optical left-edges due to bold-weight bleed."
- **`architecture_data-flow`** (fold): "Breadcrumb arrow pulls left of headline's perceived left edge — share a DOM origin but not a visual one."
- **`capabilities`** (desktop): "Cards left-align to content column; section header left-edge uses different margin — persistent subtle edge mismatch."
- **`capabilities_ai-bom`** (tablet): "Section header text and card grid carry mismatched left margins — optical edge mismatch apparent at a glance."
- **`console_decision_...`** (fold): "Back-nav and breadcrumb have subtle left-edge misalignment with the H1 below."
- **`transparency_pii`** (fold): "Disclaimer box left border starts optically left of the body-text column edge — perceived alignment breaks with the paragraph above."

*Fix:* optical-align to the *ink* edge. Negative-indent the bold H1 slightly (or positive-indent the eyebrow) so perceived left rails match. For bordered boxes, inset the border so the *content* — not the stroke — aligns to the text rail.

### 3b. Code blocks: DOM-aligned, optically over/under-shooting the prose rail

- **`capabilities_hallucination-scoring`** (desktop): "Highlighted purple line in code block sits flush-left, **optically reading as a deeper nesting level that isn't there**."
- **`capabilities_token-budget-guard`** (desktop): "REFUSE badge in worked example is flush with card edge; code lines indent differently — **inconsistent left margin within one card**."
- **`capabilities_ai-bom`** (desktop): "Console block's left edge overshoots the content column left rail by roughly one character-width."
- **`capabilities_access-governance-pack`** (desktop): "Console block's left edge overshoots the content column left rail by roughly one character-width."
- **`console_decision_...`** (mobile/desktop): "Rewritten payload orange border renders 1px heavier than proposed panel — unresolved visual pairing"; side-by-side JSON panels have "mismatched border saturations; diff feels asymmetric."
- **`console_red-team`** (fold): "Green bars extend nearly to panel right edge with no right-padding buffer — longest bar bleeds into the frame."
- **`console_red-team`** (desktop): "Bar chart bar origin and label text below have a subtle left-indent mismatch, creating an optical jag at the left edge."

*Fix:* code/diagram blocks need an **optical inset** so monospace ink aligns to the prose left rail (monospace advance ≠ ink position). Paired diff panels must share identical border weight/saturation or the pairing reads broken.

### 3c. Card bottom-edge & baseline-floor misalignment (uneven rows)

- **`architecture`** (desktop): "Footer cards have unequal text lengths — **bottom edges don't align**, reading as unfinished."
- **`blog`** (desktop): "Card heights vary with no baseline grid — irregular sequence has no visual logic."
- **`recipes`** (desktop — flagged *worst optical flaw*): "'OPEN RECIPE →' CTAs land at different vertical positions per card due to variable body-text length, **breaking grid-floor alignment** and preventing clean horizontal scan lines."
- **`transparency`** (all viewports — flagged *worst optical flaw*): "Four cards have inconsistent VIEW arrow vertical positions due to uneven description wrap."
- **`transparency_red-team`** (desktop): "CLEAN/REGRESSED badges sit at inconsistent vertical positions card-to-card; the divider line creates uneven optical floors."
- **`architecture_data-flow`** (desktop): "Trust Boundary cards are narrower than pipeline cards — content column width inconsistent across sections."

*Fix:* pin card CTAs/badges to a shared optical floor (flex `margin-top:auto` + min-height), so the action row scans as a clean horizontal line regardless of body length.

### 3d. Padding asymmetry (perceived box center ≠ box center)

- **`console`** (desktop): "Demo window vertical padding is unequal: more dead space below caption than above the mockup — **center of gravity shifts up**."
- **`console_decision_...`** (desktop): "JSON block… bottom reads visually larger than top" (top-aligned text in padded container).
- **`console_command-risk`** (desktop): "Terminal block left padding is roughly half the top padding — content reads lopsided inside the card."
- **`capabilities_ai-bom`** (fold): "Step-tracker card row sits optically higher than center — top padding reads tighter than bottom padding."
- **`console_ai-bom`** (fold): "Hero card left padding appears wider than right, making the headline feel left-crashed."
- **`console_integrity`** (desktop): "Header sits optically low in hero card — top padding visibly larger than bottom, making the card feel bottom-heavy."
- **`console_dashboard`** (fold): "Hero card drop shadow is asymmetric — heavier bottom/right — drawing the eye to the card edge rather than its content."

*Fix:* audit internal padding for *optical* symmetry (top often needs ~10–15% less than bottom so content reads centered), and symmetrize shadow spread.

### 3e. Divider/rule edges that overshoot or mis-relate to their headings

- **`recipes_cap-blast-radius`** (tablet): "Horizontal rules overshoot H2 headings by ~45% of column width — **the rule dominates its own heading**."
- **`architecture`** (desktop): "Section label and body copy share the same left origin — no device separates the label."
- **`capabilities_token-budget-guard`** (flagged *worst optical flaw*): "Section hairline rules sit **closer to heading text than to body copy below, inverting Gestalt proximity** and grouping incorrectly on every section break." A pure optical-spacing failure: the rule visually belongs to the wrong block.
- **`console_decision_...`** / **`transparency_drift`** (fold): divider "runs edge-to-edge, visually cutting through the icon-and-label row — unintentional optical split."

*Fix:* constrain rule width to the heading's optical measure, and re-balance the gap so the rule sits nearer the content it introduces (Gestalt proximity), not the prior block.

---

## 4. Visual-Weight Balance Across Columns & Sections

The corpus's largest *macro*-optical failure: paired or columnar elements that are structurally equal but **perceptually unequal in mass**, plus single accents that out-weigh the content they should support.

### 4a. Comparison-card pairs with mismatched weight (the `architecture` signature)

- **`architecture`** (all viewports — drives the route's low score): "Comparison cards are optically unequal: warm pink tint vs cool blue, mismatched icon and badge weights." "Right card packs **far more node labels than the left — density imbalance is perceptible** across the pair." On tablet/mobile the pair "reads as unrelated, not designed together." *Fix:* rebalance node/label count between cards, neutralize the tint differential (one card's warm tint reads heavier than the other's cool tint at equal opacity), and equalize badge/icon weights so the pair scans as a designed dyad.
- **`console_decision_...`** (all viewports): side-by-side JSON panels — "mismatched border saturations; diff feels asymmetric, not deliberately paired." Same dyad-imbalance at the panel level.

### 4b. Provenance / two-column key-value pairs — right column out-weighs left

A strikingly consistent finding across every capability/console route with a Provenance block: the **monospace right value reads heavier than the left label/ADR**, inverting label-over-value hierarchy.

- **`capabilities_command-risk-guard`**, **`capabilities_hallucination-scoring`**, **`capabilities_release-gating`**, **`capabilities_red-team`**, **`capabilities_config-integrity-seal`**, **`capabilities_ai-bom`**, **`capabilities_access-governance-pack`** (desktop): "Provenance: right card's monospace path is optically heavier than left's 'ADR-###' — unbalanced pair" / "IMPLEMENTING PACKAGE label is optically heavier than GOVERNING ADR despite identical roles."
- **`console_dashboard`** (tablet): "Monospace refusal codes are visually heavier than their subtitles — hierarchy inverts; code draws the eye before description."
- **`console_ai-bom`** (desktop): "'Signed: no' uses red color only — at small type size, **color alone is insufficient weight** for a critical signal."

*Fix:* monospace runs carry more optical mass per character than proportional text — down-weight monospace values (lighter weight or reduced size) so labels lead, OR up-weight the labels. Don't rely on color alone for critical-signal weight.

### 4c. Left-heavy / one-sided columns (empty-counterweight failures)

- **`architecture_data-flow`** (fold): "Step pill row is left-weighted: numbered circles carry more mass than label text, the row reads off-center."
- **`console_command-risk`** (desktop): "BLOCKED COMMANDS (flush-left) and 'redacted by construction' (flush-right) share no baseline — they float apart"; "'12/12 RECORDS' label does not balance the 'AUDIT EXPLORER | SIMULATED' group — toolbar row reads left-heavy."
- **`console_dashboard`** (desktop): "'657 Decisions adjudicated' has no clear alignment axis with the Top Refusals list to its right — both float in the row without anchoring."
- **`comparisons`**, **`introspection`**, **`contribute`**, **`how-it-works`**, **`roadmap`**, **`transparency_*`**: single-column content pinned to ~55–60% width leaves the right 40% as **un-counterweighted void** — "left column reads as orphaned rather than composed." This is a weight-balance failure even though it's often catalogued as a breathing-room issue: the page has no optical counter-mass on the right.

*Fix:* give left-weighted rows a right-side anchor (or recenter), and either fill or optically resolve the empty right column so the page balances horizontally.

### 4d. Single saturated accent out-weighing the primary signal (inverted weight hierarchy)

The most consequential weight failure: a **GitHub purple pill, an amber badge, or a tinted alarm card carries the heaviest optical weight on the page**, eclipsing the actual headline/CTA/data.

- **`architecture`, `blog`, `capabilities`, `home`, `deploy`, `console_*`, `transparency_*`** (pervasive): "GitHub pill is the heaviest nav element, dominating 'Open console' — CTA hierarchy is inverted." The loudest element leads off-product.
- **`console_approvals`** (flagged *biggest noise source*): "Amber warning banner is persistently the highest-contrast dominant element… outweighing the pending items it should be subordinate to."
- **`console_drift`** (desktop): "ELEVATED badge is the only warm color on a monochrome page — disproportionate pull unmatched by hierarchy above."
- **`architecture`** (fold): "Pink card tint… red warning triangle… red 'Production' badge — **three danger signals in one small card read as a visual alarm, not calibrated contrast**." (Route's *biggest noise source*.)
- **`capabilities_access-governance-pack`** (flagged *worst optical flaw*): "Six colored outcome pill icons form a **rainbow band louder than the page title, inverting reading hierarchy** at the most critical above-the-fold moment." Echoed across `capabilities_incident-response-pack`, `capabilities_command-risk-guard`, `capabilities_token-budget-guard`, `capabilities_red-team`, `playground` — the outcome-pill cluster is the corpus's most repeated weight-inversion.
- **`how-it-works`** (flagged *worst optical flaw*): "Purple punch-line is optically heavier than the H1 — **saturated violet on near-white inverts the intended hierarchy** on every viewport."
- **`introspection`** (fold): "GitHub pill icon… creating left-side imbalance"; chart accent colors out-weigh the page.

*Fix (the dominant prescription of this audit):* **rebalance accent weight down**. A saturated fill at nav scale should never out-weigh the page H1 or primary data. Convert loud pills to monochrome/single-accent-with-opacity, demote the GitHub CTA to ghost/outline, and reserve maximum optical weight for the one element that deserves it per view (the headline, the live metric, or the primary CTA). For multi-color outcome clusters, collapse to a single neutral chip — the rainbow's *combined* weight is the inversion.

### 4e. Chart/data-vis weight failures (bars, dots, lines that read as artifacts)

- **`transparency_command-risk`** (flagged *worst optical flaw*): "Credential bar renders as a ~3–8px stub… **looks like a render artifact, not data**" — no track rail means a near-zero value has no optical reference and reads broken.
- **`transparency_pii`** (flagged *worst optical flaw*): "Bar chart rows for low-volume dispositions render as isolated 4–8px square dots with no track rail — carry no relational meaning, appear as rendering artifacts."
- **`console_tokens`** (fold): "tenant-uncapped burn bar is a single-pixel sliver — reads as a rendering artifact, not intentional data encoding."
- **`console_dashboard`** (desktop/tablet): stat tiles + chart axis labels — "Y-axis labels do not optically separate from chart gridlines — labels and lines merge into background noise."
- **`introspection`** (desktop/tablet/mobile): "Scatter-plot dots are inconsistent in perceived size on a white canvas with no axis structure — reads as decoration"; collapses to "an unreadable smudge" at small sizes.
- **`console_command-risk`** (mobile), **`console_drift`** (desktop), **`console_red-team`** (tablet/mobile): charts render as **blank dark rectangles** — the ultimate weight failure (zero optical signal where the page promises data).
- **`transparency_tokens`** (flagged *worst optical flaw*): "Amber progress bar is visually detached from the 83% numeral — number, status label, and bar are three separate rows with no connector." Three representations of one value, optically unlinked.

*Fix:* every bar needs a visible track rail so near-zero values read as *data*, not breakage; give scatter dots a consistent perceived size and an axis frame; and optically bind a metric's number, label, and bar into one weighted unit.

---

## Cross-Cutting Prescriptions (ranked by frequency × impact)

1. **Optical-center filled pills, dots-in-pills, and stepper numerals** — the single most repeated micro-failure (§1d, §2a). Nudge dots down to x-height midpoint; nudge active-pill numerals up ~1px; add asymmetric padding so filled pills optically center variable-length labels.
2. **Rebalance accent weight down so no fill out-weighs the page H1/primary data** (§4d) — the highest-impact macro fix; resolves the inverted-hierarchy flaw flagged as *worst optical flaw* on `capabilities_access-governance-pack`, `how-it-works`, and as *biggest noise source* on `console_approvals` and `architecture`.
3. **Down-weight monospace values in two-column Provenance pairs** (§4b) — fixes the label-over-value inversion present on every capability/console detail route.
4. **Optical-align eyebrow→H1 to the ink edge, not the box** (§3a) — corrects the bold-weight-bleed left-rail break repeating across recipes/transparency/console routes.
5. **Pin card CTAs/badges to a shared optical floor** (§3c) — fixes the uneven-scan-line flaw that is the *worst optical flaw* on both `recipes` and `transparency`.
6. **Align icons to optical center / cap-height midpoint, not baseline; tune icon weight and size per breakpoint** (§2) — corrects the shield/arrow/triangle "floating" flaws, including `transparency_integrity`'s *worst optical flaw*.
7. **Hang display-heading terminal periods into the margin or remove them** (§1e) — small, cheap, and repeated across five console/transparency routes.
8. **Give every bar a track rail and optically bind metric number+label+bar** (§4e) — converts chart "render-artifact" reads back into legible data on the transparency routes.
