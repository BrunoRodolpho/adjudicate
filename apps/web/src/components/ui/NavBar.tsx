"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Github, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import {
  PRIMARY_NAV,
  NAV_GITHUB_HREF,
  NAV_CONSOLE_HREF,
  isNavGroup,
  type NavEntry,
  type NavGroup,
  type NavLink,
} from "@/content/nav";

/** True when `pathname` is, or sits beneath, the link target. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Active when the pathname matches the group landing or any of its items. */
function isGroupActive(pathname: string, group: NavGroup): boolean {
  if (group.href && isActive(pathname, group.href)) return true;
  return group.items.some((item) => !item.external && isActive(pathname, item.href));
}

/**
 * Global sticky header. Reads every link from `content/nav.ts`. Translucent
 * with a backdrop blur; the bottom border fades in once the page scrolls.
 * Architecture renders as a hover/focus dropdown on desktop; on mobile the
 * whole graph opens in a full-screen sheet. Respects prefers-reduced-motion.
 */
export function NavBar() {
  const pathname = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile sheet whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-canvas/80 backdrop-blur transition-colors",
        scrolled ? "border-b border-edge" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-baseline gap-1.5"
          aria-label="adjudicate home"
        >
          <span className="font-mono text-sm font-medium text-ink">adjudicate</span>
          <span className="font-mono text-[11px] text-faint">v0.1</span>
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 lg:flex"
        >
          {PRIMARY_NAV.map((entry) => (
            <DesktopEntry key={entry.label} entry={entry} pathname={pathname} />
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button href={NAV_CONSOLE_HREF} variant="ghost">
            Open console
          </Button>
          <Button href={NAV_GITHUB_HREF} external>
            <Github size={16} aria-hidden="true" /> GitHub
          </Button>
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="inline-flex items-center justify-center rounded-full p-2 text-ink transition-colors hover:bg-edge lg:hidden"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>

      <MobileSheet
        open={open}
        onClose={() => setOpen(false)}
        pathname={pathname}
        reduce={reduce ?? false}
      />
    </header>
  );
}

/** A single desktop entry — either a flat link or a dropdown group. */
function DesktopEntry({
  entry,
  pathname,
}: {
  readonly entry: NavEntry;
  readonly pathname: string;
}) {
  if (isNavGroup(entry)) {
    return <DesktopDropdown group={entry} pathname={pathname} />;
  }
  const active = !entry.external && isActive(pathname, entry.href);
  const className = cn(
    "rounded-full px-3 py-2 text-sm transition-colors",
    active ? "text-ink" : "text-muted hover:text-ink",
  );
  if (entry.external) {
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {entry.label}
      </a>
    );
  }
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {entry.label}
    </Link>
  );
}

/**
 * Hover/focus dropdown for a nav group. Uses a CSS group so the panel opens
 * on pointer hover and on keyboard focus within, with no extra client state.
 */
function DesktopDropdown({
  group,
  pathname,
}: {
  readonly group: NavGroup;
  readonly pathname: string;
}) {
  const active = isGroupActive(pathname, group);
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm transition-colors",
          active ? "text-ink" : "text-muted hover:text-ink",
        )}
      >
        {group.label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="transition-transform group-hover:rotate-180"
        />
      </button>
      <div
        className="invisible absolute left-0 top-full pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <ul className="w-72 rounded-xl border border-edge bg-surface p-2 shadow-xl">
          {group.items.map((item) => (
            <li key={item.label}>
              <DropdownItem item={item} pathname={pathname} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DropdownItem({
  item,
  pathname,
}: {
  readonly item: NavLink;
  readonly pathname: string;
}) {
  const active = !item.external && isActive(pathname, item.href);
  const className = cn(
    "block rounded-lg px-3 py-2 transition-colors",
    active ? "bg-edge" : "hover:bg-edge",
  );
  const body = (
    <>
      <span className={cn("block text-sm", active ? "text-ink" : "text-ink")}>
        {item.label}
      </span>
      {item.description ? (
        <span className="mt-0.5 block text-xs text-muted">
          {item.description}
        </span>
      ) : null}
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}

/** Full-screen mobile navigation sheet. */
function MobileSheet({
  open,
  onClose,
  pathname,
  reduce,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly pathname: string;
  readonly reduce: boolean;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-canvas lg:hidden"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex h-16 items-center justify-between px-6">
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-medium text-ink">
                adjudicate
              </span>
              <span className="font-mono text-[11px] text-faint">v0.1</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="inline-flex items-center justify-center rounded-full p-2 text-ink transition-colors hover:bg-edge"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <nav
            aria-label="Mobile"
            className="flex h-[calc(100%-4rem)] flex-col gap-6 overflow-y-auto px-6 pb-10 pt-2"
          >
            <ul className="flex flex-col gap-1">
              {PRIMARY_NAV.map((entry) => (
                <li key={entry.label}>
                  {isNavGroup(entry) ? (
                    <MobileGroup group={entry} pathname={pathname} />
                  ) : (
                    <MobileLink link={entry} pathname={pathname} large />
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-3">
              <Button href={NAV_CONSOLE_HREF} variant="outline" className="justify-center">
                Open console
              </Button>
              <Button href={NAV_GITHUB_HREF} external className="justify-center">
                <Github size={16} aria-hidden="true" /> GitHub
              </Button>
            </div>
          </nav>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MobileGroup({
  group,
  pathname,
}: {
  readonly group: NavGroup;
  readonly pathname: string;
}) {
  return (
    <div className="py-2">
      <p className="px-1 py-1 text-xs uppercase tracking-section text-muted">
        {group.label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.label}>
            <MobileLink link={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileLink({
  link,
  pathname,
  large,
}: {
  readonly link: NavLink;
  readonly pathname: string;
  readonly large?: boolean;
}) {
  const active = !link.external && isActive(pathname, link.href);
  const className = cn(
    "block rounded-lg px-1 py-2 transition-colors",
    large ? "text-lg font-medium" : "text-base",
    active ? "text-ink" : "text-muted",
  );
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {link.label}
    </Link>
  );
}
