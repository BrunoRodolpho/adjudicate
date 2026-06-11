import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StackedAreaChart } from "./StackedAreaChart";

/**
 * Ported from apps/console/src/components/charts/StackedAreaChart.test.tsx.
 *
 * apps/web's vitest runs in a `node` environment, so this asserts over the
 * static markup produced by react-dom/server rather than a mounted DOM. The
 * chart is measurement-free and deterministic, so the server output matches the
 * client output and verifies the same stacking/densify/clamp contract.
 */

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function paths(html: string): string[] {
  return Array.from(html.matchAll(/<path[^>]*\bd="([^"]*)"/g)).map(
    (m) => m[1] ?? "",
  );
}

/** Ordered list of <th scope="col"> header texts inside the data table. */
function colHeaders(html: string): string[] {
  return Array.from(
    html.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)<\/th>/g),
  ).map((m) => m[1] ?? "");
}

const SERIES = [
  {
    key: "EXECUTE",
    points: [
      { t: "t0", value: 5 },
      { t: "t1", value: 7 },
    ],
  },
  {
    key: "REFUSE",
    points: [
      { t: "t0", value: 2 },
      { t: "t1", value: 1 },
    ],
  },
];

describe("StackedAreaChart", () => {
  it("renders a labelled figure group with the title", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    expect(html).toMatch(/<figure[^>]*role="group"/);
    expect(html).toContain('aria-label="Outcomes"');
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("renders one stacked layer path per series", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    const ds = paths(html);
    expect(ds).toHaveLength(SERIES.length);
    ds.forEach((d) => expect(d).not.toContain("NaN"));
  });

  it("renders the sr-only table with Time + one column per series", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    expect(html).toContain("<caption>Outcomes</caption>");
    expect(colHeaders(html)).toEqual(["Time", "EXECUTE", "REFUSE"]);
    // header row + 2 time rows (t0, t1)
    expect(count(html, "<tr>")).toBe(3);
  });

  it("densifies a sparse series (missing time → 0) onto the shared axis", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart
        title="Sparse"
        series={[
          {
            key: "A",
            points: [
              { t: "t0", value: 1 },
              { t: "t1", value: 2 },
            ],
          },
          { key: "B", points: [{ t: "t1", value: 9 }] },
        ]}
      />,
    );
    // 1 header + 2 axis rows (t0, t1 — union, first-seen order)
    expect(count(html, "<tr>")).toBe(3);
    // t0 row densifies B to 0: row reads t0, A=1, B=0
    expect(html).toMatch(
      /<th scope="row">t0<\/th><td>1<\/td><td>0<\/td>/,
    );
  });

  it("renders a column for a single shared time key (no NaN)", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart
        title="OneTime"
        series={[
          { key: "A", points: [{ t: "t0", value: 3 }] },
          { key: "B", points: [{ t: "t0", value: 4 }] },
        ]}
      />,
    );
    const ds = paths(html);
    expect(ds).toHaveLength(2);
    ds.forEach((d) => expect(d).not.toContain("NaN"));
  });

  it("clamps negative values to zero in the table", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart
        title="Neg"
        series={[
          {
            key: "A",
            points: [
              { t: "t0", value: -3 },
              { t: "t1", value: 5 },
            ],
          },
        ]}
      />,
    );
    // t0 value clamped to "0"
    expect(html).toMatch(/<th scope="row">t0<\/th><td>0<\/td>/);
  });

  it("honors an explicit series color in the legend", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart
        title="Colored"
        series={[
          {
            key: "A",
            color: "rgb(1 2 3)",
            points: [
              { t: "t0", value: 1 },
              { t: "t1", value: 2 },
            ],
          },
        ]}
      />,
    );
    // explicit color used as the path fill/stroke
    expect(html).toContain('fill="rgb(1 2 3)"');
  });

  it("renders the empty state when there are no series", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="Empty" series={[]} />,
    );
    expect(html).toContain('aria-label="Empty"');
    expect(html).toMatch(/no data/i);
  });

  it("renders the empty state when series carry no points", () => {
    const html = renderToStaticMarkup(
      <StackedAreaChart title="EmptyPts" series={[{ key: "A", points: [] }]} />,
    );
    expect(html).toMatch(/no data/i);
  });
});
