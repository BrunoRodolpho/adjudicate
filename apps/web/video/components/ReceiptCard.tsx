import { COLORS, FONT_MONO, SECTION_CAPS_TRACKING, SHADOW } from "../tokens";

/** A label/value row in a ReceiptCard. */
export interface ReceiptRow {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
  readonly valueWeight?: number;
}

/**
 * ReceiptCard — a signed AuditRecord card: a header ("auditRecord" eyebrow
 * + an optional sealed chip), a list of label/value rows, and a separated
 * hash line at the foot (the receipt's content-address). Generalized from
 * HeroKernelLoop's AuditCard.
 *
 * Per-row reveal is composition-driven via `rowOpacity(i)` so the caller
 * controls the cascade timing; defaults to all-visible. Deterministic:
 * this primitive holds no frame logic.
 */
export const ReceiptCard: React.FC<{
  /** Center x (px). */
  x: number;
  /** Top y (px). */
  y: number;
  width?: number;
  opacity?: number;
  /** translateY offset (px) for a settle-in; 0 = at rest. */
  translateY?: number;
  rows: ReadonlyArray<ReceiptRow>;
  /** The content-address line shown at the foot, e.g. "sha256:9f4c…c4f2". */
  hash?: string;
  /** Header eyebrow text. */
  title?: string;
  /** Per-row opacity for a cascade reveal. Defaults to 1. */
  rowOpacity?: (index: number) => number;
  /** Sealed-chip opacity (0 hides it). */
  sealedOpacity?: number;
  /** Sealed-chip label. */
  sealedLabel?: string;
}> = ({
  x,
  y,
  width = 480,
  opacity = 1,
  translateY = 0,
  rows,
  hash,
  title = "auditRecord",
  rowOpacity = () => 1,
  sealedOpacity = 1,
  sealedLabel = "sealed",
}) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y,
        width,
        padding: 18,
        borderRadius: 14,
        background: COLORS.surface,
        border: `1.5px solid ${COLORS.edge}`,
        boxShadow: SHADOW.panel,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 10,
          marginBottom: 10,
          borderBottom: `1px solid ${COLORS.edge}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: COLORS.faint,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {sealedOpacity > 0 ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: COLORS.execute,
              letterSpacing: SECTION_CAPS_TRACKING,
              textTransform: "uppercase",
              opacity: sealedOpacity,
              fontWeight: 600,
            }}
          >
            ✓ {sealedLabel}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              gap: 12,
              fontFamily: FONT_MONO,
              fontSize: 10,
              lineHeight: 1.5,
              opacity: rowOpacity(i),
            }}
          >
            <span style={{ width: 84, flexShrink: 0, color: COLORS.faint }}>
              {row.label}
            </span>
            <span
              style={{
                color: row.valueColor ?? COLORS.ink,
                fontWeight: row.valueWeight ?? 400,
                flex: 1,
                wordBreak: "break-word",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {hash ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${COLORS.edge}`,
            fontFamily: FONT_MONO,
            fontSize: 9,
            color: COLORS.faint,
            letterSpacing: "0.04em",
            wordBreak: "break-all",
          }}
        >
          ⛓ {hash}
        </div>
      ) : null}
    </div>
  );
};
