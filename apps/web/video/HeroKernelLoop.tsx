import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  AmbientGlow,
  Caption,
  ConsoleRow,
  DecisionBadge,
  DottedGrid,
  EASE_IN,
  EASE_OUT,
  EASE_SOFT,
  EnvelopeCard,
  fadeIn as kitFadeIn,
  fadeOut as kitFadeOut,
  Grain,
  KernelCube,
  ReceiptCard,
  type ReceiptRow,
  rise,
  seam,
  SPRING_SETTLE,
  SPRING_WEIGHTY,
  Vignette,
} from "./components";
import { COLORS, CONSOLE, FONT_MONO, FONT_SANS, SHADOW } from "./tokens";

/**
 * HeroKernelLoop — the homepage hero loop, now carrying the full product
 * spine end to end: an agent ACTS → the kernel DECIDES (Rewrite) → a signed
 * AuditRecord is SAVED to the database → the operator console DISPLAYS it.
 *
 * v0.4 rebuild: composes the shared scene kit (video/components/* +
 * video/motion.ts) instead of bespoke primitives, and extends the prior
 * version (which stopped at "audit") with the two missing narrative beats —
 * the receipt being persisted ("→ Postgres") and the receipt surfacing as a
 * row in a dark operator-console audit explorer. Kinetic captions name each
 * of the four steps in turn.
 *
 * 16 seconds · 30fps · 600×720 portrait.
 *
 * Beat schedule (frames @ 30fps):
 *   A. Intent emerges        0–66     the agent acts
 *   B. Kernel intercepts     66–132   the guard decides
 *   C. REWRITE mechanism    132–252   rewrite (the deep beat)
 *   D. Receipt SAVED        252–348   a signed receipt → Postgres
 *   E. Console DISPLAYS     348–456   the operator console shows it
 *   F. Loop seam            456–480   fade back to the light start
 *
 * Motion bar: one weighted/expo-out easing system (EASE_OUT / EASE_SOFT /
 * EASE_IN + over-damped springs from motion.ts), layered depth (kit shadows,
 * ambient glow, soft blur), a faint vignette + film grain, palette-consistent
 * grading (light COLORS for steps 1–3, dark CONSOLE for step 4), frame-accurate
 * beats, and kinetic typography with the site's 0.18em section-caps tracking.
 */

export const FPS = 30;
export const DURATION_FRAMES = 480; // 16 seconds (was 360 / 12s)
export const WIDTH = 600;
export const HEIGHT = 720;

// ── Anchor positions on the canvas ────────────────────────────────────
const AGENT_X = 80;
const KERNEL_X = WIDTH / 2; // 300
const PRODUCTION_X = WIDTH - 80; // 520
const ROW_Y = 240;
const RECEIPT_Y = 432;

// Two synthetic hashes for the proposed vs rewritten envelopes. The
// receipt's content-address (h2) is the one that follows into the console.
const HASH_H1 = "h1: sha256:9f4c…c4f2";
const HASH_H2_FULL = "sha256:3a01b7…e2d8…8a91";
const HASH_H2_SHORT = "sha256:3a01…8a91";

// Beat boundaries (single source of truth for cross-component timing).
const SAVE_START = 252; // Beat D — receipt materializes
const SAVE_BEAT = 312; // the "→ Postgres" persist moment
const CONSOLE_START = 348; // Beat E — dark console crossfade begins
const LIGHTS_OUT = 444; // everything light begins clearing for the seam

// ── Top-level composition ─────────────────────────────────────────────

export const HeroKernelLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Loop seam handled by the kit helper (in over first 8, out over last 24).
  // The canvas-cream background lives on the OUTER fill so it never fades —
  // prevents the <video> default-black flash at the loop boundary.
  const seamOpacity = seam(frame, durationInFrames);

  return (
    <AbsoluteFill
      style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}
    >
      <AbsoluteFill style={{ opacity: seamOpacity }}>
        {/* Depth + ambient background. */}
        <DottedGrid frame={frame} total={DURATION_FRAMES} />
        <AmbientGlow
          frame={frame}
          total={DURATION_FRAMES}
          x={KERNEL_X}
          y={ROW_Y}
        />

        {/* Steps 1–3 — the light "decision" stage. */}
        <AgentBox frame={frame} />
        <KernelStage frame={frame} />
        <PolicyRibbon frame={frame} />
        <RewriteLabel frame={frame} />
        <OriginalEnvelope frame={frame} />
        <RewrittenEnvelope frame={frame} />
        <ReasonAndBasis frame={frame} />
        <ProductionTarget frame={frame} />

        {/* Step 3→4 — the signed receipt + its persistence to Postgres. */}
        <SavedReceipt frame={frame} />

        {/* Step 4 — the dark operator-console audit explorer. */}
        <ConsolePanel frame={frame} />

        {/* Kinetic captions naming each of the four steps. */}
        <StepCaptions frame={frame} />

        {/* Filmic grade — vignette + grain on top of everything. */}
        <Vignette />
        <Grain />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Agent box (left edge) ─────────────────────────────────────────────

