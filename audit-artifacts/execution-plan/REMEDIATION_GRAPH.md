# Remediation dependency graph

How the 8 root causes (RC-1…RC-8) and the validation harness depend on each other. The key insight: **RC-1 is the universal validation prerequisite** — you cannot *trust* an a11y/mobile/conversion re-audit while content is hidden, because axe/Lighthouse/screenshots all read blank surfaces. The *implementation* of most workstreams is independent and parallelizable; only their *verification* gates behind RC-1.

---

## The critical path

```
                       ┌─────────────────────────────────────────────┐
                       │  RC-1  Motion-gated visibility (THE BLOCKER) │
                       │  Rewrite Reveal/motion → visible-by-default  │
                       └───────────────────┬─────────────────────────┘
                                           │ unblocks trustworthy validation of everything
        ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
        ▼                  ▼               ▼               ▼                  ▼
   ┌─────────┐       ┌──────────┐    ┌──────────┐    ┌──────────┐      ┌──────────┐
   │  RC-2   │       │  RC-3    │    │  RC-5    │    │  RC-6    │      │  RC-4    │
   │ a11y    │       │ contrast │    │ responsive│   │ nav +    │      │ outcomes │
   │ prims   │       │ tokens   │    │ data      │   │ links    │      │ source   │
   └────┬────┘       └────┬─────┘    └────┬─────┘    └────┬─────┘      └────┬─────┘
        │                 │               │               │                 │
        └────────┬────────┘               │               │        ┌────────┘
                 ▼                         │               │        ▼
          (Accessibility score)            ▼               ▼   (Conversion/Design)
                 │                    (Mobile score)  (Conversion)    │
                 └──────────────┬─────────────┴───────────────┴───────┘
                                ▼
                    ┌────────────────────────┐
                    │   RC-7 layout rhythm    │  (re-measure AFTER RC-1)
                    │   RC-8 content/states   │  (polish, last)
                    └────────────┬───────────┘
                                 ▼
                    ┌────────────────────────────────┐
                    │ WS-V  Validation harness         │  (cross-cutting; every wave gates on it)
                    │ axe · Lighthouse · no-JS · links │
                    │ · contrast · mobile-overflow      │
                    └────────────────────────────────┘
```

---

## Edges (what blocks what, and why)

| From | To | Type | Reason |
|---|---|---|---|
| **RC-1** | WS-V validation | **hard prerequisite** | axe/Lighthouse/screenshots read blank pages until content renders; can't trust *any* re-score before RC-1. |
| **RC-1** | RC-5 *validation* | soft prereq | mobile-overflow checks need rendered content to measure clipping; implement in parallel, verify after RC-1. |
| **RC-1** | RC-7 *scoping* | soft prereq | most "trailing empty space" (#26,#32,#46,#58) is RC-1's blank revealed space — **re-measure after RC-1** before doing spacing work, or you'll fix phantom gaps. |
| **RC-3** | RC-4 chip unification | **shared artifact** | the one unified outcome chip must consume AA-safe tokens — do RC-3's token tier *before/with* RC-4's chip merge so the merged chip is born compliant (#41 dies here). |
| **RC-2** + **RC-3** | Accessibility score | additive | focus/dialog/landmark (RC-2) + contrast (RC-3) together move 42→70+. Neither alone clears it. |
| **RC-6** | RC-4 *CTA copy* | weak | dead-anchor cleanup (#14) and outcome-vocab (#23,#24) both touch CTA strings; sequence RC-6 link-fix and RC-4 copy in the same pass to avoid double-editing CTAs. |
| **WS-V link-integrity test** | RC-6 | enabling | the link-integrity test *is* the permanent guard that keeps RC-6 fixed; build the test as part of RC-6. |
| **RC-7/RC-8** | — | terminal | depend on everything above being measured; they're the polish tail. |

---

## Parallelizable vs serialized

**Must go first (serializes the wave):**
- **RC-1** — single highest-leverage change; everything's *validation* waits on it. Do it on day 1.

**Fully parallel after RC-1 (independent file sets, no shared edits):**
- **RC-2** (primitives: Button/Card/NavBar/Dialog/layout) ∥ **RC-5** (data surfaces: tables/diagrams) ∥ **RC-6** (nav.ts + link test).
- These touch disjoint files → assign to separate agents/worktrees concurrently.

**Parallel but coupled (sequence the shared token/chip artifact):**
- **RC-3 → RC-4**: do the AA-safe **token tier first** (RC-3), then the **chip/vocab unification** (RC-4) consuming it. Same domain (the decision-color system), so one owner, two steps — not two racing agents.

**Last (after measurement):**
- **RC-7** (rhythm — re-measure post-RC-1) → **RC-8** (content depth + system states).

**Cross-cutting, runs every wave:**
- **WS-V** validation harness — built early (its no-JS test is the RC-1 regression guard), then run as the gate at the end of each wave.

---

## Why this order maximizes score-per-effort

1. **RC-1 is one component rewrite that clears 8 of 11 Criticals and de-blanks every screenshot** → the moment it lands, the re-crawl produces *trustworthy* evidence for everything else. Highest ROI, lowest effort, must be first.
2. **RC-2 + RC-3 are ~5 primitive edits + a token-tier edit** that move the weakest axis (Accessibility 42) the furthest. They parallelize and share no files with RC-1.
3. **RC-5/RC-6/RC-4** are mid-effort, single-architectural-fix each, and independent → fan out.
4. **RC-7/RC-8** are deliberately last because their scope *shrinks* once RC-1 removes phantom whitespace and RC-4 removes copy churn — doing them first would waste effort on problems the upstream fixes erase.

> **One-line schedule:** `RC-1` → (`RC-2` ∥ `RC-3→RC-4` ∥ `RC-5` ∥ `RC-6`) → `RC-7` → `RC-8`, with `WS-V` gating each wave.
