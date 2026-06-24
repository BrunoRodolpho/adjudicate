"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SITE } from "@/content/site";

/** localStorage flag — bump the suffix to re-show the banner on a new wave. */
const DISMISS_KEY = "adj-banner-v1";

/**
 * Slim, dismissible announcement strip mounted above the sticky nav. On the
 * dark homepage it switches to the console palette so it reads as part of the
 * control room. CLS-safe: laid out in normal flow above the sticky header.
 */
export function AnnouncementBanner() {
  // Whole site is now the dark "constitutional control room".
  const dark = true;
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
      className={cn(
        "border-b",
        dark ? "border-console-edge bg-console-panel" : "border-edge bg-surface",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-x-3 gap-y-1 px-6 py-2 text-center text-xs">
        <p className={dark ? "text-console-muted" : "text-muted"}>
          <span
            className={cn(
              "font-mono",
              dark ? "text-console-ink" : "text-ink",
            )}
          >
            {SITE.name} core
          </span>{" "}
          is {SITE.versionLabel}
          <span className="hidden sm:inline"> — production-ready &amp; API-frozen</span>
        </p>
        <a
          href={SITE.releaseNotesHref}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-sm font-medium underline-offset-4 hover:underline focus-ring",
            dark ? "text-console-ink" : "text-ink",
          )}
        >
          release notes
          <ArrowRight size={12} aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className={cn(
            "ml-auto inline-flex shrink-0 items-center justify-center rounded-full p-1 transition-colors focus-ring",
            dark
              ? "text-console-muted hover:bg-console-edge hover:text-console-ink"
              : "text-muted hover:bg-edge hover:text-ink",
          )}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
