import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  // background / depth
  DottedGrid,
  AmbientGlow,
  Vignette,
  Grain,
  // scene primitives
  KernelCube,
  EnvelopeCard,
  type EnvelopeField,
  DecisionBadge,
  DECISION_ORDER,
  ReceiptCard,
  type ReceiptRow,
  ConsoleRow,
  Caption,
  // motion
  EASE_OUT,
  EASE_SOFT,
  SPRING_WEIGHTY,
  SPRING_SETTLE,
  fadeIn,
  rise,
  seam,
  // tokens
  COLORS,
  CONSOLE,
  SHADOW,
  FONT_SANS,
  FONT_MONO,
  SECTION_CAPS_TRACKING,
  DECISIONS,
  type DecisionKind,
} from "./components";

/**
 * HowItWorksHero — the canonical 4-STEP STORY FILM (the /how-it-works
 * sizzle). Rebuilt to carry the product's full spine end to end, one
 * professionally-paced scene per step, composing the shared scene kit
 * (video/components/*) with the single easing system in video/motion.ts.
 *
 * THE NARRATIVE (all four steps, in order — the prior cut stopped at the
 * audit record and never reached the console):
 *
 *   STEP 1 / 4 — AI acts      0–120   (0.0–4.0s)  an EnvelopeCard intent
 *                                                  payload appears.
 *   STEP 2 / 4 — Guard decides 120–276 (4.0–9.2s) the KernelCube + the six
 *                                                  DecisionBadges, resolving
 *                                                  to REWRITE (the iconic,
 *                                                  load-bearing outcome).
 *   STEP 3 / 4 — Receipt saved 276–432 (9.2–14.4s) a ReceiptCard materialises
 *                                                  field-by-field, then a
 *                                                  "saved to Postgres" beat
 *                                                  seals it.
 *   STEP 4 / 4 — Console       432–576 (14.4–19.2s) ConsoleRows stream into a
 *                                                  dark audit-explorer; the
 *                                                  fresh REWRITE receipt lands
 *                                                  on top.
 *
 * Silent (no audio). 19.2 seconds · 30fps · 1280×720 landscape.
 *
 * Production-quality motion bar (applied throughout):
 *   - ONE easing system: EASE_OUT (expo-out decel) for entrances, EASE_SOFT
 *     for cross-fades; over-damped springs only (no bounce).
 *   - Layered depth: DottedGrid + AmbientGlow + soft SHADOW presets.
 *   - Filmic pass: Vignette + tiled Grain on every scene (dark variants on
 *     the console beat).
 *   - Palette-consistent grading; the six decision colors stay authoritative.
 *   - Frame-accurate beat timing; kinetic lower-third Captions with
 *     0.18em section-caps eyebrows ("STEP n / 4").
 *   - Loop seam: fade in first 8 frames, out last 24, on an inner wrapper
 *     so the canvas background never flashes at the boundary. The film ends
 *     on the dark console, so the seam carries a soft cross-grade back to
 *     the cream canvas of step 1.
 *
 * Root.tsx imports FPS / WIDTH / HEIGHT / DURATION_FRAMES — contract kept;
 * only DURATION_FRAMES changed (300 → 576) to fit the four scenes. Do NOT
 * change Root.tsx.
 */

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

// ── Per-step frame ranges (absolute, on the master timeline) ──────────
const STEP1_START = 0;
const STEP1_LEN = 120; // 0–120    AI acts
const STEP2_START = 120;
const STEP2_LEN = 156; // 120–276  Guard decides
const STEP3_START = 276;
const STEP3_LEN = 156; // 276–432  Receipt saved
const STEP4_START = 432;
const STEP4_LEN = 144; // 432–576  Console displays

export const DURATION_FRAMES =
  STEP1_LEN + STEP2_LEN + STEP3_LEN + STEP4_LEN; // 576 (19.2s)

