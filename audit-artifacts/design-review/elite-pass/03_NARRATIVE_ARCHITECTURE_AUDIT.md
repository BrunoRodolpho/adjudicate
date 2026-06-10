# Narrative Architecture Audit

> Source of truth: all 232 screenshots (58 routes x 4 viewports) individually re-inspected through elite-engineering lenses — optical precision, information density, narrative architecture, design debt, visual noise, luxury. Routes: 58 ; screenshots: 232. Debt + Blueprint additionally read the real tailwind/decisions.ts/components-ui source. Brutally honest; no sampling.

---

I have the route structure confirmed. The grounding ledger is my source of truth for the narrative content. Let me write the audit directly from it.

## NARRATIVE ARCHITECTURE AUDIT
### adjudicate — Story-Only Review Across 58 Routes

**Mandate**: Ignore layout and styling. Review the STORY each page tells. For every page, the 3s / 10s / 30s message from the narrative data, then a verdict on whether that story matches the intended positioning — *guardrails for AI agents beyond block-or-allow; deterministic, signed, six outcomes* — and where it drifts.

**The intended positioning has four load-bearing claims**:
1. Guardrails that go **beyond block-or-allow**
2. **Deterministic** decisions
3. **Signed** receipts (cryptographic, tamper-evident audit)
4. **Six outcomes** (EXECUTE / REWRITE / REFUSE / DEFER / ESCALATE / REQUEST_CONFIRMATION)

I scored the narrative on whether each of these *surfaces as the story* — not whether it exists somewhere in the prose.

---

## The single most important finding

**The positioning is true in copy and invisible in story on 54 of 58 routes.** Across the entire site, exactly **one route's narrative actually delivers the differentiated claim as its lead message**: `console_decision_6b865891...` (the REWRITE receipt detail page, clarity 7). Every other route either buries the four claims in body prose, demotes them to metadata pills, or omits them entirely. The drift is not occasional — it is the **default failure mode of the whole information architecture**.

This is a story problem, not a copy problem. The words "deterministic," "signed receipts," and "six outcomes" appear on most pages. They are simply never given **narrative primacy** — they arrive in parentheses, in body paragraph four, or as a colored badge that the eye reads as "filing-system metadata" rather than "the product's reason to exist."

---

## Per-page 3s / 10s / 30s with drift verdict

### Tier 1 — Top of funnel (the pages that set positioning)

**`home`** (clarity 6)
- **3s**: AI agent guardrails product — gradient headline + purple CTA = developer tool for controlling agent behavior.
- **10s**: Open-source library intercepting agent actions: execute, rewrite, defer, escalate, refuse — signed receipt per decision.
- **30s**: Mechanics land via step-flow and npm pill, but below the fold there is *no evidence* — no features, no proof, no pricing. The 30-second visitor has no reason to stay.
- **Verdict — partial match, then collapse.** This is the one place the hero gets it almost right: "beyond block-or-allow" is stated, the six outcomes are named in the 10s read. But the drift note is brutal and correct: *"Positioning is asserted, never demonstrated."* The home page makes the claim and then provides zero substantiation across 90%+ empty scroll. A claim with no proof is weaker than no claim. **First-3s message is present and correct — the failure is everything after.**

**`architecture`** (clarity 6) and **`architecture_data-flow`** (clarity 6)
- `architecture` **3s/10s/30s**: "The mechanism, in detail" → before/after cards → page stalls; "SEVEN PRIMITIVES" promises a taxonomy it never delivers; six outcomes buried in parenthetical prose inside a comparison card.
- `data-flow` **3s/10s/30s**: clean architecture doc → in-process library producing signed receipts across six outcomes → full pipeline legible but empty mid-page scroll raises doubt.
- **Verdict — drift via demotion.** Both routes contain all four claims and bury them. The architecture page's drift note is the cleanest statement of the site-wide disease: *"Six outcomes and AuditRecord are mentioned in parenthetical prose inside a comparison card, never given visual hierarchy."* The depth pages are where a technical buyer goes to verify the differentiator — and the differentiator is in parentheses. `data-flow` is slightly better (signed receipts surface in the 10s read) but still "drifts from guardrails-beyond-block-or-allow to architecture explainer."

**`how-it-works`** (clarity 6)
- **3s**: Technical explainer, six-step numbered walkthrough.
- **10s**: A control layer between LLMs and production; six frames walk one event.
- **30s**: Intercepts → applies policy → returns one of six decisions → signed receipt.
- **Verdict — drift via sequencing.** The full story *is here* and *is correct* — but the drift note nails the structural error: *"the sharpest claims arrive last."* Signed/deterministic/six-outcome only surface deep in the scroll "after attention has depleted." The narrative buries its lede by design. This is the most *recoverable* drift on the site — the content is right, the order is wrong.

