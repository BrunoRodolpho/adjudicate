"use client";

/**
 * Root error boundary (WS-L). Replaces the entire document when the root layout
 * itself throws, so it must render its own <html>/<body> and cannot rely on the
 * layout's fonts or globals.css — styles are inlined and dependency-free.
 */
export default function GlobalError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#FAFAF9",
          color: "#18181B",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "32rem" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
              Something went wrong.
            </h1>
            <p style={{ color: "#71717A", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
              A critical error interrupted the application. Reloading usually
              clears it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                borderRadius: "0.625rem",
                border: "none",
                background: "#18181B",
                color: "#fff",
                padding: "0.625rem 1.1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
