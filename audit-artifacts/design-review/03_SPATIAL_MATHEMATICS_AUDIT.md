# Spatial Mathematics Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually inspected by per-route reviewer agents at the Apple/Stripe/Linear/Vercel/Notion/Raycast bar. Routes inspected: 58 ; screenshots viewed: 232. Brutally honest; no sampling.

---

I'll write the Spatial Mathematics Audit grounded in the per-screenshot observations. Let me work directly from the ledger data provided — no file access needed since the JSON is the source of truth.

## Spatial Mathematics Audit

### Verdict in one line

The site has no spacing *system* — it has spacing *accidents*. Across 58 routes the same numeric ghosts recur (a ~120–280px "dead band" below hero subtitles, a 35–60% terminal void at page bottom, a 40–45% empty hero right-half) not because anyone chose those measurements, but because *nothing chose them*. The reviewers repeatedly used the word "broken," "render failure," and "did the page load?" — and they are right: when whitespace is unmodulated, the eye cannot distinguish *intended rest* from *missing content*, and the page reads as defective. This audit names the seven broken spacing classes, explains the perceptual mechanism behind each, and ends with a target rhythm system on a strict 4/8px base.

---

### Problem Class 1 — The Hero Subtitle Dead-Band (the signature defect)

This is the single most-cited spacing failure in the entire ledger, appearing on virtually every capability and recipe route. The measured gap between the hero subtitle and the tag/pill row below it:

| Route | Measured gap | Reviewer reading |
|---|---|---|
| `capabilities_release-gating` | ~280px | "reads as a layout collapse" |
| `capabilities_token-budget-guard` | ~250px | "feels unfinished rather than spacious" |
| `capabilities_behavioral-drift` | ~200px | "missing hero element never filled" |
| `capabilities_hallucination-scoring` | ~200px | "looks like a missing content block" |
| `capabilities_command-risk-guard` | ~150px | "section removed without adjusting spacing" |
| `capabilities_pii-guard` | ~150px | "content vacuum" |
| `capabilities_ai-bom` | ~140px | "forgotten padding, not intentional white space" |
| `capabilities_incident-response-pack` | ~120px | "broken-feeling void" |
| `capabilities_access-governance-pack` | ~200px | "fold feels half-empty" |
| `recipes_gate-prod-deploys` / `recipes_least-privilege` / `recipes_pause-for-human` | ~150–200px | "looks like a missing illustration" |

**Why it feels wrong (the perceptual reason):** White space communicates *grouping*. The Gestalt law of proximity says elements close together belong together; elements far apart belong to different groups. The subtitle and the metadata pills are *conceptually one unit* — the pills annotate the title. But the spacing between them (~200px) is **larger than the spacing between the entire hero block and the next section**. The eye therefore parses the pills as the *start of a new, unrelated section* — and then finds no section there. The brain registers a broken promise: a container was opened and never filled. This is why reviewers don't read it as "breathing room" — breathing room is *proportional rest between groups*, and this gap is *intra-group spacing inflated past inter-group spacing*. The hierarchy of distances is inverted. The fix is not "less space" — it is making the title→subtitle→pills gaps progressively, predictably smaller than the section gap.

---

### Problem Class 2 — Trailing/Terminal Void (the "render failure" band)

The most damaging class for *trust*. Every console route and most transparency/roadmap/recipe routes terminate in an enormous empty band before the footer:

- `console` — black void consuming **60–80%** of full-page scroll ("catastrophic," premium 22)
- `roadmap` — **~4,000px** empty on desktop, **8,149px** mobile with content only in top ~600px (premium 18, lowest in the set)
- `console_drift`, `console_tokens`, `console_red-team`, `console_command-risk` — 35–40% dead band, "looks like a render failure"
- `transparency_tokens` / `transparency_integrity` / `transparency_drift` — 40–50% blank below the last card
- `home` — hero occupies ~12% of a 13,000px canvas; remaining **85% is unbroken void**
- recipe routes (`cap-blast-radius`, `cap-token-spend`, `over-refund-clamp`, `pause-for-human`) — 60–80% blank on mobile, "indistinguishable from a JS render failure"

