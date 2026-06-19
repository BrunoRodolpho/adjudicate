import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { AdjudicantShell } from "@/components/shell/AdjudicantShell";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "adjudicate · adjudicant",
  description:
    "Inspector-General observer plane (Adjudicant): a write-isolated, read-only governance console. It observes, investigates, and escalates — it never authorizes or weakens a decision.",
};

// Every page is an interactive observer surface — static generation has no value
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
          <AdjudicantShell>{children}</AdjudicantShell>
        </Providers>
      </body>
    </html>
  );
}
