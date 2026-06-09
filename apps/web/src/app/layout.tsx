import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "./providers";
import { AnnouncementBanner } from "@/components/ui/AnnouncementBanner";
import { NavBar } from "@/components/ui/NavBar";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SITE } from "@/content/site";
import { GITHUB_REPO } from "@/content/github";
import "./globals.css";

/** Absolute origin the site is served from — also the JSON-LD canonical URL. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5181";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "adjudicate · a decision kernel for AI actions",
  description:
    "A decision kernel for AI actions — a control layer between AI intent and system execution. Six possible decisions, every one auditable.",
  keywords: [
    "AI agent guardrails",
    "LLM tool-call policy",
    "AI agent control layer",
    "human-in-the-loop AI",
    "deterministic AI gates",
    "LLM action governance",
    "AI agent audit log",
    "prevent LLM API abuse",
  ],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "adjudicate · a decision kernel for AI actions",
    description:
      "A control layer between AI intent and system execution. It decides whether AI actions should execute, change, wait, escalate, or stop.",
    type: "website",
    images: [{ url: "/og-homepage.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-homepage.png"],
  },
};

/**
 * Schema.org structured data describing the project as an open-source
 * developer tool. `softwareVersion` tracks the published kernel
 * (`@adjudicate/core`) via `SITE.coreVersion`; `url` mirrors `metadataBase`.
 * Emitted as a single JSON-LD graph so the SoftwareApplication and its
 * publishing Organization are linked by `@id`.
 */
const ORG_ID = `${SITE_URL}#organization`;
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#software`,
      name: "adjudicate",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      softwareVersion: SITE.coreVersion,
      description:
        "Guardrails for AI agents — a deterministic control layer between LLM tool-calls and execution. Every AI action is adjudicated to one of six outcomes (execute, refuse, rewrite, defer, escalate, request-confirmation) with a signed audit receipt.",
      offers: {
        "@type": "Offer",
        price: 0,
        priceCurrency: "USD",
      },
      isAccessibleForFree: true,
      license: `${GITHUB_REPO}/blob/main/LICENSE`,
      author: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
    },
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "adjudicate",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      sameAs: [GITHUB_REPO],
    },
  ],
};

/**
 * Root layout for the marketing site. Uses CSS variables to load Geist Sans
 * and JetBrains Mono via Tailwind's `var(--font-sans)` / `var(--font-mono)`
 * tokens. The Plausible script tag renders only when the env var is set —
 * dev and forks don't beacon by default.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
          }
        `}</style>
      </head>
      <body>
        <Script
          id="adjudicate-jsonld"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <AnnouncementBanner />
        <NavBar />
        <Providers>{children}</Providers>
        <SiteFooter />
        {plausibleDomain ? (
          <Script
            strategy="afterInteractive"
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        ) : null}
      </body>
    </html>
  );
}