**Why it feels wrong:** A page's total height is itself a spatial signal — it sets an expectation of content volume. When 40–80% of that height is empty, the *scrollbar lies*: it implies substance that does not exist. Perceptually this triggers the "failed lazy-load" schema every web user now carries — we have been trained that a tall page with a blank lower half means *content is still loading or has errored*. Critically, this is distinct from Class 1: that void is a CSS `min-height`/wrapper-height defect (content height not governing container height), where Class 1 is a spacing-token defect. The roadmap and home cases prove the void is *structural* — there is genuinely no content, so no spacing system can rescue it; those pages need content, not rhythm. But the console voids (where real content exists above) are a true layout-math failure: the page container is sized to a fixed viewport multiple instead of `fit-content`.

---

### Problem Class 3 — Empty Hero Right-Half (broken implicit grid)

A two-column hero grid is implied but the right cell is never populated, on a huge swath of routes:

- `architecture` — "hero right half is entirely empty, no illustration to earn that space"
- `architecture_data-flow` — right **two-thirds** vacant; single-column content in a wide shell
- `capabilities_config-integrity-seal` — right **42%** blank, "looks like a broken two-column layout missing its right panel"
- `capabilities_smart-approval-engine` / `capabilities_agent-memory-store` / `capabilities_red-team` — right ~40–50% empty
- `deploy`, `contribute`, `playground`, `introspection`, `how-it-works`, `transparency` (all hero folds) — empty right column
- recipe routes — content uses ~40–60% width, "persistent right gutter through all prose"

**Why it feels wrong:** Symmetry and balance are pre-attentive. A centered single column reads as *intentional* (editorial). A *left-pinned* column with a wide empty right reads as *unbalanced* — the visual weight is all on one side with nothing counter-weighting it, so the composition feels like it's about to tip over. The reviewers consistently distinguish these: where content is genuinely centered (`blog`, `transparency` header) they say "intentional"; where it's left-anchored against a void they say "abandoned mid-build." The mathematical tell: there is no consistent *container max-width*. Some routes pin content at ~55% with raw viewport gutter; a real system uses a fixed measure (e.g. 640–720px) *centered*, so the gutters are equal and read as deliberate margin, not as a failed grid cell.

---

### Problem Class 4 — Inconsistent Vertical Rhythm Between Sections (flat rhythm / no scale)

Reviewers repeatedly note that *every section gets identical spacing and identical heading weight*, so major and minor sections are spatially indistinguishable:

- `capabilities_behavioral-drift` — "every section gets the same spacing... major and minor sections visually indistinguishable on scroll"
- `capabilities_ai-bom` — "every section reads at the same visual intensity; the page feels flat past the first two sections"
- `capabilities_red-team`, `incident-response-pack`, `policy-coherence-analyzer`, `smart-approval-engine` — "all H2s identical in size and weight," "uniform section spacing flattens information architecture"
- `transparency` — "WHAT THIS SHOWS / WHAT THIS DOES NOT SHOW carry equal weight," collapsing priority
- `how-it-works` — "six identical two-column frames with no rhythm variation... fatigue by frame 3"

**Why it feels wrong:** Vertical rhythm should *encode hierarchy through spacing*. A new top-level section should be preceded by more space than a sub-section; the space *is* the punctuation. When the section gap is a single constant, the page loses its "paragraph breaks" — it becomes one undifferentiated scroll, and the reader must *read* to find structure instead of *scanning* for it. The perceptual cost is that the eye has no landmarks: nothing protrudes, nothing recedes, so scanning velocity drops to reading velocity. A correct system needs at least three section-spacing tiers (sub-section / section / chapter) so that distance itself signals "you have arrived somewhere new."

---

### Problem Class 5 — Inconsistent Gutters (tag-pill soup & cluster wrap)

Horizontal spacing breaks under reflow because pill clusters have no governed flow container:

- `capabilities_access-governance-pack` — pills wrap to **3 rows** (tablet) and **4–5 rows** (mobile), "hijacking above-fold space"
- `capabilities_agent-memory-store` / `behavioral-drift` / `command-risk-guard` — "pill soup," "ragged 3-row blob with inconsistent gaps"
- `capabilities_policy-coherence-analyzer` — "tag cluster split across two rows with three distinct outline-color schemes — no visual logic," "ragged left-edge alignment"
- `capabilities_token-budget-guard` — "metadata and outcome types merge into one undifferentiated cloud"
- `recipes_pause-for-human` / `redact-pii` — "badge cluster floats with no grouping logic," ragged left edges

