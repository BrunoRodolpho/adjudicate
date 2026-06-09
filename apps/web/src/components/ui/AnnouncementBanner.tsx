"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SITE } from "@/content/site";

/** localStorage flag — bump the suffix to re-show the banner on a new wave. */
const DISMISS_KEY = "adj-banner-v1";

/**
 * Slim, dismissible announcement strip mounted above the sticky nav. Advertises
 * that the kernel is v1 / API-frozen and links to the release notes.
 *
 * CLS-safe: the banner is laid out in normal flow above the sticky header, so
 * dismissing it removes a real element rather than collapsing reserved space
 * mid-paint. The first client paint mirrors the SSR markup (always rendered),
 * then an effect hides it if a prior dismissal is stored — no entrance
 * animation, so there is no layout shift to perceive and nothing for
 * prefers-reduced-motion to suppress.
 */
export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // Private mode / storage disabled — keep the banner visible.
    }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore — dismissal simply won't persist across reloads.
    }
  };

  return (
    <div
      role="region"
      aria-label="Site announcement"
      className="border-b border-edge bg-surface"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-x-3 gap-y-1 px-6 py-2 text-center text-xs">
        <p className="text-muted">
          <span className="font-mono text-ink">{SITE.name} core</span> is{" "}
          {SITE.versionLabel}
          <span className="hidden sm:inline">
            {" "}
            — production-ready &amp; API-frozen
          </span>
        </p>
        <a
          href={SITE.releaseNotesHref}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 font-medium text-ink",
            "underline-offset-4 hover:underline",
          )}
        >
          release notes
          <ArrowRight size={12} aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full p-1 text-muted transition-colors hover:bg-edge hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
