import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * /introspection OG — radial-graph-inspired backdrop with three Pack
 * rings, plus the audit-record framing. Targets the auditor /
 * compliance / analyzer audience.
 */

const PACKS = [
  { name: "pix", radius: 70 },
  { name: "kyc", radius: 120 },
  { name: "deployments", radius: 180 },
];

const NODES_PER_RING = 8;

export const IntrospectionOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 80,
          display: "flex",
          alignItems: "center",
          gap: 60,
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
              marginBottom: 24,
            }}
          >
            adjudicate · introspection
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
            Reconstruct
            <br />
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              why your AI
            </span>
            <br />
            system acted.
          </h1>
          <p
            style={{
              marginTop: 24,
              fontSize: 22,
              lineHeight: 1.4,
              color: COLORS.muted,
              maxWidth: 480,
            }}
          >
            Forensic replayability. Operational accountability. Causal traceability for autonomous systems.
          </p>
        </div>
        <RadialGraph />
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
        <span>GuardMetadata · ADR-105 · operator console</span>
        <span style={{ color: COLORS.ink }}>adjudicate.dev/introspection</span>
      </div>
    </AbsoluteFill>
  );
};

const RadialGraph: React.FC = () => {
  const cx = 240;
  const cy = 240;
  const ringColors = [COLORS.defer, COLORS.execute, COLORS.escalate];
  return (
    <svg width="480" height="480" viewBox="0 0 480 480" style={{ flexShrink: 0 }}>
      {PACKS.map((p, ringIdx) => (
        <g key={p.name}>
          <circle
            cx={cx}
            cy={cy}
            r={p.radius}
            fill="none"
            stroke={COLORS.edge}
            strokeWidth="1.5"
            strokeDasharray="4 5"
          />
          {Array.from({ length: NODES_PER_RING }).map((_, i) => {
            const angle = (i / NODES_PER_RING) * Math.PI * 2;
            const x = cx + Math.cos(angle) * p.radius;
            const y = cy + Math.sin(angle) * p.radius;
            const color = ringColors[ringIdx]!;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="7"
                fill={color}
                stroke={color}
                strokeOpacity="0.35"
                strokeWidth="6"
              />
            );
          })}
          <text
            x={cx + p.radius + 8}
            y={cy - 4}
            fontSize="11"
            fontFamily="JetBrains Mono"
            fill={COLORS.muted}
          >
            {p.name}
          </text>
        </g>
      ))}
      {/* Center kernel block */}
      <rect
        x={cx - 36}
        y={cy - 36}
        width="72"
        height="72"
        rx="14"
        fill="url(#kernelGrad)"
      />
      <defs>
        <linearGradient id="kernelGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#D946EF" />
        </linearGradient>
      </defs>
    </svg>
  );
};
