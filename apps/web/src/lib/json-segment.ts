/**
 * Pre-segmented JSON line for renderers that need to highlight specific
 * tokens (a single key/value) without parsing JSON at render time.
 *
 * Producers build segments by hand from a typed source object; consumers
 * render each segment's `before` muted, `highlight` in an accent colour,
 * and `after` muted. Used by both the Hero mechanism panel and the
 * Playground worked-example panel.
 */
export interface JsonSegment {
  readonly before: string;
  readonly highlight: string;
  readonly after: string;
}
