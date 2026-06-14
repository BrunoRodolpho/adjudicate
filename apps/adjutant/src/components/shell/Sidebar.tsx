"use client";

import { ClipboardCheck, LayoutDashboard, ListChecks, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/proposals", label: "Proposals", icon: ListChecks },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
] as const;

/**
 * Adjutant navigation. The operator app exposes three remediation surfaces over
 * the Adjutant core: Incidents, Proposals, and the Approvals queue, plus an
 * Overview landing.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col gap-5 overflow-y-auto border-r border-edge bg-panel/40 px-3 py-4 text-xs">
      <section>
        <header className="mb-1.5 text-[10px] uppercase tracking-section text-faint">
          Navigate
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
    </aside>
  );
}
