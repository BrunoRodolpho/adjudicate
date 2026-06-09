import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";
import { FooterChips } from "@/components/ui/FooterChips";
import { FOOTER_COLUMNS, type NavLink } from "@/content/nav";
import { SITE } from "@/content/site";

/**
 * Global site footer. Every column comes from `content/nav.ts`; the Trust
 * column lists all seven public transparency sub-views, which is what
 * de-orphans those routes from the link graph. The bottom bar carries the
 * version line plus the six decision chips as a brand signature.
 *
 * Server component — no interactivity.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-edge bg-canvas">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <Reveal className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[11px] uppercase tracking-section text-muted">
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

        <div className="mt-12 flex flex-col gap-5 border-t border-edge pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted">
            <span className="font-mono text-ink">{SITE.name}</span>
            <span className="text-faint">
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
  const className = "text-sm text-muted transition-colors hover:text-ink";
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
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
