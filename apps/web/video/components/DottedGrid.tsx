import { interpolate } from "remotion";
import { COLORS, CONSOLE } from "../tokens";

/**
 * DottedGrid — a faint radial-dot background with an imperceptible
 * leftward parallax drift, giving a composition a quiet sense of motion
 * between beats. Generalized from HeroKernelLoop's DottedGrid.
 *
 * Deterministic over `frame`. The drift spans the whole `total` so the
 * per-frame movement is sub-pixel.
 */
export const DottedGrid: React.FC<{
  frame: number;
  /** Total composition length, used to scale the parallax drift. */
  total: number;
  /** Dot color. Defaults to the light-canvas edge token. */
  color?: string;
  /** Grid pitch in px. */
  size?: number;
  /** Overall opacity of the grid. */
  opacity?: number;
  /** Total horizontal drift across the composition, px (negative = left). */
  drift?: number;
  /** Use the dark console edge color (convenience over passing color). */
  dark?: boolean;
}> = ({
  frame,
  total,
  color,
  size = 24,
  opacity = 0.4,
  drift = -8,
  dark = false,
}) => {
  const dotColor = color ?? (dark ? CONSOLE.edge : COLORS.edge);
  const tx = interpolate(frame, [0, total], [0, drift], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        opacity,
        transform: `translateX(${tx}px)`,
        pointerEvents: "none",
      }}
    />
  );
};
