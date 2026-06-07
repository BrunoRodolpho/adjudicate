"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/cn";

/**
 * Responsive shell body (ADR-128). Hosts the collapsible primary navigation and
 * the focusable `<main id="main-content">` landmark the skip-link targets.
 *
 * Layout:
 *   - Desktop (md+), nav open: two columns `[220px 1fr]` — identical to the
 *     pre-responsive fixed grid (the nav wrapper uses `display:contents` so the
 *     existing `<aside>` is the grid cell directly, preserving the original look).
 *   - Nav collapsed: single column, main spans full width (more room for tables).
 *   - Mobile (<md), nav open: single column; nav stacks above main.
 *
 * The toggle button is keyboard-accessible and exposes `aria-expanded` +
 * `aria-controls` against the nav container.
 */
export function ShellBody({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(true);
  return (
    <div className="grid grid-rows-[auto_1fr] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-edge px-2 py-1">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          aria-controls="primary-nav"
          aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
          className="rounded-sm p-1 text-faint transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
        >
          {navOpen ? (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <span className="text-[10px] uppercase tracking-section text-faint">
          {navOpen ? "Navigation" : "Navigation collapsed"}
        </span>
      </div>
      <div
        className={cn(
          "grid overflow-hidden",
          navOpen ? "grid-cols-1 md:grid-cols-[220px_1fr]" : "grid-cols-1",
        )}
      >
        {/* `contents` keeps the <aside> as the grid cell when open (no layout
            change); `hidden` removes it entirely when collapsed. */}
        <div id="primary-nav" className={cn(navOpen ? "contents" : "hidden")}>
          <Sidebar />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="overflow-auto focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
