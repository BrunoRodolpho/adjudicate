/**
 * Single source of truth for global site + version metadata.
 *
 * `NavBar`, `SiteFooter` and `AnnouncementBanner` all read from here so the
 * site has exactly one place to declare what version it advertises. The kernel
 * `@adjudicate/core` is published to npm and API-stable (additive-only) at
 * v1.x; the marketing surface tracks that.
 */

import { GITHUB_REPO } from "./github";

export const SITE = {
  name: "adjudicate",
  /** Keep in sync with packages/core/package.json `version` (the published kernel). */
  coreVersion: "1.7.0",
  versionLabel: "v1",
  status: "core API-stable",
  tagline: "Guardrails for AI agents",
  releaseNotesHref: `${GITHUB_REPO}/releases`,
} as const;
