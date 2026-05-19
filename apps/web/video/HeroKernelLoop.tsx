import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "./tokens";

/**
 * HeroKernelLoop — 12-second mechanism-deep REWRITE composition.
 *
 * v0.3 rebuild: doubles the duration of the previous 6s morph and adds
 * the mechanism beats the prior version hand-waved — the original
 * envelope is preserved alongside the rewritten one, reason+basis fields
 * surface in-frame, and an audit card materialises beneath the action
 * lane to seal the transaction. The whole story is visible inside the
 * video; the adjacent DOM panel narrates the same beats in JSON form.
 *
 * 12 seconds · 30fps · 600×720 (retina-friendly bump from 480×600).
 *
 * Beat schedule:
 *   A. Intent emerges          0–66    (0.0–2.2s)
 *   B. Kernel intercepts      66–132   (2.2–4.4s)
 *   C. REWRITE mechanism     132–240   (4.4–8.0s)   ← the deep beat
 *   D. Execution + audit     240–312   (8.0–10.4s)
 *   E. Loop seam             312–360   (10.4–12.0s)
 *
 * Smoothness pass: weighty springs replace bouncy ones, expoOut bezier
 * gives long-tailed decelerations, ambient gradient drift adds physical
 * presence. See WEIGHTY_SPRING, SETTLE_SPRING, QUIET_SPRING, EASE_*.
 */

export const FPS = 30;
export const DURATION_FRAMES = 360; // 12 seconds
export const WIDTH = 600;
export const HEIGHT = 720;

// Anchor positions on the canvas.
const AGENT_X = 80;
const KERNEL_X = WIDTH / 2; // 300
const PRODUCTION_X = WIDTH - 80; // 520
const ROW_Y = 280;
const AUDIT_Y = 500;

// Two synthetic hashes for the proposed vs rewritten envelopes. The
// adjacent DOM panel uses these same prefixes so the visitor's eye can
// connect "the orange envelope in the video has the orange hash in the
// panel".
const HASH_H1 = "h1: sha256:9f4c…c4f2";
const HASH_H2 = "h2: sha256:3a01…8a91";

// ── Easing / spring presets ───────────────────────────────────────────

const EASE_DECEL = Easing.bezier(0.22, 1, 0.36, 1); // expo-out
const EASE_ACCEL = Easing.bezier(0.7, 0, 1, 0.4);
const EASE_INOUT = Easing.bezier(0.65, 0, 0.35, 1);

const WEIGHTY_SPRING = { damping: 28, stiffness: 60, mass: 1.4 } as const;
const SETTLE_SPRING = { damping: 24, stiffness: 90, mass: 1.0 } as const;
const QUIET_SPRING = { damping: 32, stiffness: 70, mass: 1.1 } as const;

// ── Top-level composition ─────────────────────────────────────────────

export const HeroKernelLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Loop seam: fade in over first 8 frames, fade out over last 24.
  // Background canvas-cream is on the outer AbsoluteFill so it never
  // fades — prevents <video> default-black flash at the seam.
  const fadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 24, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_INOUT,
    },
  );
  const seamOpacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}
    >
      <AbsoluteFill style={{ opacity: seamOpacity }}>
        <DottedGrid frame={frame} />
        <AmbientGlow frame={frame} />
        <AgentBox frame={frame} />
        <KernelCube frame={frame} />
        <PolicyRibbon frame={frame} />
        <RewriteLabel frame={frame} />
        <OriginalEnvelope frame={frame} />
        <RewrittenEnvelope frame={frame} />
        <ReasonAndBasis frame={frame} />
        <ProductionTarget frame={frame} />
        <AuditCard frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Background ────────────────────────────────────────────────────────