const AgentBox: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = kitFadeIn(frame, 8, 16);
  // Clears with the rest of the light stage as the console takes over.
  const exitOpacity = kitFadeOut(frame, CONSOLE_START, 24);
  const ty = rise(frame, 8, 18, 12);
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
        opacity: Math.min(opacity, exitOpacity),
        transform: `translateY(${ty}px)`,
        boxShadow: SHADOW.card,
      }}
    >
      Agent
    </div>
  );
};

// ── Kernel stage (cube + anticipation outline + morph warmth) ─────────

const KernelStage: React.FC<{ frame: number }> = ({ frame }) => {
  // Anticipation dashed outline 66–92.
  const anticipationFade = interpolate(frame, [66, 80, 92], [0, 0.35, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cubeScale = spring({
    frame: frame - 66,
    fps: FPS,
    config: SPRING_WEIGHTY,
  });
  // Warm rewrite tint flash during the morph (Beat C).
  const warmth = interpolate(frame, [156, 180, 204], [0, 0.22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Kernel clears as the console takes over (it has done its job by then).
  const exitOpacity = kitFadeOut(frame, CONSOLE_START - 12, 24);

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
        }}
      >
        <KernelCube
          frame={frame}
          size={120}
          scale={cubeScale}
          opacity={exitOpacity}
          pulseStart={66}
          tint={COLORS.rewrite}
          tintOpacity={warmth}
        />
      </div>
    </>
  );
};

// ── Policy ribbon (sweeps across kernel during Beat B) ────────────────

const PolicyRibbon: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 92 || frame > 132) return null;
  const reveal = interpolate(frame, [92, 116], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const fadeOut = interpolate(frame, [120, 132], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
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
        zIndex: 7,
      }}
    >
      ▸ policy.deploy.ramp
    </div>
  );
};

// ── REWRITE label (above kernel) — now a kit DecisionBadge ────────────

const RewriteLabel: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [116, 128, 232, 248], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  if (opacity <= 0) return null;
  // A subtle settle on entrance.
  const scale = interpolate(frame, [116, 132], [0.92, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: ROW_Y - 104,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <DecisionBadge kind="rewrite" size="md" opacity={opacity} scale={scale} />
    </div>
  );
};

// ── Original envelope (Beats A–C, then persists in audit lane) ────────

