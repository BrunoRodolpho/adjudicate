# Sitemap — adjudicate marketing site (`apps/web`, :5181)

```
/                                  Homepage (hero → MagicMoment → 4-step spine → bento → recipes teaser → who/positioning/proof → get-started → FAQ → CTA)
├── /how-it-works                  Mechanism walkthrough + receipt-materialize film
├── /playground                    Guided + Sandbox (real kernel)
│
├── Product
│   ├── /capabilities              Index (4 families)
│   │   └── /capabilities/[slug]   14 deep-dives (pii-guard … access-governance-pack)
│   ├── /recipes                   Guardrail Recipes index (8)
│   │   └── /recipes/[slug]        over-refund-clamp … cap-blast-radius
│   └── /console                   Replica gallery hub
│       ├── /console/audit-explorer       (SIMULATED live tail)
│       ├── /console/dashboard            (outcome distribution)
│       ├── /console/drift /red-team /ai-bom /integrity /tokens /approvals /command-risk
│       └── /console/decision/[hash]      (receipt detail, 12 sample records)
│
├── Architecture
│   ├── /architecture              Problem + primitives
│   ├── /architecture/data-flow    kernel→Postgres→Redis→console diagram + trust panel
│   ├── /comparisons               vs OPA/Cedar
│   ├── /introspection             guard-metadata graph + console preview
│   └── /deploy                    library/in-process; self-host; hosted=roadmap
│
├── Trust
│   ├── /transparency              Governance-in-the-open index (aggregates-only)
│   └── /transparency/{pii,ai-bom,drift,red-team,command-risk,tokens,integrity}
│
├── Content & community
│   ├── /blog                      Index (4 posts)
│   │   └── /blog/[slug]           launching-adjudicate, stop-agent-draining-prod, human-approval-resume, cap-token-spend
│   ├── /roadmap                   Public roadmap
│   └── /contribute                Contributor onboarding
│
└── Machine-readable / SEO
    ├── /sitemap.xml               57 URLs (generated from registries)
    ├── /robots.txt                allow-all + sitemap ref
    ├── /llms.txt + /llms-full.txt llms.txt convention
    └── JSON-LD                    SoftwareApplication + Organization (layout) + FAQPage (homepage)

Global chrome (every page): AnnouncementBanner (v1, dismissible) · sticky NavBar (How it works · Capabilities · Recipes · Console · Playground · Architecture▾ · Docs · Open console · GitHub) · SiteFooter (Product / Architecture / Trust / Project + 6 decision-chip signature).
```

**Navigation depth:** every route is reachable within 2 clicks from `/` (header nav + footer). No orphans (round-1 fixed the previously-orphaned `/transparency`).
