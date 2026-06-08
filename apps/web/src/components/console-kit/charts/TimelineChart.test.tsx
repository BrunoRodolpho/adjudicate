import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineChart } from "./TimelineChart";

/**
 * Ported from apps/console/src/components/charts/TimelineChart.test.tsx.
 *
 * apps/web's vitest runs in a `node` environment, so this asserts over the
 * static markup produced by react-dom/server rather than a mounted DOM. The
 * chart is measurement-free and deterministic, so the server output matches the
 * client output and verifies the same contract.
 */

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Extract the `d="…"` of every <path>. */
function pathData(html: string): string[] {
  return Array.from(html.matchAll(/<path[^>]*\bd="([^"]*)"/g)).map(
    (m) => m[1] ?? "",
  );
}

describe("TimelineChart", () => {
  it("renders a labelled figure group with the title", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Drift"
        points={[
          { t: "2026-01-01", value: 1 },
          { t: "2026-01-02", value: 3 },
        ]}
      />,
    );
    expect(html).toMatch(/<figure[^>]*role="group"/);
    expect(html).toContain('aria-label="Drift"');
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Burn"
        points={[
          { t: "a", value: 1 },
          { t: "b", value: 2 },
        ]}
      />,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("renders the sr-only table with one row per point", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Trend"
        points={[
          { t: "t0", value: 5 },
          { t: "t1", value: 8 },
          { t: "t2", value: 2 },
        ]}
      />,
    );
    expect(html).toContain("<caption>Trend</caption>");
    // header + 3 data rows
    expect(count(html, "<tr>")).toBe(4);
    expect(html).toContain("t0");
    expect(html).toContain("t2");
  });

  it("draws a line path for multiple points", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Multi"
        points={[
          { t: "a", value: 1 },
          { t: "b", value: 4 },
          { t: "c", value: 2 },
        ]}
      />,
    );
    const line = pathData(html).find((d) => /^M/.test(d));
    expect(line).toBeDefined();
    expect(line).toContain("L");
    expect(line).not.toContain("NaN");
  });

  it("renders a single point as a dot, not a line", () => {
    const html = renderToStaticMarkup(
      <TimelineChart title="One" points={[{ t: "only", value: 7 }]} />,
    );
    expect(html).toContain("<circle");
    const cx = html.match(/<circle[^>]*\bcx="([^"]*)"/)?.[1] ?? "";
    expect(Number.isNaN(Number(cx))).toBe(false);
    // no area/line <path> with M/L coordinates for a lone point
    const linePaths = pathData(html).filter((d) => /[ML]/.test(d));
    expect(linePaths).toHaveLength(0);
    // still mirrors the datum in the table
    expect(html).toContain("only");
  });

  it("handles all-zero values without NaN (flat baseline)", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Flat"
        points={[
          { t: "a", value: 0 },
          { t: "b", value: 0 },
        ]}
      />,
    );
    pathData(html).forEach((d) => expect(d).not.toContain("NaN"));
  });

  it("renders the empty state for no points", () => {
    const html = renderToStaticMarkup(
      <TimelineChart title="Nothing" points={[]} />,
    );
    expect(html).toContain('aria-label="Nothing"');
    expect(html).toMatch(/no data/i);
  });

  it("applies the yFormat to the data table", () => {
    const html = renderToStaticMarkup(
      <TimelineChart
        title="Fmt"
        yFormat={(n) => `${n} tok`}
        points={[{ t: "a", value: 9 }]}
      />,
    );
    expect(html).toContain("9 tok");
  });

  it("tints by band without throwing for each severity", () => {
    for (const band of ["ok", "warn", "crit"] as const) {
      const html = renderToStaticMarkup(
        <TimelineChart
          title={`band-${band}`}
          band={band}
          points={[
            { t: "a", value: 1 },
            { t: "b", value: 2 },
          ]}
        />,
      );
      expect(html).toContain("<svg");
    }
  });
});
