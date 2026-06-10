/**
 * Route-level loading state (WS-L). Most routes are statically generated so this
 * rarely shows, but it gives client transitions / dynamic segments an on-brand
 * fallback instead of a blank frame. The spinner is paused under reduced motion
 * by the globals.css reduced-motion block (animation → 0.01ms).
 */
export default function Loading() {
  return (
    <main className="grid min-h-[60vh] place-items-center bg-canvas px-6">
      <div className="flex flex-col items-center gap-4" role="status">
        <div
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-edge"
          style={{ borderTopColor: "#6366F1" }}
        />
        <p className="text-body-sm text-muted">Loading…</p>
        <span className="sr-only">Loading</span>
      </div>
    </main>
  );
}
