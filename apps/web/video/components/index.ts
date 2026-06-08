/**
 * video/components — the shared, polished scene kit.
 *
 * Reusable scene primitives generalized from HeroKernelLoop so that
 * compositions stop re-implementing motion and depth. Each primitive is a
 * small React.FC, deterministic over `frame` / props (no wall-clock or
 * random), and color-graded via the tokens namespaces.
 *
 * Compose these with the easing/spring presets and helpers in
 * ../motion and the palette in ../tokens.
 */

// ── Background / depth ────────────────────────────────────────────────
export { DottedGrid } from "./DottedGrid";
export { AmbientGlow } from "./AmbientGlow";
export { Vignette, Grain } from "./Overlay";

// ── Scene primitives ──────────────────────────────────────────────────
export { KernelCube } from "./KernelCube";
export { EnvelopeCard, type EnvelopeField } from "./EnvelopeCard";
export { DecisionBadge, DECISION_ORDER } from "./DecisionBadge";
export { ReceiptCard, type ReceiptRow } from "./ReceiptCard";
export { ConsoleRow } from "./ConsoleRow";
export { Caption } from "./Caption";

// ── Re-exported motion presets / helpers (single import surface) ──────
export {
  EASE_OUT,
  EASE_SOFT,
  EASE_IN,
  SPRING_WEIGHTY,
  SPRING_SETTLE,
  SPRING_QUIET,
  SPRING_DEFAULT,
  fadeIn,
  fadeOut,
  rise,
  seam,
  window,
} from "../motion";

// ── Re-exported tokens (palette + decision identity) ──────────────────
export {
  COLORS,
  CONSOLE,
  SHADOW,
  GRAIN,
  GRADIENT_PRIMARY,
  FONT_SANS,
  FONT_MONO,
  SECTION_CAPS_TRACKING,
  DECISIONS,
  type DecisionKind,
} from "../tokens";
