import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { AdjutantShell } from "@/components/shell/AdjutantShell";
import { Providers } from "./providers";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "adjudicate · adjutant",
  description:
    "Reference operator app for Adjutant: incidents, remediation proposals, and an approvals queue that drives full re-adjudication.",
};

// Every page is an interactive operator surface — static generation has no value
// here, so the whole app opts out of prerender via this layout-level marker.
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
          <AdjutantShell>{children}</AdjutantShell>
        </Providers>
      </body>
    </html>
  );
}