const CENTER_X = WIDTH / 2; // 640

// Synthetic-but-real-shaped audit identity, threaded across steps so the
// eye connects the REWRITE intent → its receipt → its console row.
const INTENT_KIND = "deployment.approval.request";
const RECEIPT_HASH = "sha256:3a01…8a91";
const RECEIPT_TIME = "11:32:08.421Z";

// ── Top-level composition ─────────────────────────────────────────────

export const HowItWorksHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const seamOpacity = seam(frame, durationInFrames, 8, 24);

  return (
    <AbsoluteFill
      style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}
    >
      {/* Inner wrapper carries the seam opacity so the outer cream canvas
          never fades — no <video> default-black flash at the loop seam. */}
      <AbsoluteFill style={{ opacity: seamOpacity }}>
        <Sequence from={STEP1_START} durationInFrames={STEP1_LEN}>
          <Step1AiActs />
        </Sequence>
        <Sequence from={STEP2_START} durationInFrames={STEP2_LEN}>
          <Step2GuardDecides />
        </Sequence>
        <Sequence from={STEP3_START} durationInFrames={STEP3_LEN}>
          <Step3ReceiptSaved />
        </Sequence>
        <Sequence from={STEP4_START} durationInFrames={STEP4_LEN}>
          <Step4Console />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── STEP 1 / 4 — AI acts ───────────────────────────────────────────────
// An agent emits an intent; the EnvelopeCard payload glides up into frame
// and a faint arrow reaches toward production — the action that is about
// to be intercepted.

