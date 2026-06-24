"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Github, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE_OUT } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SITE } from "@/content/site";
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
 * On the dark homepage (`/`) it switches to a dark-glass treatment so it reads
 * over the constitutional control room. Respects prefers-reduced-motion.
 */
export function NavBar() {
  const pathname = usePathname() ?? "/";
  // Whole site is now the dark "constitutional control room".
  const dark = true;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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

  return (
    <header
      className={cn(
        "sticky top-0 z-50 backdrop-blur transition-colors",
        dark ? "bg-console-canvas/80" : "bg-canvas/80",
        scrolled
          ? dark
            ? "border-b border-console-edge"
            : "border-b border-edge"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-baseline gap-1.5"
          aria-label="adjudicate home"
        >
          <span
            className={cn(
              "font-mono text-sm font-medium tracking-tight",
              dark ? "text-console-ink" : "text-ink",
            )}
          >
            adjudicate
          </span>
          <span
            className={cn(
              "rounded-sm border px-1 py-px font-mono text-[10px] uppercase tracking-section",
              dark
                ? "border-console-edge text-console-muted"
                : "border-edge text-muted",
            )}
          >
            {SITE.versionLabel}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {PRIMARY_NAV.map((entry) => (
            <DesktopEntry
              key={entry.label}
              entry={entry}
              pathname={pathname}
              dark={dark}
            />
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            href={NAV_CONSOLE_HREF}
            variant="ghost"
            className={
              dark
                ? "text-console-muted hover:bg-console-edge/60 hover:text-console-ink"
                : undefined
            }
          >
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
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 transition-colors focus-ring lg:hidden",
            dark
              ? "text-console-ink hover:bg-console-edge"
              : "text-ink hover:bg-edge",
          )}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>

      <MobileSheet
        open={open}
        onClose={() => setOpen(false)}
        pathname={pathname}
        dark={dark}
      />
    </header>
  );
}

/** A single desktop entry — either a flat link or a dropdown group. */
function DesktopEntry({
  entry,
  pathname,
  dark,
}: {
  readonly entry: NavEntry;
  readonly pathname: string;
  readonly dark: boolean;
}) {
  if (isNavGroup(entry)) {
    return <DesktopDropdown group={entry} pathname={pathname} dark={dark} />;
  }
  const active = !entry.external && isActive(pathname, entry.href);
  const className = cn(
    "whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors focus-ring",
    dark
      ? active
        ? "text-console-ink"
        : "text-console-muted hover:text-console-ink"
      : active
        ? "text-ink"
        : "text-muted hover:text-ink",
  );
  if (entry.external) {
    return (
      <a href={entry.href} target="_blank" rel="noreferrer" className={className}>
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
 * Hover/focus dropdown for a nav group (desktop). Controlled rather than
 * pure-CSS so it closes on navigation, Escape, and focus leaving the subtree.
 */
function DesktopDropdown({
  group,
  pathname,
  dark,
}: {
  readonly group: NavGroup;
  readonly pathname: string;
  readonly dark: boolean;
}) {
  const active = isGroupActive(pathname, group);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors focus-ring",
          dark
            ? active
              ? "text-console-ink"
              : "text-console-muted hover:text-console-ink"
            : active
              ? "text-ink"
              : "text-muted hover:text-ink",
        )}
      >
        {group.label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="absolute left-0 top-full pt-2"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            <ul
              className={cn(
                "w-72 rounded-xl border p-2 shadow-xl",
                dark
                  ? "border-console-edge bg-console-panel"
                  : "border-edge bg-surface",
              )}
              onClick={() => setOpen(false)}
            >
              {group.items.map((item) => (
                <li key={item.label}>
                  <DropdownItem item={item} pathname={pathname} dark={dark} />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DropdownItem({
  item,
  pathname,
  dark,
}: {
  readonly item: NavLink;
  readonly pathname: string;
  readonly dark: boolean;
}) {
  const active = !item.external && isActive(pathname, item.href);
  const className = cn(
    "block rounded-lg px-3 py-2 transition-colors focus-ring",
    dark
      ? active
        ? "bg-console-edge"
        : "hover:bg-console-edge"
      : active
        ? "bg-edge"
        : "hover:bg-edge",
  );
  const body = (
    <>
      <span
        className={cn("block text-sm", dark ? "text-console-ink" : "text-ink")}
      >
        {item.label}
      </span>
      {item.description ? (
        <span
          className={cn(
            "mt-0.5 block text-xs",
            dark ? "text-console-muted" : "text-muted",
          )}
        >
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

/** Full-screen mobile navigation sheet — an accessible Dialog. */
function MobileSheet({
  open,
  onClose,
  pathname,
  dark,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly pathname: string;
  readonly dark: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label="Site navigation"
      className={cn("lg:hidden", dark ? "bg-console-canvas" : "bg-canvas")}
    >
      <div className="flex h-16 items-center justify-between px-6">
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-mono text-sm font-medium",
              dark ? "text-console-ink" : "text-ink",
            )}
          >
            adjudicate
          </span>
          <span
            className={cn(
              "font-mono text-[11px]",
              dark ? "text-console-muted" : "text-muted",
            )}
          >
            {SITE.versionLabel}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 transition-colors focus-ring",
            dark
              ? "text-console-ink hover:bg-console-edge"
              : "text-ink hover:bg-edge",
          )}
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
                <MobileGroup group={entry} pathname={pathname} dark={dark} />
              ) : (
                <MobileLink link={entry} pathname={pathname} dark={dark} large />
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-3">
          <Button
            href={NAV_CONSOLE_HREF}
            variant="outline"
            className="justify-center"
          >
            Open console
          </Button>
          <Button
            href={NAV_GITHUB_HREF}
            external
            className="justify-center"
          >
            <Github size={16} aria-hidden="true" /> GitHub
          </Button>
        </div>
      </nav>
    </Dialog>
  );
}

function MobileGroup({
  group,
  pathname,
  dark,
}: {
  readonly group: NavGroup;
  readonly pathname: string;
  readonly dark: boolean;
}) {
  return (
    <div className="py-2">
      <p
        className={cn(
          "px-1 py-1 text-xs uppercase tracking-section",
          dark ? "text-console-muted" : "text-muted",
        )}
      >
        {group.label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.label}>
            <MobileLink link={item} pathname={pathname} dark={dark} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileLink({
  link,
  pathname,
  dark,
  large,
}: {
  readonly link: NavLink;
  readonly pathname: string;
  readonly dark: boolean;
  readonly large?: boolean;
}) {
  const active = !link.external && isActive(pathname, link.href);
  const className = cn(
    "block rounded-lg px-1 py-2 transition-colors focus-ring",
    large ? "text-lg font-medium" : "text-base",
    dark
      ? active
        ? "text-console-ink"
        : "text-console-muted"
      : active
        ? "text-ink"
        : "text-muted",
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