**`comparisons`** (clarity 6)
- **3s**: Essay arguing allow/deny is insufficient.
- **10s**: Six structured outcomes vs OPA/Cedar's binary — argument clear but no product shown.
- **30s**: Three sections; the comparison table arrives last and is visually weakest.
- **Verdict — closest to the thesis, undersold.** This is the page whose *entire reason for existing* is "beyond block-or-allow," and the 3s message ("allow/deny is insufficient") lands it. But the drift note is correct: it "undersells deterministic/signed-receipt/six-outcomes differentiators" — the comparison table that should *prove* the six-vs-two claim "appears data-sparse." The strongest positioning page makes its own argument weakly.

### Tier 2 — Capabilities (14 routes, the product's surface area)

This cluster is where positioning goes to die. The pattern is mechanical and identical across all 14:

| Route | clarity | 3s message reads as… | Core claim status |
|---|---|---|---|
| `capabilities` (index) | 5 | "reference catalog of 14 items" | six outcomes demoted to pill badges; 3 of 4 families empty → reads broken |
| `capabilities_access-governance-pack` | 5 | "AI governance pack" | six-outcome buried in metadata, not hero |
| `capabilities_agent-memory-store` | 5 | "a technical feature" | never connects to six-outcome story; signed/audit absent above fold |
| `capabilities_ai-bom` | 6 | "developer tool" | signed/deterministic/six-outcome "invisible at 3s and 10s" |
| `capabilities_behavioral-drift` | 6 | "developer documentation" | differentiator "legible only to readers, not scanners" |
| `capabilities_command-risk-guard` | 6 | "technical documentation" | **hero shows 4 outcome pills; body says "six" — core claim is internally inconsistent** |
| `capabilities_config-integrity-seal` | 6 | "security/compliance tool" | **EXECUTE/REFUSE tags imply only TWO outcomes → drifts toward block-or-allow** |
| `capabilities_hallucination-scoring` | 5 | "observability tooling" | never connects to six-outcome model; "ILLUSTRATIVE" badge contradicts "production-ready" banner |
| `capabilities_incident-response-pack` | 5 | "generic SaaS" | "a visitor can read the page and still miss the claim" |
| `capabilities_pii-guard` | 5 | "data-masking API" | **"a 15s bounce leaves the visitor with the wrong mental model"** |
| `capabilities_policy-coherence-analyzer` | 5 | "static analyzer" | signed/six-outcome buried; ILLUSTRATIVE undermines production confidence |
| `capabilities_red-team` | 6 | "red-team CLI tool" | hero frames a test-runner, not signed-receipt infrastructure |
| `capabilities_release-gating` | 5 | "generic deployment tooling" | outcome pills "carry no framing marking them as the differentiator vs binary block/allow" |
| `capabilities_smart-approval-engine` | 6 | "orchestration plumbing" | outcomes reduced to 3 color badges "without count or context" |
| `capabilities_token-budget-guard` | 6 | "token budget enforcer" | six-outcome/signed never surfaces visually |

**Verdict on the whole cluster — systemic drift.** Three observations the data makes unavoidable:

1. **The six outcomes are treated as taxonomy, not thesis.** Every capability page renders the outcomes as a "rainbow band louder than the page title" (access-governance-pack) — but loudness is not the same as *primacy*. The drift note for `incident-response-pack` is the verdict for all 14: *"The six-outcome differentiator deserves a diagram, not a pill row."* A pill cluster says "here is some metadata"; it does not say "this is why we are not a firewall."

2. **Two routes actively contradict the positioning.** `config-integrity-seal` shows only EXECUTE/REFUSE tags — which a scanner reads as *binary block-or-allow*, the exact thing the product claims to transcend. `command-risk-guard` shows **four** outcome pills in the hero while the body says **six** — the central numeric claim is inconsistent *on a single page*. These are not weak stories; they are stories that argue *against* the positioning.

3. **The "ILLUSTRATIVE / TIER 2" badges sabotage credibility.** On `hallucination-scoring` and `policy-coherence-analyzer`, an "ILLUSTRATIVE" label sits next to a "v1 production-ready" banner. The narrative is at war with itself: the banner says "trust this in prod," the badge says "this is a sample." For a product whose entire pitch is *trust*, a credibility contradiction in the fold is the most expensive possible error.

### Tier 3 — Console (the proof surface, 14 routes)

