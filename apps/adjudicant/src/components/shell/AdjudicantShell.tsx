import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";

/**
 * Trimmed observer shell for the Adjudicant app. A fixed top bar, a left nav
 * sidebar, and a scrollable main landmark. NO operator-control surfaces
 * (kill-switch toggle, replay, approvals) — this is the Inspector-General plane:
 * it renders read-only governance views only.
 */
export function AdjudicantShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* First focusable element — lets keyboard users bypass nav to the main landmark. */}
      <SkipLink />
      <div className="grid h-screen grid-rows-[auto_1fr] bg-canvas text-ink">
        <header className="flex items-baseline justify-between border-b border-edge bg-panel/40 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-section text-ink">
            adjudicate · adjudicant
          </span>
          <span className="text-[10px] text-faint">
            inspector-general · read-only governance plane
          </span>
        </header>
        <div className="grid grid-cols-[180px_1fr] overflow-hidden">
          <Sidebar />
          <main
            id="main-content"
            tabIndex={-1}
            className="overflow-y-auto focus:outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
