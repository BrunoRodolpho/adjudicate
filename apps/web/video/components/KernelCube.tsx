import { interpolate } from "remotion";
import { FONT_MONO, GRADIENT_PRIMARY, SHADOW } from "../tokens";

/**
 * KernelCube — the control-layer kernel block, with a 1Hz inner-glow
 * pulse that gives it a sense of being "alive" while idle. Generalized
 * from HeroKernelLoop's KernelCube (the anticipation outline and the
 * morph warm-flash are left to the composition; this primitive owns the
 * block itself and its breathing pulse).
 *
 * Deterministic over `frame`: the pulse is a pure function of frame.
 */
export const KernelCube: React.FC<{
  frame: number;
  /** Edge length in px. */
  size?: number;
  /** Scale multiplier (drive with a spring from the composition). */
  scale?: number;
  /** Opacity (drive entrance/exit from the composition). */
  opacity?: number;
  /** Two stacked uppercase labels inside the block. */
  labelTop?: string;
  labelBottom?: string;
  /** Frame at which the pulse begins counting (so it starts on entrance). */
  pulseStart?: number;
  /**
   * An optional overlay tint (e.g. COLORS.rewrite during a morph) and its
   * opacity, multiplied in via mix-blend overlay. Composition-driven.
   */
  tint?: string;
  tintOpacity?: number;
}> = ({
  frame,
  size = 120,
  scale = 1,
  opacity = 1,
  labelTop = "control",
  labelBottom = "layer",
  pulseStart = 0,
  tint,
  tintOpacity = 0,
}) => {
  if (opacity <= 0) return null;
  const radius = Math.round(size * 0.18);
  // 1Hz inner white-glow pulse: 0.20 ↔ 0.30 alpha.
  const innerPulse =
    0.25 + 0.05 * Math.sin(((frame - pulseStart) / 30) * Math.PI * 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: GRADIENT_PRIMARY,
        boxShadow: SHADOW.kernel,
        transform: `scale(${scale})`,
        opacity,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: FONT_MONO,
        fontSize: Math.max(8, Math.round(size * 0.075)),
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        textAlign: "center",
        padding: Math.round(size * 0.08),
      }}
    >
      {/* Inner white glow pulse (1Hz). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,${innerPulse})`,
          pointerEvents: "none",
        }}
      />
      {/* Optional composition-driven tint overlay (e.g. morph warmth). */}
      {tint && tintOpacity > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            background: tint,
            opacity: interpolate(tintOpacity, [0, 1], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            mixBlendMode: "overlay",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div style={{ opacity: 0.85, position: "relative" }}>{labelTop}</div>
      <div style={{ opacity: 0.85, position: "relative" }}>{labelBottom}</div>
    </div>
  );
};
