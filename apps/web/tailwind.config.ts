import type { Config } from "tailwindcss";

/**
 * apps/web — marketing-site Tailwind config.
 *
 * Design-system v2 (Round 3). The token layer now carries the four scales it
 * was missing — a modular `fontSize` ramp, an explicit `borderRadius` scale, a
 * soft warm-tinted `boxShadow` ramp, and named `spacing` rhythm tokens — plus
 * an AA-verified neutral ramp and a `.strong` text variant for every decision
 * colour. Authors consume tokens, never raw guesses, so 58 routes stop drifting.
 * Grounded in audit-artifacts/design-review/elite-pass/08_WORLD_CLASS_BLUEPRINT.md.
 *
 * Decision-state tokens — emerald / red / orange / amber / violet / sky — are
 * ported one-to-one from `apps/console/tailwind.config.ts` so the same six
 * outcomes wear the same colours across operator and marketing surfaces.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/sections/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    // content modules declare Tailwind class strings (decision accents, badge
    // tones, etc.) — they must be scanned or those classes get purged.
    "./src/content/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },

      // ── Modular type scale (1.25 major-third), snapped to clean px. Each
      //    layer pairs size with line-height + tracking. `-lg` keys are the
      //    desktop step (use via `md:text-*-lg`); base keys are mobile-first.
      fontSize: {
        display: ["3.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }], // 60
        "display-lg": ["4.5rem", { lineHeight: "1.04", letterSpacing: "-0.02em", fontWeight: "600" }], // 72
        h1: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.015em", fontWeight: "600" }], // 36
        "h1-lg": ["3rem", { lineHeight: "1.08", letterSpacing: "-0.015em", fontWeight: "600" }], // 48
        h2: ["1.875rem", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "600" }], // 30
        "h2-lg": ["2.25rem", { lineHeight: "1.12", letterSpacing: "-0.01em", fontWeight: "600" }], // 36
        h3: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.005em", fontWeight: "600" }], // 22
        "h3-lg": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.005em", fontWeight: "600" }], // 24
        h4: ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }], // 18
        lead: ["1.125rem", { lineHeight: "1.5" }], // 18
        "lead-lg": ["1.25rem", { lineHeight: "1.5" }], // 20
        body: ["1rem", { lineHeight: "1.65" }], // 16
        "body-sm": ["0.875rem", { lineHeight: "1.6" }], // 14
        caption: ["0.8125rem", { lineHeight: "1.5" }], // 13
        eyebrow: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.14em", fontWeight: "500" }], // 12
        "mono-code": ["0.8125rem", { lineHeight: "1.6" }], // 13
        "mono-stat": ["1.875rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "600" }], // 30
        "mono-stat-lg": ["2.25rem", { lineHeight: "1.05", letterSpacing: "-0.01em", fontWeight: "600" }], // 36
      },

      // ── Named vertical-rhythm + reading-measure tokens (4/8px base). Numeric
      //    Tailwind spacing is preserved; these add the *semantic* rhythm so a
      //    section's spacing is chosen by name, never an improvised number.
      spacing: {
        stack: "2rem", // 32 — within a block
        block: "4rem", // 64 — between blocks in a section
        section: "6rem", // 96 — section py (mobile)
        "section-lg": "8rem", // 128 — section py (desktop)
        gutter: "1.5rem", // 24 — grid gap / page gutter
        "gutter-lg": "2rem", // 32 — page gutter (lg)
      },
      maxWidth: {
        measure: "42.5rem", // 680px ≈ 66ch — prose reading cap
        content: "72rem", // 1152px — default page column (== max-w-6xl)
        wide: "80rem", // 1280px — full-bleed data instruments
      },

      borderRadius: {
        md: "0.5rem", // 8 — chips, code-meta, inputs
        lg: "0.625rem", // 10 — small cards / wells
        xl: "0.75rem", // 12 — the card primitive
        "2xl": "1rem", // 16 — large surfaces
      },

      // ── Soft, warm-tinted (zinc, not pure-black) elevation ramp. A card rests
      //    on shadow-xs (no border) and lifts to shadow-sm on hover.
      boxShadow: {
        xs: "0 1px 2px rgb(24 24 27 / 0.04)",
        sm: "0 2px 8px rgb(24 24 27 / 0.06)",
        md: "0 8px 24px rgb(24 24 27 / 0.08)",
        lg: "0 16px 48px rgb(24 24 27 / 0.12)",
        focus: "0 0 0 3px rgb(99 102 241 / 0.35)",
      },

      colors: {
        // Marketing-light neutral ramp (zinc-based, AA documented on canvas).
        canvas: "#FAFAF9", // off-white background
        surface: "#FFFFFF", // pure white alternating sections
        "surface-2": "#F4F4F5", // inset wells, code-meta bars, table header rows
        edge: "#E4E4E7", // zinc-200 — hairline borders only
        "edge-strong": "#D4D4D8", // zinc-300 — hover borders / dividers that must read
        faint: "#A1A1AA", // zinc-400 — DECORATIVE/disabled only, never text (2.3:1)
        muted: "#71717A", // zinc-500 — secondary text (4.6:1 AA)
        "muted-strong": "#52525B", // zinc-600 — emphasized secondary text (7.4:1 AAA)
        "ink-soft": "#3F3F46", // zinc-700 — sub-headings (9.7:1)
        ink: "#18181B", // zinc-900 — primary text (16.1:1 AAA)

        // Brand accent (single indigo) — interactive primary. The 3-stop
        // gradient is retired from buttons (survives as a rare hero flourish).
        brand: {
          DEFAULT: "#6366F1", // indigo-500
          ink: "#4F46E5", // indigo-600 — hover / text
        },

        // Decision tokens — same six as the console. Base hue = fills/icons/
        // borders; `.strong` = AA-safe text-on-white.
        execute: { DEFAULT: "#10B981", strong: "#047857" }, // emerald-500 / 700 (4.8:1)
        refuse: { DEFAULT: "#EF4444", strong: "#DC2626" }, // red-500 / 600 (4.5:1)
        rewrite: { DEFAULT: "#F97316", strong: "#C2410C" }, // orange-500 / 700 (5.1:1)
        defer: { DEFAULT: "#F59E0B", strong: "#B45309" }, // amber-500 / 700 (5.0:1)
        escalate: { DEFAULT: "#8B5CF6", strong: "#7C3AED" }, // violet-500 / 600 (5.3:1)
        confirm: { DEFAULT: "#0EA5E9", strong: "#0369A1" }, // sky-500 / 700 (5.6:1)

        // Console dark-token namespace — used ONLY by the copied operator-console
        // design kit under components/console-kit/ so those components render
        // correctly on dark surfaces. These mirror the console's zinc-based
        // canvas/panel/edge/ink/muted/faint scale and never touch the
        // marketing-light palette above. See TASK K / ADR-128 (no shared @adjudicate/ui).
        console: {
          canvas: "rgb(9 9 11)", // zinc-950 — outermost dark surface
          panel: "rgb(24 24 27)", // zinc-900 — raised panels
          edge: "rgb(39 39 42)", // zinc-800 — hairline borders
          ink: "rgb(244 244 245)", // zinc-100 — primary text
          muted: "rgb(161 161 170)", // zinc-400 — secondary text
          faint: "rgb(82 82 91)", // zinc-600 — tertiary/label text
        },
      },

      letterSpacing: {
        // Eyebrows only; tightened from the old overloaded 0.18em.
        section: "0.14em",
        eyebrow: "0.14em",
        badge: "0.08em",
      },

      transitionTimingFunction: {
        // Distinct keys (don't override Tailwind's default `ease-out`).
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)", // EASE_OUT — entrances, hovers
        emphasis: "cubic-bezier(0.16, 1, 0.3, 1)", // EASE_SOFT — emphasis/scale
      },

      backgroundImage: {
        "gradient-primary":
          "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%)",
        "gradient-flow": "linear-gradient(135deg, #22D3EE 0%, #34D399 100%)",
        "gradient-defer": "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
