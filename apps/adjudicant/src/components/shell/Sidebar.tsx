"use client";

import {
  Eye,
  FolderSearch,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// 111 — the observer plane opens with an Overview landing. Subsequent plans add
// read-only surfaces here: 112 Audit Explorer, 113 Investigations, 115
// Governance views. NONE of these is a write surface.
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  // 112 — the read-only Audit Explorer (browse / by-hash / integrity / chain).
  { href: "/audit", label: "Audit Explorer", icon: ScrollText },
  // 113 — the read-only Investigations / cases surface (pivot from a record into
  // its correlated session + supersession-lineage case timeline).
  { href: "/cases", label: "Investigations", icon: FolderSearch },
] as const;

/**
 * Adjudicant navigation. The OBSERVER app exposes read-only governance surfaces
 * over the admin SDK's read-only router; it has NO operator controls
 * (kill-switch toggle, replay, approve/decline) by construction.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col gap-5 overflow-y-auto border-r border-edge bg-panel/40 px-3 py-4 text-xs">
      <section>
        <header className="mb-1.5 text-[10px] uppercase tracking-section text-faint">
          Observe
        </header>
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
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
        </div>
      </section>

      <section className="mt-auto">
        <div className="flex items-center gap-1.5 rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[10px] text-faint">
          <ShieldCheck size={11} aria-hidden="true" />
          <span>read-only · write-isolated</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 px-2 text-[10px] text-faint">
          <Eye size={11} aria-hidden="true" />
          <span>observe · investigate · escalate</span>
        </div>
      </section>
    </aside>
  );
}
