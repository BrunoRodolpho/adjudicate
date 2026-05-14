import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "adjudicate · deterministic policy kernel for LLM-mediated actions",
  description:
    "Replay-safe adjudication, ordered policy enforcement, and forensic auditability for AI agent workflows.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "adjudicate · deterministic policy kernel for LLM-mediated actions",
    description:
      "Six structured decisions. Replay-safe ledger. Forensic AuditRecord. The kernel between the LLM and your side-effect.",
    type: "website",
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
        <Providers>{children}</Providers>
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