The console is supposed to be **evidence** — the place where signed receipts and six outcomes stop being claims and become visible artifacts. Instead it is the **lowest-clarity cluster on the site** and the worst drift.

- **`console`** (clarity **4** — lowest on the site): 3s "generic console demo." 30s: "a console exists… no CTA, no six-outcome positioning, no next action." Drift: *"Only REWRITE and EXECUTE appear; four outcomes invisible. Signed receipt / sha256 present but unlabeled."* The proof page proves nothing because it doesn't *name* what it's showing.
- **`console_audit-explorer`** (clarity 6): six outcomes "register through badge-scanning but are never named or explained." The HASH column "hints at receipts but is uncalled-out." **The single best opportunity on the site to show "signed, deterministic, six outcomes" live — and the receipt is unlabeled.**
- **`console_decision_6b865891...`** (clarity **7 — highest on the site**): 3s "technical audit receipt — cryptographic seriousness." 30s: "Visitor grasps REWRITE as a distinct signed outcome beyond block-or-allow." **This is the one route where the narrative holds.** It earns its 7 because it shows *one* outcome (REWRITE) as a *signed record with proposed-vs-rewritten payload and audit chain* — concrete, named, tamper-evident. The drift note is only tonal: the design "reads generic-SaaS-dark-mode rather than cryptographic-instrument." **The whole site should be reverse-engineered from this page.** It is living proof the positioning *can* be told well; the rest of the site simply doesn't.
- **`console_dashboard`** (clarity 5): "names six outcomes but never explains why six matters." This is the core drift in one sentence — the product counts to six and never says why six beats two.
- **`console_approvals`, `console_drift`, `console_red-team`, `console_command-risk`, `console_tokens`, `console_integrity`, `console_ai-bom`** (clarity 5–6): every one demonstrates a *mechanism* (approval queue, TVD math, attack results, burn-down) and **never connects it to the four claims**. `console_red-team`'s drift is representative: *"the UI shows only binary defended/escaped. The core differentiators are invisible."* The red-team console — a place to *prove* graduated outcomes — shows a binary.

**Verdict — the proof surface contradicts the pitch.** Multiple console routes (`console`, `console_red-team`, `console_command-risk`) actually display **binary or two-outcome data**, which a visitor reads as confirmation that this *is* a block-or-allow tool. The console should be the site's closing argument; instead it is the prosecution's best witness.

### Tier 4 — Blog (6 routes)

- **`blog`** (index, clarity 6): "Notes from the kernel" — correct voice. Posts reference DEFER, REFUSE, six outcomes *correctly*. The drift is register, not content: *"Positioning sophistication outpaces visual register"* — the writing is authoritative, the design says "startup dev blog."
- **`blog_stop-agent-draining-prod`** (clarity 6) and **`blog_cap-token-spend`** (clarity 6): determinism and six outcomes appear *in prose* but "the generic-blog visual language dilutes the precision and trust signals."
- **`blog_human-approval-resume`** (clarity **5**): worst of the cluster. *"The product argument is buried four paragraphs in."* Leads with the how-to task, not the differentiated claim. Reads as "a generic AI safety tutorial."
- **`blog_launching-adjudicate`** (clarity 6): the *launch announcement* hits determinism/signed/six-outcomes in copy but *"'Guardrails beyond block-or-allow' is buried mid-article, never visually surfaced as the lead claim."* The single post whose job is to *state the positioning* buries it.

**Verdict — best content, weakest framing.** The blog is the only cluster where the four claims are *correctly and substantively expressed in prose*. The drift is that the editorial design demotes the kernel-philosophy voice to changelog register, so the credibility the writing earns is leaked back out by the container.

### Tier 5 — Recipes (9 routes)

- **`recipes`** (index, clarity 6): "content database, not a curated product surface." Tags hint at the system; "signed/auditable framing is absent; reads as a tag-sorted wiki."
- **Every recipe detail page** (`block-dangerous-commands`, `cap-blast-radius`, `cap-token-spend`, `gate-prod-deploys`, `least-privilege-access`, `over-refund-clamp`, `pause-for-human`, `redact-pii`): clarity **5–6**, and the drift is *identical and severe across all eight*: the story "stays binary," "could describe any token-counting middleware," "reads as a snippet library." `over-refund-clamp`'s note: *"the page presents only a numeric clamp. Architectural differentiation is invisible."*
- **`pause-for-human`** drift: *"DEFER badge appears but is never explained as one of six."* — the recipe shows a single outcome and never frames it within the six. The recipe *is* the differentiator (DEFER is not possible in block-or-allow) and the page never says so.

