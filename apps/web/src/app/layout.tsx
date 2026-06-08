import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "./providers";
import { NavBar } from "@/components/ui/NavBar";
import { SiteFooter } from "@/components/ui/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5181",
  ),
  title: "adjudicate · a decision kernel for AI actions",
  description:
    "A decision kernel for AI actions — a control layer between AI intent and system execution. Six possible decisions, every one auditable.",
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
