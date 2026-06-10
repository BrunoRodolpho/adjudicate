# Route inventory — `apps/web` (adjudicate marketing site)

Discovered via `content/nav.ts` (header + footer graph), `app/sitemap.ts`, the App-Router tree under `apps/web/src/app/`, and the registries (`content/capabilities.ts`, `content/recipes.ts`, `content/blog.ts`). Served on **http://localhost:5181**. The operator console (`apps/console`, port 5180) is a separate app and out of scope for this marketing-site audit (it is *represented* on the web via the `/console/*` illustrative replicas).

## How it was launched
- **Startup:** Playwright `webServer` (in `playwright.config.ts`) runs `pnpm --filter @adjudicate/web dev` → http://localhost:5181 (and `pnpm --filter @adjudicate/console dev` → :5180). Reliable boot; reused locally. The crawl spec (`e2e/audit-crawl.spec.ts`) drives it.
- **Build (prod):** `pnpm --filter @adjudicate/web build` (Next 15 App Router; 56 routes prerendered) then `pnpm --filter @adjudicate/web start`.
- **APIs:** server routes `/api/playground/{adjudicate,policy,outcome-distribution}` run the **real kernel** server-side (no external DB needed; `apps/web` holds no DB/Redis credentials by design).

## Top-level (15)
| Route | Type | Purpose |
|---|---|---|
| `/` | static | Homepage — outcome-first hero, MagicMoment (Risk→Fix), 4-step spine, OutcomesBento, recipes teaser, who/positioning/proof, FAQ, CTA |
| `/how-it-works` | static | Mechanism walkthrough (Remotion film) + ReceiptMaterialize loop |
| `/deploy` | static | Deployment story (library/in-process; Postgres optional; hosted=roadmap) |
| `/playground` | static (client) | Guided + Sandbox — runs the real kernel |
| `/capabilities` | static | Index of all 14 capabilities, grouped into 4 families |
| `/console` | static | Console-replica gallery hub (10 replicas) + ConsoleTailLoop video |
| `/architecture` | static | Problem + primitives diagram + links to data-flow/deploy |
| `/architecture/data-flow` | static | Kernel→Postgres→AuditEventBus→console diagram + trust-boundary panel |
| `/comparisons` | static | vs OPA/Cedar (DecisionsGrid + WedgeTable) |
| `/introspection` | static | GuardMetadata force-graph + console preview |
| `/transparency` | static | Public "governance in the open" trust index (aggregates-only) |
| `/blog` | static | Blog index (4 posts) |
| `/roadmap` | static | Honest public roadmap (v1 shipped/frozen + post-v1 waves) |
| `/contribute` | static | Contributor onboarding (L1–L5 architecture, get-started) |
| `/recipes` | static | Guardrail Recipes index (8 solution-SEO patterns) |

## Console replicas (`/console/*`, 10 — all illustrative, ConsoleChrome-labelled)
`/console/audit-explorer` (simulated live tail) · `/console/dashboard` · `/console/drift` · `/console/red-team` · `/console/ai-bom` · `/console/integrity` · `/console/tokens` · `/console/approvals` · `/console/command-risk` · `/console/decision/[intentHash]` (SSG over 12 sample records)

## Capabilities (`/capabilities/[slug]`, 14 — SSG)
**Content & data safety:** pii-guard · hallucination-scoring · ai-bom — **Adversarial & behavioral:** red-team · behavioral-drift · command-risk-guard — **Budget & integrity:** token-budget-guard · config-integrity-seal · policy-coherence-analyzer — **Workflow & governance:** smart-approval-engine · agent-memory-store · incident-response-pack · access-governance-pack · release-gating

## Recipes (`/recipes/[slug]`, 8 — SSG; 6 live-kernel, 2 illustrative)
over-refund-clamp · block-dangerous-commands · redact-pii · cap-token-spend · pause-for-human · gate-prod-deploys · least-privilege-access (illustrative) · cap-blast-radius (illustrative)

## Transparency (`/transparency/*`, 7 — aggregates-only public projections)
pii · ai-bom · drift · red-team · command-risk · tokens · integrity

## Blog (`/blog/[slug]`, 4 — SSG)
launching-adjudicate · stop-agent-draining-prod · human-approval-resume · cap-token-spend

## Forms / interactive surfaces
- **Playground** (`/playground`): Guided (scenario cards → step runner) + Sandbox (schema-aware form, raw-JSON expert toggle) — POSTs `/api/playground/adjudicate`.
- **Console audit-explorer**: "Play simulation" toggle (scripted SIMULATED tail).
- **Console ai-bom / approvals / drift / tokens / red-team / integrity / command-risk**: client-interactive (pack-select / tabs / filters / run-select / seal-select).
- **Capabilities/recipes**: live-kernel worked examples render at build time.

## Global chrome
- **AnnouncementBanner** (dismissible, localStorage) → NavBar (sticky, mega-menu) → page → SiteFooter (4 columns + decision-chip signature).
- **No auth, no signup, no settings/billing** — this is a pre-auth open-source marketing site (the "product" is the npm packages + the OSS console).

## Notable absences (by design, but audit-relevant)
- No 404/empty/loading/error-state pages were authored as bespoke screens (Next default `not-found` + route shells). Worth auditing the default states.
- No search, no dark-mode toggle (marketing is light; console replicas are dark bands).
