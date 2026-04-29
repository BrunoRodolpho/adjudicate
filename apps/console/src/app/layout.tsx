import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ConsoleShell } from "@/components/shell/ConsoleShell";
import { Providers } from "./providers";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "adjudicate · console",
  description:
    "Reference operator console for the adjudicate framework. Phase 1: Audit Explorer.",
};

// The shared `<Sidebar>` uses `useSearchParams` (URL-bound filters), which
// forces every prerender path through Suspense. The console is an
// interactive operator surface — static generation has no value here, so
// every page opts out of prerender via this layout-level marker.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Providers>
          <ConsoleShell>{children}</ConsoleShell>
        </Providers>
      </body>
    </html>
  );
}
