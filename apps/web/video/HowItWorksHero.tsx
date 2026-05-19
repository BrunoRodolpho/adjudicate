import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "./tokens";

/**
 * HowItWorksHero — the 10-second sizzle reel mounted at the top of
 * apps/web/src/sections/HowItWorks.tsx.
 *
 * Hard discipline (per plan, do not violate):
 *   - 10s cap (300 frames @ 30fps)
 *   - 5 scenes (Frame 2 absorbed; the threading scenario carries its
 *     narrative beat via REWRITE in Scene 3)
 *   - No voiceover, ever
 *   - REWRITE is the iconic decision: longest beat (~0.9s vs ~0.6s),
 *     animates second after EXECUTE establishes baseline
 *   - Loop seamlessly back to blank at frame 300
 *
 * Beat allocation:
 *   0-45    (1.5s)  Scene 1 — baseline normal flow
 *   45-90   (1.5s)  Scene 2 — kernel materialises mid-arrow
 *   90-210  (4.0s)  Scene 3 — six decisions one at a time
 *   210-255 (1.5s)  Scene 4 — Packs snap into the kernel
 *   255-285 (1.0s)  Scene 5 — audit record materialises
 *   285-300 (0.5s)  fade back to blank for loop
 */

export const FPS = 30;
export const DURATION_FRAMES = 300; // 10 seconds
export const WIDTH = 1280;
export const HEIGHT = 720;

export const HowItWorksHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Loop seam — fade in over the first 12 frames AND fade out over the
  // last 12, so opacity at frame 0 == opacity at frame durationInFrames.
  // Removes the visible cut at the loop boundary that the v0.1 had.
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) },
  );
  const loopFade = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.canvas,
        fontFamily: FONT_SANS,
      }}
    >
      {/* Inner wrapper carries the seam-fade opacity so the canvas-cream
          background ALWAYS renders. If opacity were on the outer
          AbsoluteFill, the background would fade with the content and
          the <video> element's default black bg would flash through at
          the loop seam. */}
      <AbsoluteFill style={{ opacity: loopFade }}>
        <Sequence from={0} durationInFrames={90}>
          <SceneBaselineThenKernel />
        </Sequence>
        <Sequence from={90} durationInFrames={120}>
          <SceneSixDecisions />
        </Sequence>
        <Sequence from={210} durationInFrames={45}>
          <ScenePacks />
        </Sequence>
        <Sequence from={255} durationInFrames={30}>
          <SceneAudit />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Scene 1 + 2 — Baseline → kernel inserts ─────────────────────────────

const SceneBaselineThenKernel: React.FC = () => {
  const frame = useCurrentFrame();
  // Agent fades in 0-15, arrow extends 15-30, production fades in 20-35.
  const agentOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const arrowProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const productionOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Kernel materialises mid-arrow at frame 45.
  const kernelScale = spring({
    frame: frame - 45,
    fps: FPS,
    config: { damping: 12, stiffness: 100 },
  });
  const kernelVisible = frame >= 45;
  // Original arrow shifts to make room for kernel.
  const arrowSplit = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          fontFamily: FONT_MONO,
          fontSize: 22,
        }}
      >
        <Pill label="Agent" opacity={agentOpacity} />
        <Arrow progress={arrowProgress} shrink={arrowSplit} />
        {kernelVisible ? (
          <KernelBlock scale={kernelScale} />
        ) : null}
        {kernelVisible ? <Arrow progress={arrowSplit} /> : null}
        <ProductionCluster opacity={productionOpacity} />
      </div>
      <Caption
        text={frame < 45 ? "Most systems do whatever they're told." : "Insert a control layer."}
        frame={frame}
      />
    </AbsoluteFill>
  );
};

// ── Scene 3 — Six possible decisions (REWRITE iconic) ──────────────────

