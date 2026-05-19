import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /architecture OG — kernel block flanked by phase labels (state →
 * taint → auth → business). Reinforces the "ordered phases" insight
 * that the depth route covers.
 */

const PHASES = ["state", "taint", "auth", "business"] as const;

export const ArchitectureOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          top: -150,
          left: -150,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.15,
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 80,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.muted,
          }}
        >
          adjudicate · architecture
        </div>
        <div>
          <h1
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            The mechanism,
            <br />
            in detail.
          </h1>
          <div
            style={{
              marginTop: 56,
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontFamily: FONT_MONO,
              fontSize: 22,
            }}
          >
            <Pill label="intent" tone="muted" />
            <Arrow />
            <Phases />
            <Arrow />
            <Pill label="decision" tone="ink" />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            color: COLORS.faint,
            fontSize: 18,
            fontFamily: FONT_MONO,
          }}
        >
          <span>state → taint → auth → business</span>
          <span style={{ color: COLORS.ink }}>adjudicate.dev/architecture</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Phases: React.FC = () => (
  <div
    style={{
      display: "flex",
      gap: 8,
      padding: "16px 20px",
      borderRadius: 16,
      background: GRADIENT_PRIMARY,
      boxShadow: "0 16px 48px rgba(99,102,241,0.35)",
    }}
  >
    {PHASES.map((p) => (
      <span
        key={p}
        style={{
          color: "white",
          fontFamily: FONT_MONO,
          fontSize: 18,
          padding: "6px 12px",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 8,
          letterSpacing: "0.05em",
        }}
      >
        {p}
      </span>
    ))}
  </div>
);

const Pill: React.FC<{ label: string; tone: "muted" | "ink" }> = ({ label, tone }) => (
  <div
    style={{
      padding: "16px 28px",
      borderRadius: 16,
      background: COLORS.surface,
      border: `2px solid ${COLORS.edge}`,
      color: tone === "ink" ? COLORS.ink : COLORS.muted,
      fontFamily: FONT_MONO,
      fontSize: 22,
    }}
  >
    {label}
  </div>
);

const Arrow: React.FC = () => (
  <svg width="40" height="20" viewBox="0 0 40 20" fill="none">
    <line x1="0" y1="10" x2="32" y2="10" stroke={COLORS.faint} strokeWidth="2.5" />
    <polyline
      points="26,4 32,10 26,16"
      fill="none"
      stroke={COLORS.faint}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);