const DottedGrid: React.FC<{ frame: number }> = ({ frame }) => {
  // Imperceptible 8px leftward parallax across the full 12s gives the
  // composition a quiet sense of motion even between beats.
  const tx = interpolate(frame, [0, DURATION_FRAMES], [0, -8]);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `radial-gradient(${COLORS.edge} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
        opacity: 0.4,
        transform: `translateX(${tx}px)`,
      }}
    />
  );
};

const AmbientGlow: React.FC<{ frame: number }> = ({ frame }) => {
  // Slow sinusoidal scale 0.92↔1.08 over 12s. Barely perceptible per
  // frame — together with the inner-glow pulse, gives the kernel a
  // sense of physical presence rather than animated-then-paused.
  const phase = (frame / DURATION_FRAMES) * Math.PI;
  const scale = 0.92 + 0.16 * (0.5 + 0.5 * Math.sin(phase));
  return (
    <div
      style={{
        position: "absolute",
        left: KERNEL_X - 240,
        top: ROW_Y - 240,
        width: 480,
        height: 480,
        borderRadius: "50%",
        background:
          "radial-gradient(closest-side, rgba(99,102,241,0.18), rgba(217,70,239,0.04), transparent)",
        filter: "blur(24px)",
        transform: `scale(${scale})`,
        opacity: 0.6,
        pointerEvents: "none",
      }}
    />
  );
};

// ── Agent box (left edge) ─────────────────────────────────────────────

const AgentBox: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [8, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  const exitOpacity = interpolate(frame, [336, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: AGENT_X - 38,
        top: ROW_Y - 22,
        width: 76,
        padding: "8px 0",
        textAlign: "center",
        borderRadius: 10,
        background: COLORS.surface,
        border: `1.5px solid ${COLORS.edge}`,
        color: COLORS.ink,
        fontFamily: FONT_MONO,
        fontSize: 13,
        opacity: opacity * exitOpacity,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      Agent
    </div>
  );
};

// ── Kernel cube (center) ──────────────────────────────────────────────

const KernelCube: React.FC<{ frame: number }> = ({ frame }) => {
  // Anticipation outline 66–86, spring-in 66, hold through Beat C and D,
  // fade out 336–348 (kernel goes first in the lights-out sequence).
  const anticipationFade = interpolate(
    frame,
    [66, 80, 92],
    [0, 0.35, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const cubeScale = spring({
    frame: frame - 66,
    fps: FPS,
    config: WEIGHTY_SPRING,
  });
  // 1Hz inner-glow pulse during Beats B–D (frames 66–312).
  const innerPulse =
    frame >= 66 && frame < 312
      ? 0.25 + 0.05 * Math.sin(((frame - 66) / 30) * Math.PI * 2)
      : 0.25;
  // Warm tint flash during the morph (Beat C, frames 156–204).
  const warmth = interpolate(
    frame,
    [156, 180, 204],
    [0, 0.22, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Cube fades out first in the lights-out sequence at end of loop.
  const exitOpacity = interpolate(frame, [336, 348], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });

  if (frame < 66) return null;

  const showAnticipation = frame >= 66 && frame < 92;

  return (
    <>
      {showAnticipation ? (
        <div
          style={{
            position: "absolute",
            left: KERNEL_X - 60,
            top: ROW_Y - 60,
            width: 120,
            height: 120,
            borderRadius: 22,
            border: `2px dashed ${COLORS.muted}`,
            opacity: anticipationFade,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 60,
          top: ROW_Y - 60,
          width: 120,
          height: 120,
          borderRadius: 22,
          background: GRADIENT_PRIMARY,
          boxShadow: "0 20px 56px rgba(99,102,241,0.32)",
          transform: `scale(${cubeScale})`,
          opacity: exitOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          textAlign: "center",
          padding: 10,
        }}
      >
        {/* Inner white glow pulse (1Hz). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 22,
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,${innerPulse})`,
            pointerEvents: "none",
          }}
        />
        {/* Warm tint overlay during the morph (Beat C). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 22,
            background: COLORS.rewrite,
            opacity: warmth,
            mixBlendMode: "overlay",
          }}
        />
        <div style={{ opacity: 0.85, position: "relative" }}>control</div>
        <div style={{ opacity: 0.85, position: "relative" }}>layer</div>
      </div>
    </>
  );
};

// ── Policy ribbon (sweeps across kernel during Beat B) ────────────────

const PolicyRibbon: React.FC<{ frame: number }> = ({ frame }) => {
  // Visible 92–124. Reveals left-to-right via clip-path.
  if (frame < 92 || frame > 132) return null;
  const reveal = interpolate(frame, [92, 116], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  const fadeOut = interpolate(frame, [120, 132], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: KERNEL_X - 64,
        top: ROW_Y - 7,
        width: 128,
        height: 16,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_MONO,
        fontSize: 8,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COLORS.ink,
        opacity: fadeOut,
        clipPath: `inset(0 ${100 - reveal}% 0 0)`,
      }}
    >
      ▸ policy.deploy.ramp
    </div>
  );
};

// ── REWRITE label (above kernel) ──────────────────────────────────────

const RewriteLabel: React.FC<{ frame: number }> = ({ frame }) => {
  // Fades in at 116, holds through morph, fades out 220–236.
  const opacity = interpolate(
    frame,
    [116, 128, 220, 236],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_INOUT },
  );
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: KERNEL_X - 80,
        top: ROW_Y - 96,
        width: 160,
        textAlign: "center",
        fontFamily: FONT_MONO,
        fontSize: 13,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.rewrite,
        fontWeight: 600,
        opacity,
      }}
    >
      REWRITE
    </div>
  );
};

// ── Envelope rendering primitives ─────────────────────────────────────

interface EnvelopeBoxProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly opacity: number;
  readonly scale: number;
  readonly borderColor: string;
  readonly rampValue: number | string;
  readonly rampColor: string;
  readonly rampWeight: number;
  readonly zIndex?: number;
}

const EnvelopeBox: React.FC<EnvelopeBoxProps> = ({
  x,
  y,
  width,
  opacity,
  scale,
  borderColor,
  rampValue,
  rampColor,
  rampWeight,
  zIndex = 4,
}) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - 28,
        width,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        zIndex,
      }}
    >
      <div
        style={{
          background: COLORS.surface,
          border: `1.5px solid ${borderColor}`,
          borderRadius: 8,
          padding: "6px 10px",
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: COLORS.muted,
          textAlign: "left",
          lineHeight: 1.45,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ color: COLORS.faint, fontSize: 9 }}>{"{"}</div>
        <div style={{ paddingLeft: 8, fontSize: 10 }}>
          deployment.approval.request
        </div>
        <div style={{ paddingLeft: 8, fontSize: 10 }}>
          rampPercent:{" "}
          <span style={{ color: rampColor, fontWeight: rampWeight }}>
            {rampValue}
          </span>
        </div>
        <div style={{ color: COLORS.faint, fontSize: 9 }}>{"}"}</div>
      </div>
    </div>
  );
};

// ── Original envelope (Beats A–C, then persists in audit lane) ────────

const OriginalEnvelope: React.FC<{ frame: number }> = ({ frame }) => {
  // Phase 1 (12–60): fade in at Agent, glide to kernel center.
  // Phase 2 (60–132): sits inside kernel at center.
  // Phase 3 (132–168): split — clone slides LEFT into audit lane at 55% opacity.
  // Phase 4 (168–300): held in audit lane.
  // Phase 5 (300–320): fades out before loop seam.

  let x: number;
  if (frame < 12) {
    x = AGENT_X;
  } else if (frame < 60) {
    x = interpolate(frame, [12, 60], [AGENT_X, KERNEL_X], {
      easing: EASE_DECEL,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (frame < 132) {
    x = KERNEL_X;
  } else if (frame < 168) {
    x = interpolate(frame, [132, 168], [KERNEL_X, KERNEL_X - 100], {
      easing: EASE_DECEL,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    x = KERNEL_X - 100;
  }

  // Opacity stages.
  const fadeIn = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  // Drop to 55% as it enters the audit lane.
  const auditFade = interpolate(frame, [144, 168], [1, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  const exitFade = interpolate(frame, [300, 320], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  const opacity = Math.min(fadeIn, auditFade, exitFade);

  return (
    <>
      <EnvelopeBox
        x={x}
        y={ROW_Y}
        width={140}
        opacity={opacity}
        scale={1}
        borderColor={COLORS.edge}
        rampValue={100}
        rampColor={COLORS.ink}
        rampWeight={500}
        zIndex={frame < 132 ? 5 : 3}
      />
      {/* "original (preserved)" tag, visible once cloned into audit lane. */}
      {frame >= 156 && frame < 320 ? (
        <OriginalLane x={x} opacity={opacity} />
      ) : null}
      {/* intentHash tag follows the original. */}
      {frame >= 40 ? (
        <HashTag
          x={x}
          y={ROW_Y + 38}
          text={HASH_H1}
          opacity={Math.min(
            opacity,
            interpolate(frame, [40, 58], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          )}
        />
      ) : null}
    </>
  );
};

