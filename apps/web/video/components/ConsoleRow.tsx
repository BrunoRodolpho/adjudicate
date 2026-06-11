import {
  CONSOLE,
  DECISIONS,
  type DecisionKind,
  FONT_MONO,
} from "../tokens";

/**
 * ConsoleRow — a single row of the operator console's audit explorer, on
 * the dark CONSOLE canvas. A decision-colored left rail (load-bearing
 * identity), a mono timestamp, the intent kind, the decision label, and a
 * truncated hash on the right. This is the final narrative step: the
 * saved receipts displayed for an operator.
 *
 * Deterministic: drive `opacity` / `translateY` from the composition for
 * a staggered list reveal.
 */
export const ConsoleRow: React.FC<{
  kind: DecisionKind;
  /** Mono timestamp, e.g. "11:32:08.421Z". */
  time: string;
  /** The intent kind, e.g. "deployment.approval.request". */
  intentKind: string;
  /** Truncated content-address, e.g. "sha256:3a01…8a91". */
  hash: string;
  width?: number;
  opacity?: number;
  /** translateY offset (px) for a staggered settle; 0 = at rest. */
  translateY?: number;
  /** Highlight the row as freshly-arrived (subtle panel lift). */
  fresh?: boolean;
}> = ({
  kind,
  time,
  intentKind,
  hash,
  width = 520,
  opacity = 1,
  translateY = 0,
  fresh = false,
}) => {
  if (opacity <= 0) return null;
  const { label, color } = DECISIONS[kind];
  return (
    <div
      style={{
        position: "relative",
        width,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px 10px 18px",
        borderRadius: 10,
        background: fresh ? CONSOLE.edge : CONSOLE.panel,
        border: `1px solid ${CONSOLE.edge}`,
        opacity,
        transform: `translateY(${translateY}px)`,
        fontFamily: FONT_MONO,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Decision-colored left rail. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: color,
        }}
      />
      <span style={{ fontSize: 10, color: CONSOLE.faint, flexShrink: 0 }}>
        {time}
      </span>
      <span
        style={{
          fontSize: 11,
          color: CONSOLE.ink,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {intentKind}
      </span>
      <span
        style={{
          fontSize: 10,
          color,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 10, color: CONSOLE.muted, flexShrink: 0 }}>
        {hash}
      </span>
    </div>
  );
};
