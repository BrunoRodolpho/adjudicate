import { GRAIN } from "../tokens";

/**
 * Vignette — a full-frame radial darkening at the edges to focus the eye
 * and add filmic depth. Color-graded toward the scene (dark on console
 * scenes via `dark`). Deterministic (no frame dependence).
 */
export const Vignette: React.FC<{
  /** Vignette strength (peak alpha at the corners). */
  strength?: number;
  /** Use a deeper vignette tuned for dark console scenes. */
  dark?: boolean;
}> = ({ strength, dark = false }) => {
  const alpha = strength ?? (dark ? 0.45 : 0.16);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${alpha}) 100%)`,
      }}
    />
  );
};

/**
 * Grain — a tiled film-grain overlay using the static noise tile from
 * tokens.GRAIN. Deterministic over frame (no animation / random), so it
 * renders identically every pass and loops cleanly.
 */
export const Grain: React.FC<{
  /** Grain opacity. Defaults to the light/dark presets in tokens.GRAIN. */
  opacity?: number;
  /** Use the dark-scene grain opacity preset. */
  dark?: boolean;
  /** Blend mode for the grain over the scene. */
  blendMode?: React.CSSProperties["mixBlendMode"];
}> = ({ opacity, dark = false, blendMode = "overlay" }) => {
  const o = opacity ?? (dark ? GRAIN.darkOpacity : GRAIN.lightOpacity);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: GRAIN.dataUri,
        backgroundSize: "128px 128px",
        opacity: o,
        mixBlendMode: blendMode,
      }}
    />
  );
};
