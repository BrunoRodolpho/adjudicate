import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /capabilities OG — the four capability families as a 2×2 grid of
 * labeled cards. Frames the route's spine: what the kernel can decide
 * over (state, taint, authorization, business rules).
 */

const FAMILIES: ReadonlyArray<{ name: string; line: string; color: string }> = [
  { name: "State", line: "machine + lifecycle guards", color: COLORS.confirm },
  { name: "Taint", line: "provenance + flow tracking", color: COLORS.escalate },
  { name: "Authorization", line: "identity + capability checks", color: COLORS.execute },
  { name: "Business rules", line: "domain + policy logic", color: COLORS.rewrite },
];

export const CapabilitiesOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          top: -180,
          right: -160,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.14,
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 80,
          display: "flex",
          alignItems: "center",
          gap: 64,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: COLORS.muted,
              marginBottom: 28,
            }}
          >
            adjudicate · capabilities
          </div>
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
            Four families
            <br />
            of{" "}
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              guards
            </span>
            .
          </h1>
          <p
            style={{
              marginTop: 22,
              fontSize: 24,
              lineHeight: 1.4,
              color: COLORS.muted,
              maxWidth: 440,
            }}
          >
            Every check an action passes through, composed in one ordered
            evaluation.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            width: 520,
            flexShrink: 0,
          }}
        >
          {FAMILIES.map((f) => (
            <FamilyCard key={f.name} {...f} />
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          color: COLORS.faint,
          fontSize: 18,
          fontFamily: FONT_MONO,
        }}
      >
        <span>state · taint · authorization · business</span>
        <span style={{ color: COLORS.ink }}>adjudicate.dev/capabilities</span>
      </div>
    </AbsoluteFill>
  );
};

const FamilyCard: React.FC<{ name: string; line: string; color: string }> = ({
  name,
  line,
  color,
}) => (
  <div
    style={{
      padding: "26px 24px",
      borderRadius: 20,
      background: COLORS.surface,
      border: `2px solid ${COLORS.edge}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        background: color,
        boxShadow: `0 0 0 5px ${color}26`,
      }}
    />
    <div
      style={{
        fontSize: 26,
        fontWeight: 700,
        color: COLORS.ink,
        letterSpacing: "-0.01em",
      }}
    >
      {name}
    </div>
    <div style={{ fontSize: 16, color: COLORS.muted, fontFamily: FONT_MONO }}>
      {line}
    </div>
  </div>
);
