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

export const GRADIENT_PRIMARY =
  "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%)";

export const FONT_SANS =
  "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
export const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