Separately, **inconsistent inline gutters** appear in `capabilities_ai-bom` ("inconsistent vertical gaps that feel like default margins") and `console_audit-explorer` ("HASH right-aligns while DECISION/INTENT left-align with no dividers, uneven row scanning").

**Why it feels wrong:** Two issues compound. First, the pills have *no consistent inter-pill gap* — some sit on default margins, so the rhythm between chips is irregular and the row reads as noise rather than a set. Second, and more important, the cluster mixes *two semantic categories* (metadata tags + outcome verbs) in one undelimited flow, so when it wraps, the wrap point is arbitrary and severs related items while joining unrelated ones. The eye relies on equal gutters to perceive "these are a list"; unequal gutters destroy the list-ness. The fix is a single gap token for intra-cluster spacing and a deliberate group separator (a larger gap or a divider) between the metadata group and the outcome group.

---

### Problem Class 6 — Optical-Alignment & Competing-Anchor Issues

Spacing that is *mathematically* equal but *optically* wrong, plus elements placed at distances that create competing focal anchors:

- `architecture` — "a small h1 hero and a much larger centered display headline below it... two openings, neither committing." The two headlines sit at a vertical distance that makes neither subordinate.
- `introspection` — **duplicate H1** at hero and graph section, "disorienting deja-vu scan" — identical weight at two scroll positions with no spatial demotion.
- The recurring **nav GitHub CTA vs. content** conflict (`capabilities_release-gating`, `red-team`, `command-risk`, `smart-approval-engine`, `transparency_integrity`): the purple pill is optically heavier than the H1 and sits at the top-right corner, pulling the entry-anchor *off* the content. "Splits initial eye-entry."
- `capabilities_smart-approval-engine` — "two unrelated purple elements (GitHub nav + stepper pill) compete as primary accent" at different positions with no hierarchy of distance.
- `comparisons` — "all-caps section label placed *after* the H1 looks like a new section start rather than a supporting subordinate label" — the label is too far below the H1 to read as its child.

**Why it feels wrong:** Optical alignment is about *perceived* center of mass, not bounding-box center. When two strong elements (h1 + display headline, or nav CTA + page H1) are placed without a deliberate *spatial subordination* — one clearly nearer/larger, the other clearly farther/smaller — the eye has two equally valid entry points and oscillates. The competing-anchor problem is fundamentally a spacing problem: subordination is achieved by *distance and proximity*, and here the distances are set by default margins rather than by an intentional "primary owns the top 1.5× line of space, secondary sits a controlled half-step below."

---

### Problem Class 7 — Baseline-Grid Violations & Type-Block Spacing

The body and code blocks ignore a baseline grid, producing line-length and leading faults that break vertical rhythm:

- `blog_human-approval-resume` / `blog_cap-token-spend` — body measure **~90–95 characters** (desktop), far past the 65–75ch ceiling; "leading feels tight." Long measure + tight leading means the line-to-line rhythm is too dense for the line *width*, so the eye loses its return-sweep.
- `architecture_data-flow` — "body line lengths occasionally exceed 80 chars on the wide column."
- `capabilities_token-budget-guard` (tablet) / `capabilities_agent-memory-store` (tablet) — measure pushes **80–90ch** with no `max-width` cap.
- `recipes_cap-token-spend` — body measure ~45ch on a wide viewport (the *opposite* failure — too narrow), proving there is no governed measure at all.
- Code blocks across all blog/recipe routes "share nearly identical visual weight with prose" — they are not spatially elevated (no consistent vertical padding offset), so they don't read as distinct artifacts.
- `console` metadata grids — `BOM digest hash hard-wraps mid-token`, "breaking visual rhythm" (`console_ai-bom`); `'Signed: no' floats undesigned` — values not aligned to a baseline within the grid.

**Why it feels wrong:** A baseline grid makes every line of text land on a common rhythmic increment, so prose, headings, and code-block tops all "click" into the same vertical cadence. Here, leading and block padding are set independently of any increment, so when a code block interrupts prose, the rhythm jolts. And measure (line length) is uncapped — it floats with the container — so the same body style reads at 45ch on one route and 95ch on another. Without a fixed measure, the *reading rhythm itself* changes route to route, which is why the experience feels inconsistent even where individual pages look "clean."

