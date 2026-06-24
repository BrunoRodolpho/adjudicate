import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";
import { FooterChips } from "@/components/ui/FooterChips";
import { FOOTER_COLUMNS, type NavLink } from "@/content/nav";
import { SITE } from "@/content/site";

/**
 * Global site footer — a dark control-room base that anchors the dark homepage
 * and reads as an intentional, premium footer under the lighter interior pages.
 * Every column comes from `content/nav.ts`. The bottom bar carries the version
 * line plus the six decision chips as a brand signature.
 *
 * Server component — no interactivity.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-console-edge bg-console-canvas">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <Reveal className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[11px] uppercase tracking-section text-console-muted">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>

        <div className="mt-12 flex flex-col gap-5 border-t border-console-edge pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-console-muted">
            <span className="font-mono text-console-ink">{SITE.name}</span>
            <span className="text-console-muted">
              {` · ${SITE.versionLabel} · ${SITE.status}`}
            </span>
          </p>
          <FooterChips />
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ link }: { readonly link: NavLink }) {
  const className =
    "rounded-sm text-sm text-console-muted transition-colors hover:text-console-ink focus-ring-console";
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}
