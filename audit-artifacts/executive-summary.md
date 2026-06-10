# Executive summary — adjudicate marketing site UI/UX audit

**Method:** 58 routes crawled at desktop/tablet/mobile (232 screenshots), then 9 specialist agents (product design, UX, accessibility, design-system, mobile, heuristics, competitive) read the screenshots **and** the source to produce 60 screenshot-referenced findings. Brutally honest; assumes no existing users and no backward-compatibility constraints.

## Scorecard (0–100)

| Dimension | Score | One-line verdict |
|---|---:|---|
| **Overall UX** | **60** | Excellent hook + mental model, sabotaged by a content-visibility bug and IA/copy inconsistencies. |
| **Design** | **68** | Genuinely strong visual craft and a coherent decision-color system; held back by two-source-of-truth debt and missing focus states. |
| **Accessibility** | **42** | The weakest axis. No visible keyboard focus anywhere, decision-color/faint text fails WCAG AA, skip-link shipped but never rendered, mobile sheet isn't a dialog. |
| **Mobile** | **43** | Dense console tables clip with no scroll affordance, flagship pages render blank below the fold, long pages trail thousands of px of empty space. |
| **Conversion** | **54** | Best-in-class above-the-fold, then the body can render blank; the hero install command is visibly truncated and the outcome count contradicts itself. |
| **Product maturity** | **66** | Exceptional *breadth* (real kernel demos, console replicas, recipes, tutorials, SEO, 148 tests) but critical robustness/inclusivity gaps keep it short of production-grade. |

## The one-sentence verdict
**A visually accomplished, unusually deep OSS marketing site whose craft is undermined by a single high-severity robustness bug (content hidden until scroll) and a soft accessibility/mobile foundation — fix those three things and it jumps from "good" to "best-in-class."**

## Top 5 — do immediately (Critical)
1. **Content is invisible until JS scroll fires.** Every section below the hero (homepage, capabilities index, recipe detail, console charts, roadmap/contribute) is wrapped in a `Reveal` that initializes `opacity:0` and only paints `whileInView`. Result: blank pages for no-JS/print/crawlers and broken-looking captures. **Fix:** content visible by default; motion as a transform-only enhancement from a visible baseline. *One fix, ~7 surfaces.*
2. **No `:focus-visible` on Button / NavBar / Card.** Keyboard focus is invisible on every CTA and nav link — a WCAG 2.4.7 failure that blocks keyboard users sitewide. **Fix:** a shared focus-ring utility on the interactive primitives.
3. **Color contrast fails WCAG AA.** Decision-color text (e.g. emerald/amber) and `faint` text on the light canvas, and `faint` on the dark console, drop below 4.5:1. **Fix:** darken the body/faint tokens; use the `*-strong` decision variants for text.
4. **Hero install command is truncated** to `pnpm add @adjudicate/cor`. The #1 copy-paste action is clipped. **Fix:** widen/wrap the chip so the full command is visible (copy already works).
5. **Self-contradicting "six outcomes."** The hero subhead lists five; `/how-it-works` renames three (modify/wait/ask). **Fix:** one canonical six-name enumeration, reused verbatim everywhere.

## Nielsen heuristics — where it's weak (evidence in `screenshot-findings.md`)
- **Visibility of system status:** blank-on-scroll undermines it; the SIMULATED tail and real-kernel receipts are strong where they render.
- **Consistency & standards:** two outcome vocabularies + Tier/Live-Illustrative double taxonomy.
- **Error prevention / recovery:** dead `#playground` anchors lead nowhere; no bespoke 404/empty/error states.
- **Help & docs:** good (docs, llms.txt, FAQ, recipes). **Match-to-real-world, flexibility, minimalism:** generally good.

## Competitive benchmark
- **Better than** the median OSS dev-tool site on **breadth, real interactive proof (live kernel), and SEO/LLM discoverability** (llms.txt + JSON-LD + sitemap is ahead of most).
- **Equal to** Linear/Vercel on **above-the-fold hero craft and copy** — the fold genuinely competes.
- **Worse than** Linear/Vercel/Stripe/Clerk on **robustness (their content never depends on scroll to exist), accessibility (focus rings + contrast are table-stakes there), and mobile density handling.** Stripe/GitHub would never ship a flagship page that renders blank without JS, a truncated primary command, or keyboard-invisible focus.

## What's genuinely strong (don't regress)
- The outcome-first hero + the Risk→Fix MagicMoment + the real signed-receipt centerpiece — a differentiated, credible value story.
- The six-outcome decision-color system as a consistent visual identity.
- Live-kernel worked examples (capabilities + recipes) and the honest "illustrative replica" console boundary.
- Discoverability: `llms.txt`/`llms-full.txt`, JSON-LD (`SoftwareApplication` + `FAQPage`), 57-URL sitemap.

## Recommended sequencing
1. **Robustness + a11y foundation (1–2 days):** fix Reveal visibility, focus-visible, contrast tokens, install-chip truncation, render the SkipLink + `<main>` landmark, make the mobile sheet a real dialog. *Moves Accessibility ~42→70 and de-risks every page.*
2. **Consistency pass (½–1 day):** one outcome vocabulary, one maturity taxonomy, kill the duplicate paragraph + dead anchors, add Blog/Roadmap/Contribute to header nav.
3. **Mobile density (1–2 days):** horizontal-scroll affordances on console tables, fix AI-BOM mobile, trim trailing whitespace.

See `prioritized-roadmap.md` for the full Critical/High/Medium/Nice breakdown with effort + confidence, and `screenshot-findings.md` for all 60 findings with screenshots.