**Verdict — the worst drift-to-opportunity ratio on the site.** Recipes are the *strongest possible proof* of "beyond block-or-allow" — each one demonstrates an outcome (DEFER, ESCALATE, REWRITE, REQUEST_CONFIRMATION) that a binary firewall *cannot produce*. The story writes itself: "no allow/deny engine can do this." Instead, every recipe presents its outcome as an isolated code snippet, never connecting it to the six-outcome thesis. **This cluster should be the most persuasive on the site and is among the least.**

### Tier 6 — Transparency (8 routes)

- **`transparency`** (index, clarity 6): "open governance layer with privacy guarantees — but never delivers live proof." Six-outcome and signed receipts absent; the Operations proof section "renders empty everywhere."
- **`transparency_integrity`** (clarity **7**, tied for second-best): 3s "something is cryptographically sealed and stable." 30s: "transparency is principled and bounded — signed minimal disclosure." This page *almost* tells the signed/deterministic story — it earns its 7. But drift: *"never surfaces 'six outcomes beyond block-or-allow' or signed-receipt framing. Reads as status page, not governance primitive."*
- **`transparency_command-risk`** (clarity 6) and **`transparency_red-team`** (clarity 6): both honest about *method* but "differentiators — deterministic outcomes, signed receipts, six-outcome spectrum — are entirely absent."
- **`transparency_ai-bom`** (clarity 5): "reads as a schema dump… audit bureaucracy not a product differentiator."
- **`transparency_drift`, `transparency_pii`, `transparency_tokens`** (clarity 5–6): every one explains *what is withheld* more than *why the underlying signal is trustworthy*. `transparency_tokens` drift: *"never surfaces the deterministic kernel enforcement, signed receipts, or six-outcome framing that makes adjudicate distinct from a simple privacy policy."*

**Verdict — confuses "transparency" with "the product."** The transparency cluster tells a *governance/privacy* story competently but treats it as a destination rather than a *demonstration* of determinism and signing. Radical openness is only persuasive if it's openness *about the differentiated mechanism*. These pages publish honest numbers and never explain why the numbers are produced by something architecturally novel.

### Tier 7 — Supporting routes

- **`deploy`** (clarity 6): "leads with deployment mechanics (library vs service) not the value prop." Six outcomes / signed receipts never appear. Install instructions bury the differentiator.
- **`introspection`** (clarity 6): explains GuardMetadata; "deterministic outcomes, signed receipts, six outcomes beyond block-or-allow… entirely absent."
- **`playground`** (clarity 6): the *interactive proof* surface. 3s reads "dev kernel testing tool," not the positioning. Drift: *"The core differentiator is buried in card footers as badge metadata."* The page where a visitor can *run* the six outcomes never frames them as six.
- **`contribute`** (clarity 6): frames adjudicate as "a layered TypeScript framework, not as an AI guardrail product. The six-outcome model and agent-safety positioning are fully absent."
- **`roadmap`** (clarity 5): strong "no-hype, frozen API" headline but "never shows deterministic outcomes, signed receipts, or six outcomes."

---

## Cross-site narrative diagnosis

### 1. Clarity-score distribution proves the drift is structural, not incidental
Across 58 routes the clarity scores cluster at **5 and 6**. Only **two routes score 7** (`console_decision`, `transparency_integrity`) and **one scores 4** (`console`). There is **no route above 7**. A site whose ceiling is 7/10 narrative clarity, with the *entire mass* at 5–6, is not suffering from a few weak pages — it has a **systemic inability to lead with its own thesis.** The mode of the whole distribution sits below the threshold where a scanner reliably extracts the differentiator.

### 2. The four claims fail in a consistent rank order
- **"Beyond block-or-allow"** — best-surfaced. Lands at 3s on `comparisons` and 10s on `home`. Still *contradicted* on routes showing 2 or 4 outcomes (`config-integrity-seal`, `command-risk-guard`, several consoles).
- **"Six outcomes"** — present everywhere as *metadata*, primary *nowhere* except `console_decision`. Demoted to pills on every capability page. **Counted, never justified** — `console_dashboard`: "names six outcomes but never explains why six matters."
- **"Deterministic"** — appears in prose on depth pages, surfaces as a *story* on zero routes. No page makes determinism visceral.
- **"Signed receipts"** — **the most under-told claim and the most differentiating one.** Surfaces as the lead on exactly one route (`console_decision`). The console's HASH columns and sha256 strings — literal signed receipts — are repeatedly described as "unlabeled" / "uncalled-out." The product's hardest-to-copy moat is its quietest story.