const OriginalLane: React.FC<{ x: number; opacity: number }> = ({
  x,
  opacity,
}) => (
  <div
    style={{
      position: "absolute",
      left: x - 70,
      top: ROW_Y - 50,
      width: 140,
      textAlign: "center",
      fontFamily: FONT_MONO,
      fontSize: 9,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: COLORS.faint,
      opacity,
    }}
  >
    original · preserved
  </div>
);

const HashTag: React.FC<{
  x: number;
  y: number;
  text: string;
  opacity: number;
}> = ({ x, y, text, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x - 90,
      top: y,
      width: 180,
      textAlign: "center",
      fontFamily: FONT_MONO,
      fontSize: 9,
      color: COLORS.faint,
      opacity,
    }}
  >
    {text}
  </div>
);

// ── Rewritten envelope (Beat C onward) ────────────────────────────────

const RewrittenEnvelope: React.FC<{ frame: number }> = ({ frame }) => {
  // Materialises at kernel center frame 132 (when the original splits
  // off). Number morphs 100→25 over frames 156–204 (1.6s). Exits to
  // production frames 240–276.

  let x: number;
  if (frame < 132) {
    return null;
  } else if (frame < 240) {
    x = KERNEL_X;
  } else if (frame < 276) {
    x = interpolate(frame, [240, 276], [KERNEL_X, PRODUCTION_X], {
      easing: EASE_ACCEL,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    x = PRODUCTION_X;
  }

  // Opacity: fade in 132–148, exit 264–280.
  const fadeIn = interpolate(frame, [132, 148], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  const fadeOut = interpolate(frame, [264, 284], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  const opacity = Math.min(fadeIn, fadeOut);

  // The morph: rampPercent 100→25 over frames 156–204 (expo-out for tail).
  const rampValue = Math.round(
    interpolate(frame, [156, 204], [100, 25], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_DECEL,
    }),
  );

  // Border colour shifts from edge to rewrite at the midpoint of the morph.
  const isModified = frame >= 180;
  const borderColor = isModified ? COLORS.rewrite : COLORS.edge;
  const rampColor = isModified ? COLORS.rewrite : COLORS.ink;

  // Slight scale shrink during the morph to suggest "clamped".
  const scale = interpolate(frame, [156, 204], [1.0, 0.94], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });

  return (
    <>
      <EnvelopeBox
        x={x}
        y={ROW_Y}
        width={156}
        opacity={opacity}
        scale={scale}
        borderColor={borderColor}
        rampValue={rampValue}
        rampColor={rampColor}
        rampWeight={isModified ? 700 : 500}
        zIndex={6}
      />
      {/* "payload mutated" tag — appears post-morph, fades before exit. */}
      {frame >= 204 && frame < 252 ? (
        <PayloadMutatedTag x={x} frame={frame} />
      ) : null}
      {/* New intentHash tag for the rewritten envelope. */}
      {frame >= 200 && opacity > 0 ? (
        <HashTag
          x={x}
          y={ROW_Y + 38}
          text={HASH_H2}
          opacity={
            Math.min(
              opacity,
              interpolate(frame, [200, 220], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_DECEL,
              }),
            ) * (isModified ? 1 : 0)
          }
        />
      ) : null}
    </>
  );
};

const PayloadMutatedTag: React.FC<{ x: number; frame: number }> = ({
  x,
  frame,
}) => {
  const opacity = interpolate(
    frame,
    [204, 216, 240, 252],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_INOUT },
  );
  return (
    <div
      style={{
        position: "absolute",
        left: x - 80,
        top: ROW_Y - 56,
        width: 160,
        textAlign: "center",
        fontFamily: FONT_MONO,
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COLORS.rewrite,
        fontWeight: 600,
        opacity,
      }}
    >
      payload mutated
    </div>
  );
};

