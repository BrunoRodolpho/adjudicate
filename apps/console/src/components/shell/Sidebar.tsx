"use client";

import { ListFilter, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Taint } from "@adjudicate/core";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { decisionTheme, DECISION_KIND_ORDER } from "@/lib/decision-theme";
import { cn } from "@/lib/cn";

const TAINT_LEVELS: readonly Taint[] = ["SYSTEM", "TRUSTED", "UNTRUSTED"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Audit Explorer", icon: ListFilter },
  { href: "/control", label: "Control", icon: ShieldAlert },
] as const;

/**
 * Sidebar.
 *
 * Two regions:
 *   1. NAV (always visible)         — primary navigation between pages
 *   2. FILTERS (only on `/`)        — audit-explorer filters bound to URL
 *
 * Filters are URL-bound via `useUrlFilters` and single-select per group
 * in Phase 1. Multi-select arrives when the wire schema supports array-
 * typed filter inputs.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { filters, setFilter, clearAll, hasActiveFilters } = useUrlFilters();
  const showFilters = pathname === "/";

  return (
    <aside className="flex flex-col gap-5 overflow-y-auto border-r border-edge bg-panel/40 px-3 py-4 text-xs">
      <FilterGroup label="Navigate">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-1.5 py-1 transition-colors",
                active
                  ? "bg-edge text-ink"
                  : "text-muted hover:bg-edge/40 hover:text-ink",
              )}
            >
              <Icon size={11} className="text-faint" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </FilterGroup>

      {showFilters ? (
        <>
          <FilterGroup label="Decision Kind">
            {DECISION_KIND_ORDER.map((kind) => {
              const t = decisionTheme[kind];
              const active = filters.decisionKind === kind;
              return (
                <FilterButton
                  key={kind}
                  active={active}
                  onClick={() =>
                    setFilter("decisionKind", active ? undefined : kind)
                  }
                >
                  <span
                    aria-hidden
                    className={cn("h-1.5 w-1.5 rounded-full", t.dot)}
                  />
                  <span className={t.fg}>{t.label}</span>
                  <span className="ml-auto text-[10px] text-faint">
                    {t.summary}
                  </span>
                </FilterButton>
              );
            })}
          </FilterGroup>

          <FilterGroup label="Taint">
            {TAINT_LEVELS.map((t) => {
              const active = filters.taint === t;
              return (
                <FilterButton
                  key={t}
                  active={active}
                  onClick={() => setFilter("taint", active ? undefined : t)}
                >
                  <span>{t}</span>
                </FilterButton>
              );
            })}
          </FilterGroup>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 self-start rounded-sm border border-edge bg-canvas px-2 py-1 text-[10px] uppercase tracking-wider text-muted hover:border-ink/30 hover:text-ink"
            >
              <X size={10} /> Clear filters
            </button>
          ) : null}

          <p className="text-[10px] text-faint">
            Single-select per group in Phase 1. Multi-select arrives with the
            wire schema upgrade.
          </p>
        </>
      ) : null}
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-1.5 text-[10px] uppercase tracking-section text-faint">
        {label}
      </header>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors",
        active
          ? "bg-edge text-ink"
          : "text-muted hover:bg-edge/40 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
