import { interpolate } from "remotion";

/**
 * AmbientGlow — a large, soft, slowly-breathing radial glow that gives a
 * focal point (usually the kernel) a sense of physical presence rather
 * than animated-then-paused. Generalized from HeroKernelLoop's AmbientGlow.
 *
 * Deterministic over `frame`: a single slow sinusoidal scale across the
 * whole `total`, so per-frame motion is imperceptible.
 */
export const AmbientGlow: React.FC<{
  frame: number;
  total: number;
  /** Center x of the glow (px). */
  x: number;
  /** Center y of the glow (px). */
  y: number;
  /** Diameter of the glow (px). */
  size?: number;
  /** Inner / outer gradient stops. Defaults to indigo→fuchsia. */
  inner?: string;
  outer?: string;
  /** Peak opacity of the whole glow. */
  opacity?: number;
  /** Blur radius (px). */
  blur?: number;
}> = ({
  frame,
  total,
  x,
  y,
  size = 480,
  inner = "rgba(99,102,241,0.18)",
  outer = "rgba(217,70,239,0.04)",
  opacity = 0.6,
  blur = 24,
}) => {
  // Slow half-cycle scale 0.92 ↔ 1.08 across the composition.
  const phase = interpolate(frame, [0, total], [0, Math.PI], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = 0.92 + 0.16 * (0.5 + 0.5 * Math.sin(phase));
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(closest-side, ${inner}, ${outer}, transparent)`,
        filter: `blur(${blur}px)`,
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};