// ── Reason line + basis pill (Beat C, below the rewritten envelope) ───

const REASON_TEXT =
  'reason: "rampPercent capped to staged-rollout max."';

const ReasonAndBasis: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 188 || frame > 280) return null;

  // Reason text types in 188–224, holds, fades out 264–280.
  const typedChars = Math.floor(
    interpolate(frame, [188, 224], [0, REASON_TEXT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_DECEL,
    }),
  );
  const reasonFade = interpolate(frame, [264, 280], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });

  // Basis pill: settle-in 208, fade with reason.
  const basisOpacity =
    Math.min(
      interpolate(frame, [208, 224], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_DECEL,
      }),
      reasonFade,
    );

  // Basis details below pill.
  const detailsOpacity =
    Math.min(
      interpolate(frame, [220, 236], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_DECEL,
      }),
      reasonFade,
    );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 200,
          top: ROW_Y + 64,
          width: 400,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: COLORS.muted,
          opacity: reasonFade,
          lineHeight: 1.5,
        }}
      >
        {REASON_TEXT.slice(0, typedChars)}
      </div>
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 100,
          top: ROW_Y + 96,
          width: 200,
          display: "flex",
          justifyContent: "center",
          opacity: basisOpacity,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 10px",
            borderRadius: 14,
            background: "rgba(249,115,22,0.12)",
            border: `1px solid ${COLORS.rewrite}`,
            color: COLORS.rewrite,
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          business · QUANTITY_CAPPED
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 200,
          top: ROW_Y + 128,
          width: 400,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 9,
          color: COLORS.faint,
          opacity: detailsOpacity,
        }}
      >
        requested: 100 &nbsp;&nbsp; cappedTo: 25
      </div>
    </>
  );
};