const Step1AiActs: React.FC = () => {
  const frame = useCurrentFrame();

  // Agent label settles in first.
  const agentOpacity = fadeIn(frame, 6, 16);
  const agentRise = rise(frame, 6, 20, 14);

  // The envelope materialises mid-scene and glides up to rest.
  const envIn = spring({ frame: frame - 24, fps: FPS, config: SPRING_SETTLE });
  const envOpacity = fadeIn(frame, 24, 18);
  const envY = 300 - rise(frame, 24, 26, 26); // settles to y=300

  // A faint reaching arrow toward production (the unguarded action).
  const arrowProgress = interpolate(frame, [44, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const targetOpacity = fadeIn(frame, 58, 18);

  const fields: ReadonlyArray<EnvelopeField> = [
    { key: "action", value: '"promote"' },
    { key: "service", value: '"checkout-api"' },
    { key: "rampPercent", value: 100, valueWeight: 700 },
  ];

  return (
    <AbsoluteFill>
      <DottedGrid frame={frame} total={STEP1_LEN} opacity={0.35} />
      <AmbientGlow
        frame={frame}
        total={STEP1_LEN}
        x={CENTER_X}
        y={300}
        size={520}
        opacity={0.4}
      />

      {/* Agent → arrow → production lane. */}
      <NodeLabel
        x={232}
        y={300}
        label="AI agent"
        sub="emits intent"
        opacity={agentOpacity}
        translateY={agentRise}
      />
      <ReachArrow
        x1={336}
        x2={1004}
        y={300}
        progress={arrowProgress}
        color={COLORS.faint}
      />
      <NodeLabel
        x={1048}
        y={300}
        label="production"
        sub="checkout-api"
        opacity={targetOpacity}
        translateY={rise(frame, 58, 20, 12)}
        align="right"
      />

      {/* The intent envelope, centered over the lane. */}
      <EnvelopeCard
        x={CENTER_X}
        y={envY}
        width={196}
        opacity={envOpacity}
        scale={0.9 + envIn * 0.1}
        dashed
        borderColor={COLORS.muted}
        title={INTENT_KIND}
        fields={fields}
        zIndex={6}
      />

      <Caption
        frame={frame}
        eyebrow="STEP 1 / 4"
        text="An AI agent tries to act."
        delay={10}
      />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

// ── STEP 2 / 4 — Guard decides ─────────────────────────────────────────
// The control-layer kernel materialises; the six possible outcomes light
// in canonical order, then everything dims except REWRITE — the resolved,
// iconic decision — which scales up as a hero pill.

// Local beat schedule (relative to step start). Each badge lights in
// canonical order; REWRITE (index 1) is held longest as the resolution.
const BADGE_BEATS: ReadonlyArray<number> = [40, 52, 64, 76, 88, 100];
const RESOLVE_AT = 116; // dim the others, hero the REWRITE pill

const Step2GuardDecides: React.FC = () => {
  const frame = useCurrentFrame();

  // Kernel arrives with weight, holds, then drifts up to make room for the
  // resolved hero pill.
  const kernelIn = spring({ frame: frame - 6, fps: FPS, config: SPRING_WEIGHTY });
  const kernelOpacity = fadeIn(frame, 6, 18);
  const kernelY = 250 - rise(frame, 6, 28, 30);

  // After resolution, a soft rewrite-warm tint flashes across the kernel.
  const morphTint = interpolate(
    frame,
    [RESOLVE_AT, RESOLVE_AT + 16, RESOLVE_AT + 40],
    [0, 0.5, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );

  // The hero REWRITE pill grows after resolution.
  const heroIn = spring({
    frame: frame - RESOLVE_AT,
    fps: FPS,
    config: SPRING_SETTLE,
  });
  const heroOpacity = fadeIn(frame, RESOLVE_AT, 14);

  return (
    <AbsoluteFill>
      <DottedGrid frame={frame} total={STEP2_LEN} opacity={0.35} />
      <AmbientGlow
        frame={frame}
        total={STEP2_LEN}
        x={CENTER_X}
        y={250}
        size={560}
        opacity={0.5}
      />

      {/* The kernel, centered above the decision row. */}
      <div
        style={{
          position: "absolute",
          left: CENTER_X,
          top: kernelY,
          transform: "translate(-50%, -50%)",
          zIndex: 5,
        }}
      >
        <KernelCube
          frame={frame}
          size={132}
          scale={0.85 + kernelIn * 0.15}
          opacity={kernelOpacity}
          pulseStart={6}
          tint={COLORS.rewrite}
          tintOpacity={morphTint}
        />
      </div>

      {/* The six possible decisions, lit one at a time, then dimmed to all
          but the resolved REWRITE. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 372,
          display: "flex",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
          maxWidth: 940,
          margin: "0 auto",
          zIndex: 4,
        }}
      >
        {DECISION_ORDER.map((kind, i) => {
          const lit = fadeIn(frame, BADGE_BEATS[i]!, 10);
          // After resolution, dim everything except the resolved REWRITE.
          const dim =
            frame >= RESOLVE_AT && kind !== "rewrite"
              ? interpolate(frame, [RESOLVE_AT, RESOLVE_AT + 16], [1, 0.12], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: EASE_SOFT,
                })
              : 1;
          // The resolved REWRITE pops slightly in the row before the hero
          // pill takes over.
          const popScale =
            kind === "rewrite"
              ? interpolate(
                  frame,
                  [RESOLVE_AT, RESOLVE_AT + 12],
                  [1, 1.06],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE_OUT,
                  },
                )
              : 1;
          const ty = rise(frame, BADGE_BEATS[i]!, 14, 12);
          return (
            <div
              key={kind}
              style={{ transform: `translateY(${ty}px)` }}
            >
              <DecisionBadge
                kind={kind}
                opacity={lit * dim}
                scale={popScale}
                size="sm"
              />
            </div>
          );
        })}
      </div>

      {/* The resolved hero pill — REWRITE, large, centered below the row. */}
      {heroOpacity > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 452,
            display: "flex",
            justifyContent: "center",
            zIndex: 6,
          }}
        >
          <div style={{ transform: `scale(${0.9 + heroIn * 0.1})` }}>
            <HeroDecision frame={frame} kind="rewrite" opacity={heroOpacity} />
          </div>
        </div>
      ) : null}

      <Caption
        frame={frame}
        eyebrow="STEP 2 / 4"
        text="The guard decides — one of six outcomes."
        eyebrowColor={COLORS.rewrite}
        delay={8}
      />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

// ── STEP 3 / 4 — Receipt saved ─────────────────────────────────────────
// A signed AuditRecord materialises field-by-field, the sealed chip and
// content-address hash settle in, then a "saved to Postgres" beat confirms
// the receipt is durable.

const RECEIPT_ROWS: ReadonlyArray<ReceiptRow> = [
  { label: "intentKind", value: INTENT_KIND },
  { label: "decision", value: "REWRITE", valueColor: COLORS.rewrite, valueWeight: 700 },
  { label: "basis", value: "business:RAMP_CAPPED" },
  { label: "rewrote", value: "rampPercent 100 → 25", valueColor: COLORS.rewrite },
  { label: "packId", value: "deployments-approval" },
  { label: "at", value: "2026-06-08T11:32:08.421Z" },
];

const ROW_CASCADE_START = 28; // first row appears
const ROW_CASCADE_STEP = 9; // frames between rows
const SEALED_AT = ROW_CASCADE_START + RECEIPT_ROWS.length * ROW_CASCADE_STEP; // ~82
const SAVED_AT = 108; // "saved to Postgres" beat begins

const Step3ReceiptSaved: React.FC = () => {
  const frame = useCurrentFrame();

  const cardIn = spring({ frame: frame - 6, fps: FPS, config: SPRING_SETTLE });
  const cardOpacity = fadeIn(frame, 6, 16);
  const cardTranslateY = rise(frame, 6, 24, 22);

  const sealedOpacity = fadeIn(frame, SEALED_AT, 12);

  const rowOpacity = (i: number) =>
    fadeIn(frame, ROW_CASCADE_START + i * ROW_CASCADE_STEP, 10);

  // "saved to Postgres" pill: appears, holds, with a brief check pop.
  const savedOpacity = fadeIn(frame, SAVED_AT, 14);
  const savedRise = rise(frame, SAVED_AT, 18, 12);

  return (
    <AbsoluteFill>
      <DottedGrid frame={frame} total={STEP3_LEN} opacity={0.32} />
      <AmbientGlow
        frame={frame}
        total={STEP3_LEN}
        x={CENTER_X}
        y={300}
        size={560}
        opacity={0.34}
        inner="rgba(16,185,129,0.12)"
        outer="rgba(16,185,129,0.02)"
      />

      <div
        style={{
          opacity: cardOpacity,
          transform: `scale(${0.96 + cardIn * 0.04})`,
          transformOrigin: "center center",
        }}
      >
        <ReceiptCard
          x={CENTER_X}
          y={156}
          width={520}
          translateY={cardTranslateY}
          rows={RECEIPT_ROWS}
          rowOpacity={rowOpacity}
          hash={RECEIPT_HASH}
          sealedOpacity={sealedOpacity}
          sealedLabel="signed"
        />
      </div>

      {/* "Saved to Postgres" durability beat, below the card. */}
      {savedOpacity > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 540,
            display: "flex",
            justifyContent: "center",
            opacity: savedOpacity,
            transform: `translateY(${savedRise}px)`,
            zIndex: 6,
          }}
        >
          <SavedToDbPill frame={frame} />
        </div>
      ) : null}

      <Caption
        frame={frame}
        eyebrow="STEP 3 / 4"
        text="A signed receipt is saved."
        eyebrowColor={COLORS.execute}
        delay={8}
      />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

// ── STEP 4 / 4 — Console displays ──────────────────────────────────────
// A dark operator console (the audit explorer). Prior receipts are already
// present; the fresh REWRITE receipt streams in at the top, highlighted.

interface ConsoleEntry {
  readonly kind: DecisionKind;
  readonly time: string;
  readonly intentKind: string;
  readonly hash: string;
}

// Newest first. The top row is the receipt we just saved (fresh).
const CONSOLE_ENTRIES: ReadonlyArray<ConsoleEntry> = [
  { kind: "rewrite", time: RECEIPT_TIME, intentKind: INTENT_KIND, hash: RECEIPT_HASH },
  { kind: "execute", time: "11:31:54.107Z", intentKind: "payments.pix.transfer", hash: "sha256:7c2e…d1b4" },
  { kind: "refuse", time: "11:31:40.882Z", intentKind: "identity.kyc.override", hash: "sha256:b90a…41ff" },
  { kind: "escalate", time: "11:31:22.610Z", intentKind: "payments.pix.refund", hash: "sha256:1d77…0ac3" },
  { kind: "confirm", time: "11:31:05.349Z", intentKind: "deployment.rollback.request", hash: "sha256:e4b1…9772" },
  { kind: "defer", time: "11:30:48.018Z", intentKind: "identity.kyc.review", hash: "sha256:5a3c…62de" },
];

const ROW_HEIGHT = 56; // row + gap
const PANEL_TOP = 168;
const ROW_STREAM_START = 24;
const ROW_STREAM_STEP = 8;

const Step4Console: React.FC = () => {
  const frame = useCurrentFrame();

  // Console panel chrome settles in first.
  const panelOpacity = fadeIn(frame, 0, 16);
  const panelRise = rise(frame, 0, 22, 18);

  return (
    <AbsoluteFill style={{ backgroundColor: CONSOLE.canvas }}>
      <DottedGrid frame={frame} total={STEP4_LEN} opacity={0.5} dark />
      <AmbientGlow
        frame={frame}
        total={STEP4_LEN}
        x={CENTER_X}
        y={360}
        size={620}
        opacity={0.3}
        inner="rgba(99,102,241,0.14)"
        outer="rgba(99,102,241,0.02)"
        blur={40}
      />

      {/* Console window. */}
      <div
        style={{
          position: "absolute",
          left: CENTER_X,
          top: PANEL_TOP,
          transform: `translate(-50%, 0) translateY(${panelRise}px)`,
          width: 620,
          opacity: panelOpacity,
          background: CONSOLE.panel,
          border: `1px solid ${CONSOLE.edge}`,
          borderRadius: 16,
          boxShadow: SHADOW.consolePanel,
          padding: 16,
          zIndex: 4,
        }}
      >
        {/* Window titlebar. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 14,
            marginBottom: 12,
            borderBottom: `1px solid ${CONSOLE.edge}`,
          }}
        >
          <span style={{ display: "flex", gap: 6 }}>
            <Dot color="#FF5F57" />
            <Dot color="#FEBC2E" />
            <Dot color="#28C840" />
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: CONSOLE.muted,
              letterSpacing: SECTION_CAPS_TRACKING,
              textTransform: "uppercase",
            }}
          >
            audit explorer
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: CONSOLE.faint,
            }}
          >
            {CONSOLE_ENTRIES.length} receipts
          </span>
        </div>

        {/* Streaming rows (newest first). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CONSOLE_ENTRIES.map((e, i) => {
            const start = ROW_STREAM_START + i * ROW_STREAM_STEP;
            const o = fadeIn(frame, start, 12);
            const ty = rise(frame, start, 16, ROW_HEIGHT * 0.4);
            // The top row is the freshly-saved REWRITE receipt.
            const isFresh = i === 0;
            return (
              <ConsoleRow
                key={e.hash}
                kind={e.kind}
                time={e.time}
                intentKind={e.intentKind}
                hash={e.hash}
                width={588}
                opacity={o}
                translateY={ty}
                fresh={isFresh}
              />
            );
          })}
        </div>
      </div>

      <Caption
        frame={frame}
        eyebrow="STEP 4 / 4"
        text="The operator console displays every receipt."
        dark
        eyebrowColor={COLORS.confirm}
        delay={8}
      />
      <Vignette dark />
      <Grain dark />
    </AbsoluteFill>
  );
};

// ── Shared scene atoms (local to this composition) ─────────────────────

/** A small labelled node on the action lane (agent / production). */
const NodeLabel: React.FC<{
  x: number;
  y: number;
  label: string;
  sub: string;
  opacity: number;
  translateY: number;
  align?: "left" | "right";
}> = ({ x, y, label, sub, opacity, translateY, align = "left" }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) translateY(${translateY}px)`,
      opacity,
      textAlign: align,
      zIndex: 4,
    }}
  >
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.edge}`,
        borderRadius: 12,
        boxShadow: SHADOW.card,
        padding: "12px 18px",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 15,
          fontWeight: 600,
          color: COLORS.ink,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: COLORS.faint,
          marginTop: 3,
        }}
      >
        {sub}
      </div>
    </div>
  </div>
);

/** A faint horizontal arrow that draws left→right with a clamped head. */
const ReachArrow: React.FC<{
  x1: number;
  x2: number;
  y: number;
  progress: number;
  color: string;
}> = ({ x1, x2, y, progress, color }) => {
  const full = x2 - x1;
  const width = full * progress;
  return (
    <div
      style={{
        position: "absolute",
        left: x1,
        top: y,
        width: full,
        height: 2,
        transform: "translateY(-50%)",
        zIndex: 2,
      }}
    >
      <div
        style={{
          width,
          height: 2,
          background: color,
          borderRadius: 1,
          opacity: 0.55,
        }}
      />
      {progress > 0.96 ? (
        <div
          style={{
            position: "absolute",
            left: width - 7,
            top: -4,
            width: 0,
            height: 0,
            borderLeft: `8px solid ${color}`,
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            opacity: 0.55,
          }}
        />
      ) : null}
    </div>
  );
};

/**
 * HeroDecision — a larger, more emphatic version of the resolved decision
 * for the hero moment, with a soft glow halo behind the md DecisionBadge.
 */
const HeroDecision: React.FC<{
  frame: number;
  kind: DecisionKind;
  opacity: number;
}> = ({ frame, kind, opacity }) => {
  const { color } = DECISIONS[kind];
  // Gentle 1Hz halo breath so the resolved pill feels "live".
  const halo = 0.22 + 0.06 * Math.sin((frame / 30) * Math.PI * 2);
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: "scale(1.5)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -18,
          borderRadius: 999,
          background: color,
          filter: "blur(22px)",
          opacity: halo,
        }}
      />
      <span style={{ position: "relative" }}>
        <DecisionBadge kind={kind} size="md" />
      </span>
    </div>
  );
};

/** "Saved to Postgres" durability pill with a check that pops in. */
const SavedToDbPill: React.FC<{ frame: number }> = ({ frame }) => {
  const checkPop = spring({
    frame: frame - (SAVED_AT + 4),
    fps: FPS,
    config: SPRING_SETTLE,
  });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 999,
        background: `${COLORS.execute}14`,
        border: `1px solid ${COLORS.execute}`,
        boxShadow: SHADOW.card,
        fontFamily: FONT_MONO,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 999,
          background: COLORS.execute,
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          transform: `scale(${Math.min(1, checkPop)})`,
        }}
      >
        ✓
      </span>
      <span style={{ fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>
        saved to Postgres
      </span>
      <span
        style={{
          fontSize: 11,
          color: COLORS.faint,
          letterSpacing: "0.04em",
        }}
      >
        append-only
      </span>
    </div>
  );
};

/** A traffic-light dot for the console titlebar. */
const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      width: 10,
      height: 10,
      borderRadius: 999,
      background: color,
      display: "inline-block",
    }}
  />
);
