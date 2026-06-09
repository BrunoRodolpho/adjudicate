/**
 * Typed registry of the runnable examples referenced by /deploy.
 *
 * Each entry maps to a real directory under `examples/` at the repo root.
 * `examples.test.ts` asserts every `path` below exists on disk, so a renamed
 * or removed example fails CI rather than rotting a dead link on the site.
 *
 * `path` is repo-root-relative (e.g. "examples/quickstart-anthropic").
 * `githubHref` is the canonical browse URL on the OSS mirror.
 */

import { githubTree } from "./github";

export interface ExampleEntry {
  /** Stable URL/key slug — matches the example directory name. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** Repo-root-relative path to the example directory. Verified on disk by the test. */
  readonly path: string;
  /** Canonical GitHub browse URL. */
  readonly githubHref: string;
}

/**
 * The three runnable examples that ship in the repo. Reference ONLY examples
 * that actually exist on disk — the colocated test enforces this invariant.
 */
export const EXAMPLES: ReadonlyArray<ExampleEntry> = [
  {
    slug: "quickstart-anthropic",
    title: "Quickstart · Anthropic",
    description:
      "An end-to-end demo wiring @adjudicate/anthropic to a payments Pack. One run drives Claude through all six kernel Decisions with live API calls behind them.",
    path: "examples/quickstart-anthropic",
    githubHref: githubTree("examples/quickstart-anthropic"),
  },
  {
    slug: "commerce-reference",
    title: "Commerce reference",
    description:
      "A pared-down e-commerce surface exercising cart → checkout → payment: REWRITE on quantity caps, DEFER on PIX-pending payment, auth gates, and state-aware capability planning.",
    path: "examples/commerce-reference",
    githubHref: githubTree("examples/commerce-reference"),
  },
  {
    slug: "vacation-approval",
    title: "Vacation approval",
    description:
      "A neutral hello-world approvals workflow: three intent kinds and one PolicyBundle produce all six Decision outcomes, each asserted by a test.",
    path: "examples/vacation-approval",
    githubHref: githubTree("examples/vacation-approval"),
  },
];