// ── Production target (right side) ────────────────────────────────────

const ProductionTarget: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [246, 264], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  const exitOpacity = interpolate(frame, [336, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  // A small ✓ pulse when the envelope arrives.
  const checkOpacity = interpolate(
    frame,
    [264, 276, 296],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div
      style={{
        position: "absolute",
        left: PRODUCTION_X - 50,
        top: ROW_Y - 30,
        width: 100,
        padding: "10px 0",
        borderRadius: 10,
        background: COLORS.surface,
        border: `1.5px solid ${COLORS.edge}`,
        textAlign: "center",
        opacity: opacity * exitOpacity,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: COLORS.faint,
          fontFamily: FONT_MONO,
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        production
      </div>
      <div style={{ fontSize: 16, letterSpacing: 2, position: "relative" }}>
        🗄️ ☁️ 🚀
        <span
          style={{
            position: "absolute",
            top: -14,
            right: -4,
            fontSize: 11,
            color: COLORS.execute,
            opacity: checkOpacity,
            fontFamily: FONT_MONO,
            fontWeight: 700,
          }}
        >
          ✓
        </span>
      </div>
    </div>
  );
};

// ── Audit card (Beat D, lower third) ──────────────────────────────────

const AUDIT_ROWS: ReadonlyArray<{
  label: string;
  value: string;
  valueColor?: string;
  valueWeight?: number;
}> = [
  {
    label: "original",
    value: "{ deployment.approval.request, ramp: 100, hash: h1 }",
  },
  {
    label: "decision",
    value: "REWRITE",
    valueColor: COLORS.rewrite,
    valueWeight: 700,
  },
  {
    label: "reason",
    value: '"rampPercent capped to staged-rollout max."',
  },
  { label: "basis", value: "business · QUANTITY_CAPPED" },
  {
    label: "result",
    value: "{ deployment.approval.request, ramp: 25, hash: h2 }",
    valueColor: COLORS.rewrite,
    valueWeight: 500,
  },
  { label: "at", value: "11:32:08.421Z" },
];

const AuditCard: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 264 || frame > 360) return null;

  // Settle-in spring 264 → full at ~290. Fades out last (348–360).
  const cardSpring = spring({
    frame: frame - 264,
    fps: FPS,
    config: SETTLE_SPRING,
  });
  const tx = (1 - cardSpring) * 16;
  const fadeIn = interpolate(frame, [264, 282], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });
  const fadeOut = interpolate(frame, [348, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INOUT,
  });
  const opacity = Math.min(fadeIn, fadeOut);

  // Row-by-row reveal: 6 rows over frames 280–304 (4 frames per row).
  const rowReveal = (rowIndex: number) =>
    interpolate(
      frame,
      [280 + rowIndex * 4, 280 + rowIndex * 4 + 8],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_DECEL,
      },
    );

  // audit ✓ chip appears at frame 306.
  const checkOpacity = interpolate(frame, [306, 318], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_DECEL,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: WIDTH / 2 - 240,
        top: AUDIT_Y,
        width: 480,
        padding: 18,
        borderRadius: 14,
        background: COLORS.surface,
        border: `1.5px solid ${COLORS.edge}`,
        boxShadow: "0 8px 28px rgba(0,0,0,0.06)",
        opacity,
        transform: `translateY(${tx}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 10,
          marginBottom: 10,
          borderBottom: `1px solid ${COLORS.edge}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: COLORS.faint,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          auditRecord
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: FONT_MONO,
            fontSize: 9,
            color: COLORS.execute,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: checkOpacity,
            fontWeight: 600,
          }}
        >
          ✓ sealed
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {AUDIT_ROWS.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              gap: 12,
              fontFamily: FONT_MONO,
              fontSize: 10,
              lineHeight: 1.5,
              opacity: rowReveal(i),
            }}
          >
            <span
              style={{
                width: 84,
                flexShrink: 0,
                color: COLORS.faint,
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                color: row.valueColor ?? COLORS.ink,
                fontWeight: row.valueWeight ?? 400,
                flex: 1,
                wordBreak: "break-word",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