---

### What ties all seven together

Every defect above is the *same root cause expressed seven ways*: **there is no shared spacing token scale, no governed container max-width, and no `fit-content` page height.** Spacing is being authored ad-hoc per component with default framework margins, so:
1. intra-group gaps exceed inter-group gaps (Class 1),
2. containers don't shrink to content (Class 2),
3. there's no max-width so columns pin left (Class 3),
4. section gaps are a single constant (Class 4),
5. clusters have no gap token (Class 5),
6. subordination-by-distance is accidental (Class 6),
7. type has no baseline increment or measure cap (Class 7).

Fix the system and five of the seven classes resolve mechanically. (Classes 2 and 3 *also* need content on `roadmap`/`home`/`console` — rhythm cannot fill a genuinely empty page.)

---

### Target Rhythm System

#### Base unit
**4px** grid, with **8px** as the primary working increment. All spacing is a multiple of 4; component-internal nudges may use 4, but layout spacing (anything between components or sections) must be a multiple of 8. This kills the "default margin" drift that produces the ragged pill gaps and the random hero gaps.

#### Spacing scale (the only legal values)
```
4   8   12   16   24   32   48   64   96   128
(1) (2)  (3)  (4)  (6)  (8) (12) (16) (24) (32)  ×4px
```
- **4 / 8** — intra-component (icon↔label, pill padding)
- **12 / 16** — element-to-element inside a group (subtitle↔pills must live HERE, not at 200px)
- **24 / 32** — group-to-group within a section
- **48 / 64** — section-to-section (sub-section / section)
- **96 / 128** — chapter break (major section change), the *only* place a large gap is legal

This directly fixes Class 1 (subtitle→pills becomes 16px, not 200px) and Class 4 (three distinct section tiers: 48 sub / 64 section / 96 chapter).

#### Section-spacing scale (vertical rhythm tiers)
| Tier | Top padding | Use |
|---|---|---|
| Sub-section | **48px** | items under one heading |
| Section | **64px** | new H2 within a chapter |
| Chapter | **96px** (desktop) / **64px** (mobile) | major narrative shift |
| Hero→first section | **64px** | replaces the 120–280px void |

Section spacing must *step* — never a single constant — so distance encodes hierarchy.

#### Gutter scale (horizontal)
- **Column gutter:** 24px (mobile) → 32px (desktop)
- **Card grid gap:** 24px
- **Pill/chip intra-cluster gap:** **8px** fixed, in a single flow container; **24px** separator (or a divider) between the metadata group and the outcome-verb group so wrap never severs related items
- **Page edge padding:** 16px (mobile) / 24px (tablet) / 32px+ (desktop, beyond the centered container)

#### Container widths
| Token | Width | Use |
|---|---|---|
| `measure` (prose) | **680px** (≈68ch) | all body copy, blog/recipe text — caps the 90ch and 45ch extremes |
| `content` | **960px** | capability/console doc bodies, card grids |
| `wide` | **1200px** | hero + full-bleed feature rows |
| `full` | **1440px max**, centered | nav, footer, page frame |

All containers **centered**, so leftover space becomes *equal gutters* (intentional margin) rather than a single empty right cell — resolving Class 3. Where a hero implies two columns, either fill the right cell or drop to the centered `measure`/`content` width; never left-pin against raw viewport.

#### Two structural rules (not spacing tokens, but required)
1. **Page height = `fit-content`.** No fixed-viewport-multiple wrappers. This is the only fix for the 35–80% terminal voids on every console/transparency/recipe route (Class 2).
2. **Baseline grid = 8px;** body leading and all block (code, callout, card) vertical padding snap to 8px multiples so prose↔code transitions stay in cadence (Class 7). Body line-height 28px (3.5×8) on 16px text lands cleanly on the grid.

#### Where rhythm alone won't save the page
`roadmap` (premium 18), `home` (28), and the `console` family ship with genuinely empty content regions. The spacing system makes their *filled* regions correct, but the trailing voids there require **content**, not whitespace tuning. Spatial mathematics governs the relationship between elements that exist — it cannot manufacture the seven-primitives diagram missing on `architecture`, the empty comparison table on `comparisons`, or the un-rendered mobile cards on every `transparency_*` route.
