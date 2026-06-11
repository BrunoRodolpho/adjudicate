/**
 * Single source of truth for global site + version metadata.
 *
 * `NavBar`, `SiteFooter` and `AnnouncementBanner` all read from here so the
 * site has exactly one place to declare what version it advertises. The kernel
 * `@adjudicate/core` is API-frozen at v1.x; the marketing surface tracks that.
 */

import { GITHUB_REPO } from "./github";

export const SITE = {
  name: "adjudicate",
  /** Keep in sync with packages/core/package.json `version` (the published kernel). */
  coreVersion: "1.3.0",
  versionLabel: "v1",
  status: "core API frozen",
  tagline: "Guardrails for AI agents",
  releaseNotesHref: `${GITHUB_REPO}/releases`,
} as const;
