/**
 * Single source of truth for the global navigation + footer link graph.
 *
 * `NavBar` and `SiteFooter` both read from here so the site has exactly one
 * place to add/rename/reorder routes. External links carry `external: true`
 * (rendered with target=_blank + rel=noreferrer); everything else is an
 * internal App Router path consumed by next/link.
 */

import { GITHUB_REPO, GITHUB_DOCS, GITHUB_LICENSE } from "./github";

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
  /** Optional one-line description for dropdown menus. */
  readonly description?: string;
}

export interface NavGroup {
  readonly label: string;
  /** Landing route for the group header itself, when one exists. */
  readonly href?: string;
  readonly items: ReadonlyArray<NavLink>;
}

export type NavEntry = NavLink | NavGroup;

/** Type guard — distinguishes a flat link from a dropdown group. */
export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/**
 * Primary header navigation. Flat links render as plain anchors; groups
 * render as dropdown menus in `NavBar`.
 */
export const PRIMARY_NAV: ReadonlyArray<NavEntry> = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Capabilities", href: "/capabilities" },
  { label: "Recipes", href: "/recipes" },
  { label: "Console", href: "/console" },
  { label: "Playground", href: "/playground" },
  {
    label: "Architecture",
    href: "/architecture",
    items: [
      {
        label: "Architecture",
        href: "/architecture",
        description: "The kernel mechanism and seven primitives.",
      },
      {
        label: "Data flow",
        href: "/architecture/data-flow",
        description: "How an intent travels from AI to side-effect.",
      },
      {
        label: "Deploy",
        href: "/deploy",
        description: "Run the kernel in your own infrastructure.",
      },
      {
        label: "Comparisons",
        href: "/comparisons",
        description: "Where six decisions beat allow/deny.",
      },
      {
        label: "Introspection",
        href: "/introspection",
        description: "Read every rule that governs your AI actions.",
      },
      {
        label: "Transparency",
        href: "/transparency",
        description: "Public trust hub — PII, AI-BOM, drift, and red-team posture.",
      },
    ],
  },
  { label: "Docs", href: GITHUB_DOCS, external: true },
];

export interface FooterColumn {
  readonly title: string;
  readonly links: ReadonlyArray<NavLink>;
}

/**
 * Footer link columns. The Trust column lists the transparency hub plus all
 * seven public sub-views — this is what de-orphans those routes from the
 * global graph.
 */
export const FOOTER_COLUMNS: ReadonlyArray<FooterColumn> = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Capabilities", href: "/capabilities" },
      { label: "Recipes", href: "/recipes" },
      { label: "Console", href: "/console" },
      { label: "Playground", href: "/playground" },
    ],
  },
  {
    title: "Architecture",
    links: [
      { label: "Architecture", href: "/architecture" },
      { label: "Data flow", href: "/architecture/data-flow" },
      { label: "Deploy", href: "/deploy" },
      { label: "Comparisons", href: "/comparisons" },
      { label: "Introspection", href: "/introspection" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Transparency", href: "/transparency" },
      { label: "PII handling", href: "/transparency/pii" },
      { label: "AI bill-of-materials", href: "/transparency/ai-bom" },
      { label: "Behavioral drift", href: "/transparency/drift" },
      { label: "Red-team defenses", href: "/transparency/red-team" },
      { label: "Command risk", href: "/transparency/command-risk" },
      { label: "Token governance", href: "/transparency/tokens" },
      { label: "Configuration integrity", href: "/transparency/integrity" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Roadmap", href: "/roadmap" },
      { label: "Contribute", href: "/contribute" },
      { label: "GitHub", href: GITHUB_REPO, external: true },
      { label: "Docs", href: GITHUB_DOCS, external: true },
      { label: "License", href: GITHUB_LICENSE, external: true },
      { label: "Blog", href: "/blog" },
    ],
  },
];

/** Header right-hand CTAs, shared by desktop bar and mobile sheet. */
export const NAV_GITHUB_HREF = GITHUB_REPO;
export const NAV_CONSOLE_HREF = "/console";
