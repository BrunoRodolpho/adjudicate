import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /data-flow OG — the receipt pipeline: kernel → Postgres → console.
 * A decision becomes a signed AuditRecord, persisted, then surfaced in
 * the operator console. The product's data spine in one line.
 */

export const DataFlowOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          top: -160,
          left: "40%",
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.13,
          filter: "blur(90px)",
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
          adjudicate · data flow
        </div>
        <div>
          <h1
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            From decision
            <br />
            to{" "}
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              durable record
            </span>
            .
          </h1>
          <div style={{ marginTop: 56 }}>
            <Pipeline />
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
          <span>decision → AuditRecord → persisted → displayed</span>
          <span style={{ color: COLORS.ink }}>adjudicate.dev/data-flow</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Pipeline: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
    <Stage
      caps="decide"
      title="kernel"
      gradient
      sub="six outcomes"
    />
    <Arrow caption="receipt" />
    <Stage caps="persist" title="Postgres" sub="signed AuditRecord" />
    <Arrow caption="query" />
    <Stage caps="surface" title="console" sub="audit explorer" accent={COLORS.confirm} />
  </div>
);

const Stage: React.FC<{
  caps: string;
  title: string;
  sub: string;
  gradient?: boolean;
  accent?: string;
}> = ({ caps, title, sub, gradient = false, accent }) => (
  <div
    style={{
      width: 240,
      padding: "24px 26px",
      borderRadius: 20,
      background: gradient ? GRADIENT_PRIMARY : COLORS.surface,
      border: gradient ? "none" : `2px solid ${accent ?? COLORS.edge}`,
      boxShadow: gradient
        ? "0 16px 48px rgba(99,102,241,0.35)"
        : "0 2px 8px rgba(0,0,0,0.04)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 14,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: gradient ? "rgba(255,255,255,0.85)" : COLORS.faint,
      }}
    >
      {caps}
    </span>
    <span
      style={{
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        color: gradient ? "white" : COLORS.ink,
      }}
    >
      {title}
    </span>
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 16,
        color: gradient ? "rgba(255,255,255,0.8)" : COLORS.muted,
      }}
    >
      {sub}
    </span>
  </div>
);

const Arrow: React.FC<{ caption: string }> = ({ caption }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}
  >
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: COLORS.faint,
      }}
    >
      {caption}
    </span>
    <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
      <line x1="0" y1="10" x2="40" y2="10" stroke={COLORS.faint} strokeWidth="2.5" />
      <polyline
        points="34,4 40,10 34,16"
        fill="none"
        stroke={COLORS.faint}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);
