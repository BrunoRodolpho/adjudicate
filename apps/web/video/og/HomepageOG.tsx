import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * Homepage OG image (1200×630, standard OpenGraph dimensions).
 *
 * Centerpiece: the canonical category-defining sentence ("a decision
 * kernel for AI actions") with the kernel block at the side. Single
 * frame, rendered via `remotion still`.
 */
export const HomepageOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      {/* Faint gradient backdrop in the corner for visual depth */}
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.18,
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
          adjudicate · v0.1 experimental
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
          <div style={{ flex: 1 }}>
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
              A decision kernel
              <br />
              for{" "}
              <span
                style={{
                  background: GRADIENT_PRIMARY,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                AI actions
              </span>
              .
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 28,
                lineHeight: 1.4,
                color: COLORS.muted,
              }}
            >
              A control layer between AI intent
              <br />
              and system execution.
            </p>
          </div>
          <KernelBadge />
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
          <span>execute · refuse · rewrite · defer · escalate · confirm</span>
          <span style={{ color: COLORS.ink }}>adjudicate.dev</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KernelBadge: React.FC = () => (
  <div
    style={{
      width: 220,
      height: 220,
      borderRadius: 36,
      background: GRADIENT_PRIMARY,
      boxShadow: "0 24px 80px rgba(99,102,241,0.4)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        fontSize: 14,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        opacity: 0.85,
        marginBottom: 8,
      }}
    >
      control
    </div>
    <div
      style={{
        fontSize: 14,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        opacity: 0.85,
      }}
    >
      layer
    </div>
  </div>
);