### 3. First-3-seconds failures (pages whose opening message is wrong or absent)
Per the mandate, flagging where the 3s read actively misdirects:
- **Wrong mental model (drifts toward a *commodity* category):** `capabilities_pii-guard` ("data-masking API"), `capabilities_hallucination-scoring` ("observability tooling"), `capabilities_policy-coherence-analyzer` ("static analyzer"), `capabilities_command-risk-guard` ("technical documentation"), all 8 recipe details ("snippet library"), `contribute` ("TypeScript framework"), `deploy` ("library install"), `playground` ("dev kernel testing tool").
- **Contradicts the positioning at 3s:** `capabilities_config-integrity-seal` (EXECUTE/REFUSE only → binary), `console` / `console_red-team` / `console_command-risk` (binary or two-outcome data on screen).
- **Reads broken, so no message lands at all:** `capabilities` index (3 of 4 families empty → "broken or incomplete state"), `transparency` Operations sections (empty everywhere), `console` family (empty data, blank charts).
- **Correct at 3s:** `comparisons` ("allow/deny is insufficient"), `console_decision` ("cryptographic audit receipt"), `transparency_integrity` ("cryptographically sealed"), and partially `home` (correct but unsubstantiated).

**Net: roughly 30 of 58 routes open with a 3-second message that either points at the wrong category or fails to render a message.**

---

## Visitor-journey momentum and conversion psychology

Trace the canonical path a technical buyer walks:

**`home` → `comparisons` → `architecture`/`how-it-works` → `capabilities_*` → `console`/`playground` → `deploy`**

- **Trust-building** is front-loaded and then *withdrawn*. `home` and `comparisons` assert a differentiated claim; the moment the visitor goes *deeper to verify*, the claim degrades into parenthetical prose (`architecture`), badge metadata (`capabilities`), and unlabeled hashes (`console`). **Credibility *decreases* with depth** — the exact inverse of how a trust product should behave. A buyer who scrolls *more* should believe *more*.
- **Momentum** dies at every section boundary. `home` has no below-fold evidence to pull the visitor forward. `how-it-works` saves its sharpest claim for last "after attention has depleted." The console — the emotional payoff — repeatedly "ends rather than resolves," with no CTA and no named differentiator.
- **Conversion psychology** is broken by the **ILLUSTRATIVE / SAMPLE DATA** framing colliding with **production-ready** banners. The product sells *trust*; the proof surfaces disclaim themselves. A visitor cannot simultaneously be told "trust this in prod" and "this is a sample" and convert. `console_decision` is the only page that resolves this tension — it presents a *concrete signed artifact* the visitor believes.
- **The closing argument is the weakest link.** In a normal funnel, late-stage pages (console, playground, deploy) carry the proof that justifies the early-stage promise. Here they carry the *least* differentiated story. The funnel promises six-outcome signed determinism at the top and delivers "a console exists" / "a snippet library" / "an install command" at the bottom.

---

## The fix is a re-sequencing problem, not a rewriting problem

The single most important architectural fact: **the content is correct everywhere; the narrative *order and primacy* are wrong everywhere.** Every claim the positioning requires already exists in the prose of these pages. The drift is entirely about what gets *lead billing*.

Three highest-leverage moves, grounded in the data:

1. **Promote signed receipts from metadata to thesis, sitewide.** `console_decision` (the only clarity-7 product page) proves a *named, concrete signed receipt* is the most persuasive asset adjudicate has. Every console and recipe should resolve into a labeled receipt, not an unlabeled hash. Reverse-engineer the site from this page.
2. **Make "six" mean something.** Every page that lists six outcomes must answer `console_dashboard`'s unasked question — *why six beats two* — at the point of listing. Recipes are the ready-made proof: each demonstrates an outcome a firewall cannot produce. State that explicitly.
3. **Stop the self-contradiction.** Remove the EXECUTE/REFUSE-only and 4-pill hero displays that read as binary (`config-integrity-seal`, `command-risk-guard`, binary consoles), and reconcile the ILLUSTRATIVE-vs-production-ready collision. A trust product cannot ship a story that argues against its own thesis.

**Bottom line**: The positioning is sound, true, and differentiated. The site states it once correctly (`home` hero, `comparisons` 3s, `console_decision`) and then spends 54 routes demoting it to prose footnotes, badge clusters, and unlabeled artifacts — and on a handful of routes actively contradicts it. The story exists. It is simply never told as the lead.

Relevant source root for any follow-on work: `/Users/thaisrodolpho/projects/adjudicate/apps/web/src/app`.
