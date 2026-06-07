/**
 * Bespoke, zero-dependency, accessible SVG chart kit for the console.
 *
 * Every chart renders a decorative (aria-hidden) <svg> alongside a
 * visually-hidden data <table>, wrapped in a labelled <figure role="group">,
 * and is pure/deterministic over its props. See the individual modules for
 * the per-chart contract.
 */
export { BarDistribution, type BarDistributionProps } from "./BarDistribution";
export { TimelineChart, type TimelineChartProps } from "./TimelineChart";
export {
  StackedAreaChart,
  type StackedAreaChartProps,
} from "./StackedAreaChart";
export {
  BAND_COLORS,
  SERIES_PALETTE,
  formatCount,
  type Band,
  type BandColor,
  type NamedSeries,
  type SeriesPoint,
  type TimePoint,
} from "./types";
