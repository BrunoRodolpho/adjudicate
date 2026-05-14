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
        rewrite: "#F97316",       // orange-500
        defer: "#F59E0B",         // amber-500
        escalate: "#8B5CF6",      // violet-500
        confirm: "#0EA5E9",       // sky-500
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
