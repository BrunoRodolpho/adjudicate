import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";

/**
 * Trimmed operator shell for the Adjutant app. A fixed top bar, a left nav
 * sidebar, and a scrollable main landmark. No live-tail / emergency-control
 * surfaces — this app renders only the three remediation read/propose surfaces.
 */
export function AdjutantShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* First focusable element — lets keyboard users bypass nav to the main landmark. */}
      <SkipLink />
      <div className="grid h-screen grid-rows-[auto_1fr] bg-canvas text-ink">
        <header className="flex items-baseline justify-between border-b border-edge bg-panel/40 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-section text-ink">
            adjudicate · adjutant
          </span>
          <span className="text-[10px] text-faint">
            supervised remediation operator surface
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
