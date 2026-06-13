import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "var(--font-mono)",
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        sans: [
          "var(--font-mono)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        // Cyber-Industrial palette anchored on zinc.
        // Surfaces
        canvas: "rgb(9 9 11)", // zinc-950
        panel: "rgb(24 24 27)", // zinc-900
        edge: "rgb(39 39 42)", // zinc-800
        // Text
        ink: "rgb(244 244 245)", // zinc-100
        muted: "rgb(161 161 170)", // zinc-400
        faint: "rgb(82 82 91)", // zinc-600
      },
      letterSpacing: {
        "section": "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
