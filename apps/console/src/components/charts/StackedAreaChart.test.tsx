import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { StackedAreaChart } from "./StackedAreaChart";

beforeEach(() => {
  cleanup();
});

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
    render(<StackedAreaChart title="Outcomes" series={SERIES} />);
    const fig = screen.getByRole("group", { name: "Outcomes" });
    expect(fig.tagName.toLowerCase()).toBe("figure");
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const { container } = render(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("renders one stacked layer path per series", () => {
    const { container } = render(
      <StackedAreaChart title="Outcomes" series={SERIES} />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(SERIES.length);
    paths.forEach((p) => expect(p.getAttribute("d")).not.toContain("NaN"));
  });

  it("renders the sr-only table with Time + one column per series", () => {
    render(<StackedAreaChart title="Outcomes" series={SERIES} />);
    const table = screen.getByTestId("chart-data-table");
    expect(within(table).getByText("Outcomes")).toBeDefined();
    // column headers: Time, EXECUTE, REFUSE
    const colHeaders = within(table).getAllByRole("columnheader");
    expect(colHeaders.map((h) => h.textContent)).toEqual([
      "Time",
      "EXECUTE",
      "REFUSE",
    ]);
    // header row + 2 time rows (t0, t1)
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("densifies a sparse series (missing time → 0) onto the shared axis", () => {
    render(
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
    const table = screen.getByTestId("chart-data-table");
    const rows = within(table).getAllByRole("row");
    // 1 header + 2 axis rows (t0, t1 — union, first-seen order)
    expect(rows).toHaveLength(3);
    // t0 row: A=1, B=0 (filled)
    const t0 = rows[1]!;
    expect(within(t0).getByText("t0")).toBeDefined();
    expect(within(t0).getByText("1")).toBeDefined();
    expect(within(t0).getByText("0")).toBeDefined();
  });

  it("renders a column for a single shared time key (no NaN)", () => {
    const { container } = render(
      <StackedAreaChart
        title="OneTime"
        series={[
          { key: "A", points: [{ t: "t0", value: 3 }] },
          { key: "B", points: [{ t: "t0", value: 4 }] },
        ]}
      />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    paths.forEach((p) => expect(p.getAttribute("d")).not.toContain("NaN"));
  });

  it("clamps negative values to zero in the table", () => {
    render(
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
    const table = screen.getByTestId("chart-data-table");
    const rows = within(table).getAllByRole("row");
    // t0 value clamped to "0"
    expect(within(rows[1]!).getByText("0")).toBeDefined();
  });

  it("honors an explicit series color in the legend", () => {
    const { container } = render(
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
    const path = container.querySelector("path[fill='rgb(1 2 3)']");
    expect(path).not.toBeNull();
  });

  it("renders the empty state when there are no series", () => {
    render(<StackedAreaChart title="Empty" series={[]} />);
    expect(screen.getByRole("group", { name: "Empty" })).toBeDefined();
    expect(screen.getByText(/no data/i)).toBeDefined();
  });

  it("renders the empty state when series carry no points", () => {
    render(
      <StackedAreaChart
        title="EmptyPts"
        series={[{ key: "A", points: [] }]}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeDefined();
  });
});
