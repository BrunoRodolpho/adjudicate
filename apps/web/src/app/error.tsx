"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary (WS-L). Replaces the bare Next default with an
 * on-system page that matches the branded 404: the decision vocabulary as a
 * wink, a retry, and a route home. Client component (required for `reset`).
 */
export default function Error({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Surface the digest for debugging; no external logging from a public page.
    if (error.digest) console.error("Page error digest:", error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-content flex-col items-center justify-center gap-6 px-6 py-section text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-refuse/40 bg-refuse/10 px-3 py-1 text-eyebrow uppercase text-refuse">
        Error · refused
      </span>
      <h1 className="text-h1 text-console-ink md:text-h1-lg">Something went wrong.</h1>
      <p className="max-w-measure text-lead text-console-muted">
        An unexpected error interrupted this page. You can retry, or head back to
        safe ground.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="focus-ring-console rounded-lg border border-console-edge bg-console-panel px-4 py-2.5 text-sm font-medium text-console-ink transition-colors hover:bg-console-canvas"
        >
          Try again
        </button>
        <Button href="/" variant="primary">
          Back to home
        </Button>
      </div>
    </main>
  );
}