const OriginalEnvelope: React.FC<{ frame: number }> = ({ frame }) => {
  let x: number;
  if (frame < 12) {
    x = AGENT_X;
  } else if (frame < 60) {
    x = interpolate(frame, [12, 60], [AGENT_X, KERNEL_X], {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (frame < 132) {
    x = KERNEL_X;
  } else if (frame < 168) {
    x = interpolate(frame, [132, 168], [KERNEL_X, KERNEL_X - 100], {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    x = KERNEL_X - 100;
  }

  const fadeIn = kitFadeIn(frame, 12, 16);
  // Drop to 55% as it enters the audit lane.
  const auditFade = interpolate(frame, [144, 168], [1, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  // Clears as the receipt beat takes the stage.
  const exitFade = kitFadeOut(frame, SAVE_START - 12, 20);
  const opacity = Math.min(fadeIn, auditFade, exitFade);

  return (
    <>
      <EnvelopeCard
        x={x}
        y={ROW_Y}
        width={140}
        opacity={opacity}
        borderColor={COLORS.edge}
        title="deployment.approval.request"
        fields={[
          { key: "rampPercent", value: 100, valueColor: COLORS.ink },
        ]}
        zIndex={frame < 132 ? 5 : 3}
      />
      {frame >= 156 && frame < SAVE_START ? (
        <OriginalLane x={x} opacity={opacity} />
      ) : null}
      {frame >= 40 ? (
        <HashTag
          x={x}
          y={ROW_Y + 44}
          text={HASH_H1}
          opacity={Math.min(opacity, kitFadeIn(frame, 40, 18))}
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
  if (frame < 132) return null;

  let x: number;
  if (frame < 240) {
    x = KERNEL_X;
  } else if (frame < 276) {
    x = interpolate(frame, [240, 276], [KERNEL_X, PRODUCTION_X], {
      easing: EASE_IN,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    x = PRODUCTION_X;
  }

  const fadeIn = kitFadeIn(frame, 132, 16);
  const fadeOut = kitFadeOut(frame, CONSOLE_START - 12, 24);
  const opacity = Math.min(fadeIn, fadeOut);

  // The morph: rampPercent 100→25 over frames 156–204 (expo-out tail).
  const rampValue = Math.round(
    interpolate(frame, [156, 204], [100, 25], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    }),
  );

  const isModified = frame >= 180;
  const borderColor = isModified ? COLORS.rewrite : COLORS.edge;
  const rampColor = isModified ? COLORS.rewrite : COLORS.ink;

  // Slight scale shrink during the morph to suggest "clamped".
  const scale = interpolate(frame, [156, 204], [1.0, 0.94], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <>
      <EnvelopeCard
        x={x}
        y={ROW_Y}
        width={156}
        opacity={opacity}
        scale={scale}
        borderColor={borderColor}
        title="deployment.approval.request"
        fields={[
          {
            key: "rampPercent",
            value: rampValue,
            valueColor: rampColor,
            valueWeight: isModified ? 700 : 500,
          },
        ]}
        zIndex={6}
      />
      {frame >= 204 && frame < 252 ? (
        <PayloadMutatedTag x={x} frame={frame} />
      ) : null}
      {frame >= 200 && opacity > 0 ? (
        <HashTag
          x={x}
          y={ROW_Y + 44}
          text={`h2: ${HASH_H2_SHORT}`}
          opacity={
            Math.min(opacity, kitFadeIn(frame, 200, 20)) *
            (isModified ? 1 : 0)
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
  const opacity = interpolate(frame, [204, 216, 240, 252], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: x - 80,
        top: ROW_Y - 60,
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

const REASON_TEXT = 'reason: "rampPercent capped to staged-rollout max."';

const ReasonAndBasis: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 188 || frame > 252) return null;

  const typedChars = Math.floor(
    interpolate(frame, [188, 224], [0, REASON_TEXT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    }),
  );
  const reasonFade = kitFadeOut(frame, SAVE_START - 16, 16);

  const basisOpacity = Math.min(kitFadeIn(frame, 208, 16), reasonFade);
  const detailsOpacity = Math.min(kitFadeIn(frame, 220, 16), reasonFade);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 200,
          top: ROW_Y + 70,
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
          left: 0,
          right: 0,
          top: ROW_Y + 100,
          display: "flex",
          justifyContent: "center",
          opacity: basisOpacity,
        }}
      >
        <DecisionBadge
          kind="rewrite"
          size="sm"
          hideGlyph
          opacity={basisOpacity}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: KERNEL_X - 200,
          top: ROW_Y + 132,
          width: 400,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 9,
          color: COLORS.faint,
          opacity: detailsOpacity,
        }}
      >
        business · QUANTITY_CAPPED &nbsp;·&nbsp; requested 100 → capped 25
      </div>
    </>
  );
};

// ── Production target (right side) ────────────────────────────────────

const ProductionTarget: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = kitFadeIn(frame, 246, 18);
  const exitOpacity = kitFadeOut(frame, CONSOLE_START - 12, 24);
  const checkOpacity = interpolate(frame, [264, 276, 300], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
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
        opacity: Math.min(opacity, exitOpacity),
        boxShadow: SHADOW.card,
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

// ── Beat D — the signed receipt, then persisted to Postgres ───────────

const RECEIPT_ROWS: ReadonlyArray<ReceiptRow> = [
  {
    label: "intent",
    value: "deployment.approval.request",
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
    value: "{ ramp: 25 }",
    valueColor: COLORS.rewrite,
    valueWeight: 500,
  },
  { label: "at", value: "11:32:08.421Z" },
];

const SavedReceipt: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < SAVE_START) return null;
  // The card settles in, holds, then clears as it "flies" into the console.
  const cardSpring = spring({
    frame: frame - SAVE_START,
    fps: FPS,
    config: SPRING_SETTLE,
  });
  const settleY = (1 - cardSpring) * 16;
  const fadeIn = kitFadeIn(frame, SAVE_START, 18);
  // Hand off to the console: card slides up + fades as the dark panel rises.
  const handoff = kitFadeOut(frame, CONSOLE_START - 6, 22);
  const handoffY = interpolate(
    frame,
    [CONSOLE_START - 6, CONSOLE_START + 16],
    [0, -28],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN },
  );
  const opacity = Math.min(fadeIn, handoff);
  if (opacity <= 0) return null;

  // Per-row cascade: 6 rows from frame SAVE_START+16, 4 frames apart.
  const rowOpacity = (i: number) =>
    interpolate(
      frame,
      [SAVE_START + 16 + i * 4, SAVE_START + 16 + i * 4 + 8],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
    );

  // The "sealed" chip lands after the rows are in.
  const sealedOpacity = kitFadeIn(frame, SAVE_START + 44, 12);

  return (
    <>
      <ReceiptCard
        x={WIDTH / 2}
        y={RECEIPT_Y}
        width={460}
        opacity={opacity}
        translateY={settleY + handoffY}
        rows={RECEIPT_ROWS}
        hash={HASH_H2_FULL}
        rowOpacity={rowOpacity}
        sealedOpacity={sealedOpacity}
        sealedLabel="signed"
      />
      <PersistBeat frame={frame} />
    </>
  );
};

/**
 * PersistBeat — the "→ Postgres" save moment: a small content-address chip
 * travels from the receipt down toward a database glyph, which then confirms
 * "saved". This is the literal step-3→DB persistence the prior loop lacked.
 */
const PersistBeat: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < SAVE_BEAT - 8 || frame > CONSOLE_START + 4) return null;

  // Chip flies from above the DB glyph down into it (SAVE_BEAT → +18).
  const travel = interpolate(frame, [SAVE_BEAT, SAVE_BEAT + 18], [0, 36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN,
  });
  const chipOpacity = interpolate(
    frame,
    [SAVE_BEAT - 6, SAVE_BEAT, SAVE_BEAT + 16, SAVE_BEAT + 22],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );
  // The DB glyph + "saved → Postgres" label.
  const dbOpacity = interpolate(
    frame,
    [SAVE_BEAT - 8, SAVE_BEAT - 2, CONSOLE_START - 4, CONSOLE_START + 4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );
  // "saved ✓" confirm pulse after the chip lands.
  const savedOpacity = kitFadeIn(frame, SAVE_BEAT + 18, 10);
  const dbY = RECEIPT_Y + 132;

  return (
    <>
      {/* Travelling content-address chip. */}
      <div
        style={{
          position: "absolute",
          left: WIDTH / 2 - 70,
          top: dbY - 44 + travel,
          width: 140,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 9,
          color: COLORS.rewrite,
          opacity: chipOpacity,
        }}
      >
        ⛓ {HASH_H2_SHORT}
      </div>
      {/* DB glyph + label. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: dbY,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          opacity: dbOpacity,
        }}
      >
        <div style={{ fontSize: 22 }}>🛢️</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.muted,
          }}
        >
          <span>→ Postgres</span>
          <span
            style={{
              color: COLORS.execute,
              fontWeight: 700,
              opacity: savedOpacity,
            }}
          >
            saved ✓
          </span>
        </div>
      </div>
    </>
  );
};

// ── Beat E — the dark operator-console audit explorer ─────────────────

interface ConsoleSeed {
  readonly kind: Parameters<typeof ConsoleRow>[0]["kind"];
  readonly time: string;
  readonly intentKind: string;
  readonly hash: string;
}

// Two prior rows already in the explorer; our fresh REWRITE lands on top.
const PRIOR_ROWS: ReadonlyArray<ConsoleSeed> = [
  {
    kind: "execute",
    time: "11:31:54.077Z",
    intentKind: "cache.invalidate",
    hash: "sha256:1c0d…77af",
  },
  {
    kind: "refuse",
    time: "11:31:40.512Z",
    intentKind: "secrets.read",
    hash: "sha256:b42e…0931",
  },
];

const ConsolePanel: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < CONSOLE_START - 8) return null;

  // The dark panel crossfades in over the light stage, holds, then clears
  // before the loop seam so frame 0 (all-light) matches frame DURATION.
  const panelOpacity = interpolate(
    frame,
    [CONSOLE_START, CONSOLE_START + 18, LIGHTS_OUT, LIGHTS_OUT + 24],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );
  if (panelOpacity <= 0) return null;

  const panelW = 540;
  const panelH = 560;
  const panelX = WIDTH / 2 - panelW / 2;
  const panelY = 96;

  // The fresh REWRITE row drops in from above the list.
  const freshIn = kitFadeIn(frame, CONSOLE_START + 14, 16);
  const freshTranslate = interpolate(
    frame,
    [CONSOLE_START + 14, CONSOLE_START + 32],
    [-16, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
  );

  // Prior rows fade in slightly staggered beneath it.
  const priorOpacity = (i: number) =>
    kitFadeIn(frame, CONSOLE_START + 22 + i * 8, 16);

  // "live" indicator ticks on once the panel is up.
  const liveOpacity = kitFadeIn(frame, CONSOLE_START + 20, 14);

  return (
    <div
      style={{
        position: "absolute",
        left: panelX,
        top: panelY,
        width: panelW,
        minHeight: panelH,
        borderRadius: 18,
        background: CONSOLE.canvas,
        border: `1px solid ${CONSOLE.edge}`,
        boxShadow: SHADOW.consolePanel,
        opacity: panelOpacity,
        overflow: "hidden",
        // faint inner dark grid feel via subtle top sheen
        backgroundImage: `radial-gradient(${CONSOLE.edge} 1px, transparent 1px)`,
        backgroundSize: "26px 26px",
      }}
    >
      {/* Console header. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${CONSOLE.edge}`,
          background: CONSOLE.panel,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: CONSOLE.muted,
          }}
        >
          operator console · audit explorer
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.execute,
            opacity: liveOpacity,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: COLORS.execute,
              display: "inline-block",
            }}
          />
          live
        </span>
      </div>

      {/* Row list — the fresh REWRITE on top, priors beneath. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 18,
        }}
      >
        <div
          style={{
            opacity: freshIn,
            transform: `translateY(${freshTranslate}px)`,
          }}
        >
          <ConsoleRow
            kind="rewrite"
            time="11:32:08.421Z"
            intentKind="deployment.approval.request"
            hash={HASH_H2_SHORT}
            width={panelW - 36}
            fresh
          />
        </div>
        {PRIOR_ROWS.map((r, i) => (
          <ConsoleRow
            key={r.hash}
            kind={r.kind}
            time={r.time}
            intentKind={r.intentKind}
            hash={r.hash}
            width={panelW - 36}
            opacity={priorOpacity(i)}
            translateY={(1 - priorOpacity(i)) * 8}
          />
        ))}
      </div>
    </div>
  );
};

// ── Kinetic captions naming each of the four steps ────────────────────

const StepCaptions: React.FC<{ frame: number }> = ({ frame }) => {
  // Each caption owns a window; we render at most one (the active band).
  // Captions are measured from their own start (delay 0) and live in the
  // lower third. Dark grading kicks in once the console panel is up.
  const captions: ReadonlyArray<{
    start: number;
    end: number;
    eyebrow: string;
    text: string;
    dark: boolean;
    color: string;
  }> = [
    {
      start: 16,
      end: 92,
      eyebrow: "step 1 · intent",
      text: "The agent acts.",
      dark: false,
      color: COLORS.muted,
    },
    {
      start: 96,
      end: 150,
      eyebrow: "step 2 · the guard",
      text: "The kernel decides.",
      dark: false,
      color: COLORS.escalate,
    },
    {
      start: 156,
      end: 248,
      eyebrow: "step 2 · outcome",
      text: "Rewrite — the payload is clamped.",
      dark: false,
      color: COLORS.rewrite,
    },
    {
      start: SAVE_START + 6,
      end: CONSOLE_START - 4,
      eyebrow: "step 3 · receipt",
      text: "A signed receipt is saved.",
      dark: false,
      color: COLORS.execute,
    },
    {
      start: CONSOLE_START + 18,
      end: LIGHTS_OUT,
      eyebrow: "step 4 · console",
      text: "The operator console displays it.",
      dark: true,
      color: COLORS.confirm,
    },
  ];

  const active = captions.find((c) => frame >= c.start && frame < c.end);
  if (!active) return null;

  // Fade the caption out near the end of its window so the swap is clean.
  const windowOut = interpolate(
    frame,
    [active.end - 12, active.end],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );

  return (
    <div style={{ opacity: windowOut }}>
      <Caption
        frame={frame - active.start}
        eyebrow={active.eyebrow}
        text={active.text}
        bottom={56}
        dark={active.dark}
        eyebrowColor={active.color}
      />
    </div>
  );
};
