import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /transparency OG — governance in the open. Aggregates leave the
 * boundary, raw payloads do not. A "boundary" frame contrasts the
 * private inputs (kept inside) with the public aggregates (published),
 * making the data-minimization posture legible.
 */

const PRIVATE: ReadonlyArray<string> = [
  "raw payloads",
  "principal identity",
  "request bodies",
];

const PUBLIC: ReadonlyArray<{ label: string; color: string }> = [
  { label: "decision counts", color: COLORS.execute },
  { label: "outcome rates", color: COLORS.confirm },
  { label: "policy versions", color: COLORS.escalate },
];

export const TransparencyOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -160,
          width: 540,
          height: 540,
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
          alignItems: "center",
          gap: 56,
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
            adjudicate · transparency
          </div>
          <h1
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Governance
            <br />
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              in the open.
            </span>
          </h1>
          <p
            style={{
              marginTop: 22,
              fontSize: 23,
              lineHeight: 1.4,
              color: COLORS.muted,
              maxWidth: 420,
            }}
          >
            Aggregates are published. Raw inputs never leave the boundary.
            Accountability without exposure.
          </p>
        </div>
        <BoundaryDiagram />
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
        <span>aggregates-only · data minimization by default</span>
        <span style={{ color: COLORS.ink }}>adjudicate.dev/transparency</span>
      </div>
    </AbsoluteFill>
  );
};

const BoundaryDiagram: React.FC = () => (
  <div
    style={{
      width: 480,
      flexShrink: 0,
      position: "relative",
      padding: "30px 28px",
      borderRadius: 24,
      background: COLORS.surface,
      border: `2px solid ${COLORS.edge}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      display: "flex",
      flexDirection: "column",
      gap: 22,
    }}
  >
    <Group caps="kept inside" tone="private">
      {PRIVATE.map((p) => (
        <Chip key={p} label={p} />
      ))}
    </Group>
    <div
      style={{
        height: 1.5,
        background: COLORS.edge,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: -11,
          transform: "translateX(-50%)",
          background: COLORS.surface,
          padding: "0 12px",
          fontFamily: FONT_MONO,
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COLORS.faint,
        }}
      >
        boundary
      </span>
    </div>
    <Group caps="published" tone="public">
      {PUBLIC.map((p) => (
        <Chip key={p.label} label={p.label} color={p.color} />
      ))}
    </Group>
  </div>
);

const Group: React.FC<{
  caps: string;
  tone: "private" | "public";
  children: React.ReactNode;
}> = ({ caps, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COLORS.muted,
      }}
    >
      {caps}
    </span>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{children}</div>
  </div>
);

const Chip: React.FC<{ label: string; color?: string }> = ({ label, color }) => (
  <span
    style={{
      padding: "10px 18px",
      borderRadius: 999,
      fontFamily: FONT_MONO,
      fontSize: 17,
      fontWeight: color ? 600 : 400,
      color: color ?? COLORS.muted,
      background: color ? `${color}1A` : COLORS.canvas,
      border: `2px solid ${color ? `${color}66` : COLORS.edge}`,
    }}
  >
    {label}
  </span>
);