const DECISIONS = [
  { kind: "EXECUTE", label: "Execute", plain: "run as-is", color: COLORS.execute },
  { kind: "REWRITE", label: "Rewrite", plain: "modify safely", color: COLORS.rewrite },
  { kind: "REFUSE", label: "Refuse", plain: "block with a reason", color: COLORS.refuse },
  { kind: "DEFER", label: "Defer", plain: "wait for a signal", color: COLORS.defer },
  { kind: "ESCALATE", label: "Escalate", plain: "require a human", color: COLORS.escalate },
  { kind: "REQUEST_CONFIRMATION", label: "Confirm", plain: "ask the caller", color: COLORS.confirm },
] as const;

// Beat schedule within Scene 3 (relative to scene start).
// EXECUTE: 0-18 (0.6s), REWRITE: 18-45 (0.9s — iconic), REFUSE: 45-63,
// DEFER: 63-81, ESCALATE: 81-99, CONFIRM: 99-117, all-light: 117-120.
const BEATS: ReadonlyArray<{ start: number; end: number }> = [
  { start: 0, end: 18 },
  { start: 18, end: 45 },
  { start: 45, end: 63 },
  { start: 63, end: 81 },
  { start: 81, end: 99 },
  { start: 99, end: 117 },
];

const SceneSixDecisions: React.FC = () => {
  const frame = useCurrentFrame();
  const showAllLit = frame >= 117;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 40 }}>
      <KernelBlock scale={1} small />
      <div
        style={{
          marginTop: 36,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          maxWidth: 920,
        }}
      >
        {DECISIONS.map((d, i) => {
          const beat = BEATS[i]!;
          const isActive = frame >= beat.start && frame < beat.end;
          const isLit = showAllLit || isActive;
          return (
            <DecisionCard
              key={d.kind}
              label={d.label}
              plain={d.plain}
              color={d.color}
              lit={isLit}
              active={isActive}
              showRewriteMorph={d.kind === "REWRITE"}
              localFrame={frame - beat.start}
            />
          );
        })}
      </div>
      <Caption text="Six possible decisions." frame={frame} />
    </AbsoluteFill>
  );
};

const DecisionCard: React.FC<{
  label: string;
  plain: string;
  color: string;
  lit: boolean;
  active: boolean;
  showRewriteMorph: boolean;
  localFrame: number;
}> = ({ label, plain, color, lit, active, showRewriteMorph, localFrame }) => {
  // Inactive ghost = low-opacity outline; active = full color + bg tint;
  // showAllLit (final hero moment) = full color but no bg tint.
  const borderColor = lit ? color : COLORS.edge;
  const opacity = lit ? 1 : 0.35;
  const bgColor = active ? `${color}1A` : COLORS.surface; // 10% tint when active
  // REWRITE morph: 100 → 25 over the active beat. Eased so the number
  // decelerates instead of counting down linearly — feels deliberate,
  // not mechanical.
  const morphProgress = active && showRewriteMorph
    ? interpolate(localFrame, [3, 24], [100, 25], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 100;
  return (
    <div
      style={{
        borderRadius: 12,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        opacity,
        padding: 18,
        transition: "none",
      }}
    >
      <div style={{ color, fontWeight: 700, fontSize: 20 }}>{label}</div>
      <div style={{ color: COLORS.muted, fontSize: 14, marginTop: 4 }}>{plain}</div>
      {showRewriteMorph ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: FONT_MONO,
            fontSize: 13,
            color: active ? COLORS.rewrite : COLORS.faint,
          }}
        >
          rampPercent: {Math.round(morphProgress)}{morphProgress !== 25 ? " → 25" : ""}
        </div>
      ) : null}
    </div>
  );
};

// ── Scene 4 — Packs snap in ────────────────────────────────────────────

const PACKS = ["pix", "kyc", "deployments"] as const;

