import { fadeIn, rise } from "../motion";
import { COLORS, CONSOLE, FONT_MONO, SECTION_CAPS_TRACKING } from "../tokens";

/**
 * Caption — a kinetic lower-third caption: an optional section-caps
 * eyebrow (0.18em tracking, like the site's section captions) above a
 * larger headline line, both rising + fading in together. Generalized
 * from HowItWorksHero's Caption with proper tracking and a two-tier
 * structure.
 *
 * Pass `localFrame` measured from when the caption should begin (e.g. the
 * frame within its Sequence). Deterministic over that frame.
 */
export const Caption: React.FC<{
  /** Frame measured from the caption's own start. */
  frame: number;
  /** The small uppercase eyebrow line (optional). */
  eyebrow?: string;
  /** The headline line. */
  text: string;
  /** Position from the bottom edge (px). */
  bottom?: number;
  /** Dark-scene color grading (for console beats). */
  dark?: boolean;
  /** Eyebrow accent color (defaults to muted; pass a decision color to tie in). */
  eyebrowColor?: string;
  /** Delay (frames) before the caption begins animating in. */
  delay?: number;
}> = ({
  frame,
  eyebrow,
  text,
  bottom = 64,
  dark = false,
  eyebrowColor,
  delay = 0,
}) => {
  const inkColor = dark ? CONSOLE.ink : COLORS.ink;
  const mutedColor = dark ? CONSOLE.muted : COLORS.muted;
  const opacity = fadeIn(frame, delay, 12);
  const ty = rise(frame, delay, 16, 10);
  return (
    <div
      style={{
        position: "absolute",
        bottom,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        transform: `translateY(${ty}px)`,
      }}
    >
      {eyebrow ? (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: SECTION_CAPS_TRACKING,
            textTransform: "uppercase",
            color: eyebrowColor ?? mutedColor,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: inkColor,
          letterSpacing: "-0.01em",
          lineHeight: 1.3,
        }}
      >
        {text}
      </div>
    </div>
  );
};
