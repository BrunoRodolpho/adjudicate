/**
 * Single source of truth for the GitHub repository the public site links to.
 *
 * The org is configurable via the `NEXT_PUBLIC_GITHUB_ORG` build-time env var
 * (inlined by Next, exactly like `NEXT_PUBLIC_SITE_URL` in `app/layout.tsx`) and
 * defaults to the canonical owner. EVERY GitHub link on the site — the nav/footer
 * link graph, capability provenance cards, primitive source links, example browse
 * URLs, the deploy adapter cards and the homepage CTA — derives from the helpers
 * below, so moving the repo to a different org is a one-line env change rather
 * than a find-and-replace across the codebase.
 */

const GITHUB_ORG = process.env.NEXT_PUBLIC_GITHUB_ORG ?? "BrunoRodolpho";

/** Repo root, no trailing slash: `https://github.com/<org>/adjudicate`. */
export const GITHUB_REPO = `https://github.com/${GITHUB_ORG}/adjudicate`;

/** `blob/main/` base (trailing slash) for linking a FILE by repo-root-relative path. */
export const GITHUB_BLOB_BASE = `${GITHUB_REPO}/blob/main/`;

/** `tree/main/` base (trailing slash) for linking a DIRECTORY by repo-root-relative path. */
export const GITHUB_TREE_BASE = `${GITHUB_REPO}/tree/main/`;

/** Build a blob (file) browse URL from a repo-root-relative path. */
export function githubBlob(path: string): string {
  return `${GITHUB_BLOB_BASE}${path}`;
}

/** Build a tree (directory) browse URL from a repo-root-relative path. */
export function githubTree(path: string): string {
  return `${GITHUB_TREE_BASE}${path}`;
}

/** Common destinations linked from the nav/footer. */
export const GITHUB_DOCS = githubTree("docs");
export const GITHUB_LICENSE = githubBlob("LICENSE");

/** Contributor onboarding destinations (CONTRIBUTING guide + curated issue queues). */
export const GITHUB_CONTRIBUTING = githubBlob("CONTRIBUTING.md");
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;
export const GITHUB_GOOD_FIRST_ISSUES = `${GITHUB_REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`;
