import { COLORS, FONT_MONO, SHADOW } from "../tokens";

/** A single key/value row inside an EnvelopeCard. */
export interface EnvelopeField {
  readonly key: string;
  readonly value: string | number;
  /** Override the value color (e.g. COLORS.rewrite when mutated). */
  readonly valueColor?: string;
  /** Override the value weight (e.g. 700 when mutated). */
  readonly valueWeight?: number;
}

/**
 * EnvelopeCard — a monospace "envelope" (an intent payload as JSON-ish
 * braces with field rows). Generalized from HeroKernelLoop's EnvelopeBox:
 * the title line, an arbitrary list of field rows, and an optional dashed
 * accent border (for a "proposed / pending" look).
 *
 * Layout is centered on (x, y) so compositions can glide it by animating
 * `x`. Deterministic: this primitive holds no frame logic — drive
 * opacity / scale / x from the composition.
 */
export const EnvelopeCard: React.FC<{
  /** Center x (px). */
  x: number;
  /** Center y (px). */
  y: number;
  width?: number;
  opacity?: number;
  scale?: number;
  /** Solid border color. Ignored when `dashed` is set. */
  borderColor?: string;
  /** Render a dashed accent border (proposed/pending). */
  dashed?: boolean;
  /** The title line (the intent kind). */
  title: string;
  /** The field rows. */
  fields: ReadonlyArray<EnvelopeField>;
  zIndex?: number;
}> = ({
  x,
  y,
  width = 156,
  opacity = 1,
  scale = 1,
  borderColor = COLORS.edge,
  dashed = false,
  title,
  fields,
  zIndex = 4,
}) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - 28,
        width,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        zIndex,
      }}
    >
      <div
        style={{
          background: COLORS.surface,
          border: `1.5px ${dashed ? "dashed" : "solid"} ${borderColor}`,
          borderRadius: 8,
          padding: "6px 10px",
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: COLORS.muted,
          textAlign: "left",
          lineHeight: 1.45,
          boxShadow: SHADOW.card,
        }}
      >
        <div style={{ color: COLORS.faint, fontSize: 9 }}>{"{"}</div>
        <div style={{ paddingLeft: 8, fontSize: 10 }}>{title}</div>
        {fields.map((f) => (
          <div key={f.key} style={{ paddingLeft: 8, fontSize: 10 }}>
            {f.key}:{" "}
            <span
              style={{
                color: f.valueColor ?? COLORS.ink,
                fontWeight: f.valueWeight ?? 500,
              }}
            >
              {f.value}
            </span>
          </div>
        ))}
        <div style={{ color: COLORS.faint, fontSize: 9 }}>{"}"}</div>
      </div>
    </div>
  );
};
