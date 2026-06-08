import type { Config } from "tailwindcss";

/**
 * apps/web — marketing-site Tailwind config.
 *
 * Light/off-white canvas with vibrant accents (indigo → violet → fuchsia
 * primary, cyan → emerald flow, amber-orange DEFER band). Decision-state
 * tokens — emerald / red / orange / amber / violet / sky — are ported
 * one-to-one from `apps/console/tailwind.config.ts` so the same six
 * outcomes wear the same colours across operator and marketing surfaces.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/sections/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        // Marketing-light palette.
        canvas: "#FAFAF9",        // off-white background
        surface: "#FFFFFF",       // pure white alternating sections
        ink: "#18181B",           // zinc-900 body
        muted: "#71717A",         // zinc-500
        faint: "#A1A1AA",         // zinc-400
        edge: "#E4E4E7",          // zinc-200 borders
        // Decision tokens — same six as the console.
        execute: "#10B981",       // emerald-500
        refuse: "#EF4444",        // red-500
        rewrite: {
          DEFAULT: "#F97316",     // orange-500
          strong: "#C2410C",      // orange-700 — AA contrast for body-weight on white
        },
        defer: "#F59E0B",         // amber-500
        escalate: "#8B5CF6",      // violet-500
        confirm: "#0EA5E9",       // sky-500
        // Console dark-token namespace — used ONLY by the copied operator-console
        // design kit under components/console-kit/ so those components render
        // correctly on dark surfaces. These mirror the console's zinc-based
        // canvas/panel/edge/ink/muted/faint scale and never touch the
        // marketing-light palette above. See TASK K / ADR-128 (no shared @adjudicate/ui).
        console: {
          canvas: "rgb(9 9 11)",   // zinc-950 — outermost dark surface
          panel: "rgb(24 24 27)",  // zinc-900 — raised panels
          edge: "rgb(39 39 42)",   // zinc-800 — hairline borders
          ink: "rgb(244 244 245)", // zinc-100 — primary text
          muted: "rgb(161 161 170)", // zinc-400 — secondary text
          faint: "rgb(82 82 91)",  // zinc-600 — tertiary/label text
        },
      },
      letterSpacing: {
        section: "0.18em",
      },
      backgroundImage: {
        "gradient-primary":
          "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%)",
        "gradient-flow":
          "linear-gradient(135deg, #22D3EE 0%, #34D399 100%)",
        "gradient-defer":
          "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
