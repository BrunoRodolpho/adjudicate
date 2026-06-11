/**
 * Color tokens duplicated from apps/web/tailwind.config.ts so the Remotion
 * video matches the page palette exactly. Hardcoded hex (not a Tailwind
 * compile step) keeps the Remotion bundle lean and avoids extra Webpack
 * configuration for marginal benefit.
 *
 * If the page palette changes, change both files. The shared values are
 * documented once here and verified visually in apps/web/sections/HowItWorks.tsx.
 */

export const COLORS = {
  canvas: "#FAFAF9",
  surface: "#FFFFFF",
  ink: "#18181B",
  muted: "#71717A",
  faint: "#A1A1AA",
  edge: "#E4E4E7",
  // Decision tokens — same six as the operator console.
  execute: "#10B981",
  refuse: "#EF4444",
  rewrite: "#F97316",
  defer: "#F59E0B",
  escalate: "#8B5CF6",
  confirm: "#0EA5E9",
} as const;

/**
 * CONSOLE — dark-scene palette for the operator-console beats (the
 * AuditRecord saved to a DB, then displayed in the audit explorer). The
 * light `COLORS` namespace above stays authoritative for the agent /
 * kernel / rewrite story; CONSOLE is the matching dark surface so the
 * "saved → console" steps read as a different, operator-facing place.
 *
 * Tuned to the zinc ramp the operator console uses (zinc-950 canvas).
 * The six decision colors are NOT duplicated here — they are load-bearing
 * identity and remain authoritative in `COLORS`. Read decision colors
 * from `COLORS.execute` / `.rewrite` / … on dark scenes too.
 */
export const CONSOLE = {
  canvas: "#09090B", // zinc-950
  panel: "#18181B", // zinc-900
  edge: "#27272A", // zinc-800
  ink: "#F4F4F5", // zinc-100
  muted: "#A1A1AA", // zinc-400
  faint: "#52525B", // zinc-600
} as const;

/**
 * SHADOW — layered-depth presets. Soft, palette-neutral elevation for
 * the light scenes plus a tinted kernel glow and a dark-scene variant.
 * Keeps shadow values consistent across every composition.
 */
export const SHADOW = {
  /** Resting elevation for cards / pills on the light canvas. */
  card: "0 2px 8px rgba(0,0,0,0.04)",
  /** Raised elevation for a settling panel (audit record). */
  panel: "0 8px 28px rgba(0,0,0,0.06)",
  /** The indigo→fuchsia kernel glow. */
  kernel: "0 20px 56px rgba(99,102,241,0.32)",
  /** Elevation for panels on the dark console canvas. */
  consolePanel: "0 8px 28px rgba(0,0,0,0.45)",
} as const;

/**
 * GRAIN — a tiny deterministic data-URI noise tile + recommended
 * overlay opacities for the film-grain pass. The Grain component in
 * video/components composes these; constants live here so the look is
 * tunable in one place.
 */
export const GRAIN = {
  /**
   * 64×64 fractal-noise SVG as a data URI. Static (no animation), so it
   * stays deterministic over frame. Tiled via backgroundSize.
   */
  dataUri:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='64' height='64' filter='url(%23n)' opacity='0.5'/></svg>\")",
  /** Grain opacity over the light canvas. */
  lightOpacity: 0.04,
  /** Grain opacity over the dark console canvas. */
  darkOpacity: 0.06,
} as const;

export const GRADIENT_PRIMARY =
  "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%)";

export const FONT_SANS =
  "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
export const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * SECTION_CAPS_TRACKING — the site's 0.18em letter-spacing for eyebrow /
 * section-caps text. Use for kinetic-typography eyebrows so the videos
 * match the page's typographic rhythm.
 */
export const SECTION_CAPS_TRACKING = "0.18em";

/**
 * DECISIONS — the six authoritative outcomes with their color token key,
 * display label, and a glyph. Shared so DecisionBadge / ConsoleRow and
 * the compositions agree on identity (color is load-bearing).
 */
export const DECISIONS = {
  execute: { label: "Execute", color: COLORS.execute, glyph: "▶" },
  refuse: { label: "Refuse", color: COLORS.refuse, glyph: "✕" },
  rewrite: { label: "Rewrite", color: COLORS.rewrite, glyph: "✎" },
  defer: { label: "Defer", color: COLORS.defer, glyph: "⏸" },
  escalate: { label: "Escalate", color: COLORS.escalate, glyph: "↑" },
  confirm: { label: "Confirm", color: COLORS.confirm, glyph: "?" },
} as const;

/** Union of the six decision keys — the discriminant DecisionBadge takes. */
export type DecisionKind = keyof typeof DECISIONS;
