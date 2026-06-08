import {
  COLORS,
  DECISIONS,
  type DecisionKind,
  FONT_MONO,
  SECTION_CAPS_TRACKING,
} from "../tokens";

/**
 * DecisionBadge — the colored pill identifying one of the six
 * authoritative outcomes (color is load-bearing identity). A tinted
 * background, a colored border, the glyph, and the label in section-caps
 * tracking. Pulls its color/label/glyph from tokens.DECISIONS so every
 * surface agrees.
 *
 * Deterministic: drive `opacity` / `scale` from the composition.
 */
export const DecisionBadge: React.FC<{
  kind: DecisionKind;
  opacity?: number;
  scale?: number;
  /** Pill size. "sm" for inline, "md" for a hero moment. */
  size?: "sm" | "md";
  /** Hide the leading glyph (label-only pill). */
  hideGlyph?: boolean;
}> = ({ kind, opacity = 1, scale = 1, size = "sm", hideGlyph = false }) => {
  if (opacity <= 0) return null;
  const { label, color, glyph } = DECISIONS[kind];
  const padY = size === "md" ? 6 : 4;
  const padX = size === "md" ? 14 : 10;
  const fontSize = size === "md" ? 12 : 9;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: `${padY}px ${padX}px`,
        borderRadius: 14,
        // 12% tint of the decision color (hex8 alpha 1F ≈ 12%).
        background: `${color}1F`,
        border: `1px solid ${color}`,
        color,
        fontFamily: FONT_MONO,
        fontSize,
        letterSpacing: SECTION_CAPS_TRACKING,
        textTransform: "uppercase",
        fontWeight: 600,
        opacity,
        transform: `scale(${scale})`,
        whiteSpace: "nowrap",
      }}
    >
      {hideGlyph ? null : (
        <span aria-hidden style={{ fontWeight: 700, color }}>
          {glyph}
        </span>
      )}
      {label}
    </span>
  );
};

/** The six decision keys in canonical order (Execute first, Rewrite second). */
export const DECISION_ORDER: ReadonlyArray<DecisionKind> = [
  "execute",
  "rewrite",
  "refuse",
  "defer",
  "escalate",
  "confirm",
];

// Re-export so consumers can `import { COLORS } from "../components"`-free.
export { COLORS };
