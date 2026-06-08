import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /deploy OG — in-process placement. The kernel sits inside the host
 * application process, on the path between AI intent and side effects —
 * not a network hop, not a sidecar. A nested "process" frame makes the
 * placement legible.
 */

export const DeployOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          bottom: -180,
          right: -160,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.13,
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
          adjudicate · deploy
        </div>
        <div>
          <h1
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            In your process.
            <br />
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              On the call path.
            </span>
          </h1>
          <div style={{ marginTop: 52 }}>
            <ProcessDiagram />
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
          <span>no sidecar · no network hop · same call stack</span>
          <span style={{ color: COLORS.ink }}>adjudicate.dev/deploy</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProcessDiagram: React.FC = () => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: 22,
      borderRadius: 24,
      background: COLORS.surface,
      border: `2px dashed ${COLORS.edge}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}
  >
    <Label caps="your app process" />
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "18px 22px",
        borderRadius: 16,
        background: COLORS.canvas,
        border: `1.5px solid ${COLORS.edge}`,
      }}
    >
      <Node label="AI intent" tone="muted" />
      <Arrow />
      <Kernel />
      <Arrow />
      <Node label="side effect" tone="ink" />
    </div>
  </div>
);

const Label: React.FC<{ caps: string }> = ({ caps }) => (
  <span
    style={{
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontFamily: FONT_MONO,
      fontSize: 13,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: COLORS.faint,
      padding: "0 10px",
    }}
  >
    {caps}
  </span>
);

const Node: React.FC<{ label: string; tone: "muted" | "ink" }> = ({
  label,
  tone,
}) => (
  <div
    style={{
      padding: "16px 24px",
      borderRadius: 14,
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

const Kernel: React.FC = () => (
  <div
    style={{
      padding: "16px 28px",
      borderRadius: 14,
      background: GRADIENT_PRIMARY,
      boxShadow: "0 16px 48px rgba(99,102,241,0.35)",
      color: "white",
      fontFamily: FONT_MONO,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: "0.04em",
    }}
  >
    kernel
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
