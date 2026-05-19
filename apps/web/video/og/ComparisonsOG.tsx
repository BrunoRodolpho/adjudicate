import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /comparisons OG — six decision-kind chips on a row, contrasting
 * with the binary allow/deny on the left. Drives home the "wedge"
 * argument visually.
 */

const DECISIONS = [
  { label: "Execute", color: COLORS.execute },
  { label: "Refuse", color: COLORS.refuse },
  { label: "Rewrite", color: COLORS.rewrite },
  { label: "Defer", color: COLORS.defer },
  { label: "Escalate", color: COLORS.escalate },
  { label: "Confirm", color: COLORS.confirm },
];

export const ComparisonsOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.12,
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
          adjudicate · vs OPA / Cedar
        </div>
        <div>
          <h1
            style={{
              fontSize: 80,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Why allow/deny
            <br />
            <span style={{ color: COLORS.refuse }}>isn&apos;t enough.</span>
          </h1>
          <div style={{ marginTop: 48, display: "flex", alignItems: "center", gap: 32 }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "16px 20px",
                borderRadius: 16,
                background: COLORS.surface,
                border: `2px solid ${COLORS.edge}`,
              }}
            >
              <Pill label="allow" muted />
              <Pill label="deny" muted />
            </div>
            <span style={{ fontSize: 32, color: COLORS.faint }}>→</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxWidth: 720 }}>
              {DECISIONS.map((d) => (
                <ColorPill key={d.label} label={d.label} color={d.color} />
              ))}
            </div>
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
          <span>permission engines → execution mediation</span>
          <span style={{ color: COLORS.ink }}>adjudicate.dev/comparisons</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Pill: React.FC<{ label: string; muted?: boolean }> = ({ label, muted }) => (
  <span
    style={{
      padding: "10px 20px",
      borderRadius: 999,
      fontFamily: FONT_MONO,
      fontSize: 20,
      color: muted ? COLORS.muted : COLORS.ink,
      background: COLORS.canvas,
    }}
  >
    {label}
  </span>
);

const ColorPill: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span
    style={{
      padding: "12px 22px",
      borderRadius: 999,
      fontFamily: FONT_MONO,
      fontSize: 20,
      fontWeight: 600,
      color,
      background: `${color}1A`,
      border: `2px solid ${color}66`,
    }}
  >
    {label}
  </span>
);