const ScenePacks: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {PACKS.map((p, i) => {
          const start = i * 6;
          const t = spring({
            frame: frame - start,
            fps: FPS,
            config: { damping: 14, stiffness: 140 },
          });
          return (
            <div
              key={p}
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * -20}px)`,
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: COLORS.muted,
                background: COLORS.surface,
                border: `1px solid ${COLORS.edge}`,
                padding: "6px 14px",
                borderRadius: 8,
              }}
            >
              {p}
            </div>
          );
        })}
      </div>
      <div style={{ color: COLORS.faint, fontSize: 14 }}>↓ snap into ↓</div>
      <div style={{ marginTop: 24 }}>
        <KernelBlock scale={1} />
      </div>
      <Caption text="Domain semantics, universal algebra." frame={frame} />
    </AbsoluteFill>
  );
};

// ── Scene 5 — Audit record materialises ────────────────────────────────

const AUDIT_LINES = [
  '{',
  '  intentHash: "sha256:9f4c…",',
  '  intentKind: "deployment.approval.request",',
  '  decision: "REWRITE",',
  '  basis: ["business:QUANTITY_CAPPED"],',
  '  rewrittenPayload: { rampPercent: 25 },',
  '  packId: "deployments-approval",',
  '  at: "2026-05-14T11:32:08Z",',
  '  durationMs: 0.42',
  '}',
];

const SceneAudit: React.FC = () => {
  const frame = useCurrentFrame();
  // Lines reveal one at a time over 30 frames.
  const linesShown = Math.min(
    AUDIT_LINES.length,
    Math.floor(interpolate(frame, [0, 24], [0, AUDIT_LINES.length])),
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 560,
          width: "85%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.edge}`,
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: COLORS.faint,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          AuditRecord (real fields, real values)
        </div>
        <pre
          style={{
            margin: 0,
            background: COLORS.canvas,
            padding: 16,
            borderRadius: 8,
            fontFamily: FONT_MONO,
            fontSize: 13,
            lineHeight: 1.55,
            color: COLORS.ink,
            whiteSpace: "pre-wrap",
          }}
        >
          {AUDIT_LINES.slice(0, linesShown).join("\n")}
        </pre>
      </div>
      <Caption text="Reconstruct why your AI system acted." frame={frame} />
    </AbsoluteFill>
  );
};

// ── Visual atoms ───────────────────────────────────────────────────────

const Pill: React.FC<{ label: string; opacity: number }> = ({ label, opacity }) => (
  <div
    style={{
      opacity,
      padding: "10px 16px",
      borderRadius: 10,
      background: COLORS.surface,
      border: `1px solid ${COLORS.edge}`,
      color: COLORS.ink,
      fontFamily: FONT_MONO,
    }}
  >
    {label}
  </div>
);

const Arrow: React.FC<{ progress: number; shrink?: number }> = ({ progress, shrink = 0 }) => {
  const fullWidth = 80;
  const width = fullWidth * (1 - shrink * 0.5) * progress;
  return (
    <div
      style={{
        width: fullWidth,
        height: 4,
        position: "relative",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width,
          height: 2,
          background: COLORS.faint,
          borderRadius: 1,
        }}
      />
      {progress > 0.95 ? (
        <div
          style={{
            position: "absolute",
            left: width - 8,
            width: 0,
            height: 0,
            borderLeft: `8px solid ${COLORS.faint}`,
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
          }}
        />
      ) : null}
    </div>
  );
};

const KernelBlock: React.FC<{ scale: number; small?: boolean }> = ({ scale, small }) => {
  const dim = small ? 80 : 120;
  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: 20,
        background: GRADIENT_PRIMARY,
        boxShadow: "0 12px 40px rgba(99,102,241,0.35)",
        transform: `scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        textAlign: "center",
        padding: 12,
      }}
    >
      <div style={{ opacity: 0.85 }}>control</div>
      <div style={{ opacity: 0.85 }}>layer</div>
    </div>
  );
};

const ProductionCluster: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      opacity,
      padding: "10px 14px",
      borderRadius: 10,
      background: COLORS.surface,
      border: `1px solid ${COLORS.edge}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      fontFamily: FONT_MONO,
    }}
  >
    <div style={{ fontSize: 11, color: COLORS.faint }}>production systems</div>
    <div style={{ fontSize: 22, letterSpacing: 4 }}>🗄️ ☁️ 💳 👤 🚀</div>
  </div>
);

const Caption: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 64,
        left: 0,
        right: 0,
        textAlign: "center",
        color: COLORS.muted,
        fontSize: 18,
        opacity,
        fontWeight: 500,
      }}
    >
      {text}
    </div>
  );
};
