import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BarDistribution } from "./BarDistribution";

/**
 * Ported from apps/console/src/components/charts/BarDistribution.test.tsx.
 *
 * apps/web's vitest harness runs in a `node` environment (no jsdom /
 * @testing-library/react), so instead of mounting into a DOM we render the
 * pure, deterministic chart to static markup with react-dom/server and assert
 * over the HTML string. The chart kit is intentionally measurement-free, so its
 * server output is identical to its client output — these checks verify the
 * same contract (labelled figure group, decorative aria-hidden svg, sr-only
 * data table, NaN-free widths, scaling) as the original jsdom tests.
 */

/** Count non-overlapping occurrences of a substring. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Extract every `width="…"` numeric value from <rect> elements. */
function rectWidths(html: string): number[] {
  return Array.from(html.matchAll(/<rect[^>]*\bwidth="([^"]*)"/g)).map((m) =>
    Number(m[1]),
  );
}

describe("BarDistribution", () => {
  it("renders a labelled figure group with the title", () => {
    const html = renderToStaticMarkup(
      <BarDistribution
        title="Command risk"
        data={[
          { label: "low", value: 4 },
          { label: "high", value: 1 },
        ]}
      />,
    );
    expect(html).toMatch(/<figure[^>]*role="group"/);
    expect(html).toContain('aria-label="Command risk"');
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const html = renderToStaticMarkup(
      <BarDistribution title="Risk" data={[{ label: "low", value: 1 }]} />,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("renders the sr-only data table with caption and one row per datum", () => {
    const html = renderToStaticMarkup(
      <BarDistribution
        title="Outcomes"
        data={[
          { label: "EXECUTE", value: 10 },
          { label: "REFUSE", value: 3 },
          { label: "DEFER", value: 0 },
        ]}
      />,
    );
    expect(html).toContain('data-testid="chart-data-table"');
    expect(html).toContain("<caption>Outcomes</caption>");
    // 1 header row + 3 data rows
    expect(count(html, "<tr>")).toBe(4);
    expect(html).toContain("EXECUTE");
    expect(html).toContain("REFUSE");
    expect(html).toContain("DEFER");
  });

  it("applies a custom value formatter to both legend and table", () => {
    const html = renderToStaticMarkup(
      <BarDistribution
        title="Burn"
        valueFormat={(n) => `${n}%`}
        data={[{ label: "cpu", value: 42 }]}
      />,
    );
    // appears in visible legend AND sr-only table
    expect(count(html, "42%")).toBeGreaterThanOrEqual(2);
  });

  it("renders the empty state (still a labelled group) for no data", () => {
    const html = renderToStaticMarkup(
      <BarDistribution title="Empty" data={[]} />,
    );
    expect(html).toContain('aria-label="Empty"');
    expect(html).toMatch(/no data/i);
    // no decorative chart svg in the empty state
    expect(html).not.toContain("<svg");
  });

  it("is robust to a single zero-value datum (no NaN widths)", () => {
    const html = renderToStaticMarkup(
      <BarDistribution title="Zero" data={[{ label: "none", value: 0 }]} />,
    );
    const widths = rectWidths(html);
    expect(widths.length).toBeGreaterThan(0);
    widths.forEach((w) => {
      expect(Number.isNaN(w)).toBe(false);
      expect(w).toBeGreaterThanOrEqual(0);
    });
  });

  it("clamps negative values to a non-negative bar width", () => {
    const html = renderToStaticMarkup(
      <BarDistribution
        title="Neg"
        data={[
          { label: "a", value: -5 },
          { label: "b", value: 10 },
        ]}
      />,
    );
    rectWidths(html).forEach((w) => expect(w).toBeGreaterThanOrEqual(0));
  });

  it("scales to an explicit max when provided", () => {
    const html = renderToStaticMarkup(
      <BarDistribution
        title="Capped"
        max={100}
        data={[{ label: "x", value: 50 }]}
      />,
    );
    // value bar should be ~half of the inner width (96 viewBox units → ~48).
    const widths = rectWidths(html);
    expect(widths.some((w) => Math.abs(w - 48) < 1)).toBe(true);
  });
});
