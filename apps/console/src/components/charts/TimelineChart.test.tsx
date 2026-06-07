import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { TimelineChart } from "./TimelineChart";

beforeEach(() => {
  cleanup();
});

describe("TimelineChart", () => {
  it("renders a labelled figure group with the title", () => {
    render(
      <TimelineChart
        title="Drift"
        points={[
          { t: "2026-01-01", value: 1 },
          { t: "2026-01-02", value: 3 },
        ]}
      />,
    );
    const fig = screen.getByRole("group", { name: "Drift" });
    expect(fig.tagName.toLowerCase()).toBe("figure");
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const { container } = render(
      <TimelineChart
        title="Burn"
        points={[
          { t: "a", value: 1 },
          { t: "b", value: 2 },
        ]}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the sr-only table with one row per point", () => {
    render(
      <TimelineChart
        title="Trend"
        points={[
          { t: "t0", value: 5 },
          { t: "t1", value: 8 },
          { t: "t2", value: 2 },
        ]}
      />,
    );
    const table = screen.getByTestId("chart-data-table");
    expect(within(table).getByText("Trend")).toBeDefined();
    // header + 3 data rows
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("t0")).toBeDefined();
    expect(within(table).getByText("t2")).toBeDefined();
  });

  it("draws a line path for multiple points", () => {
    const { container } = render(
      <TimelineChart
        title="Multi"
        points={[
          { t: "a", value: 1 },
          { t: "b", value: 4 },
          { t: "c", value: 2 },
        ]}
      />,
    );
    const paths = Array.from(container.querySelectorAll("path"));
    // a line path should start with "M" and contain "L"
    const line = paths.find((p) => /^M/.test(p.getAttribute("d") ?? ""));
    expect(line).toBeDefined();
    expect(line!.getAttribute("d")).toContain("L");
    // path must not contain NaN
    expect(line!.getAttribute("d")).not.toContain("NaN");
  });

  it("renders a single point as a dot, not a line", () => {
    const { container } = render(
      <TimelineChart title="One" points={[{ t: "only", value: 7 }]} />,
    );
    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(Number.isNaN(Number(circle!.getAttribute("cx")))).toBe(false);
    // no area/line <path> for a lone point
    const linePaths = Array.from(container.querySelectorAll("path")).filter(
      (p) => /[ML]/.test(p.getAttribute("d") ?? ""),
    );
    expect(linePaths).toHaveLength(0);
    // still mirrors the datum in the table
    expect(screen.getByText("only")).toBeDefined();
  });

  it("handles all-zero values without NaN (flat baseline)", () => {
    const { container } = render(
      <TimelineChart
        title="Flat"
        points={[
          { t: "a", value: 0 },
          { t: "b", value: 0 },
        ]}
      />,
    );
    container.querySelectorAll("path").forEach((p) => {
      expect(p.getAttribute("d")).not.toContain("NaN");
    });
  });

  it("renders the empty state for no points", () => {
    render(<TimelineChart title="Nothing" points={[]} />);
    expect(screen.getByRole("group", { name: "Nothing" })).toBeDefined();
    expect(screen.getByText(/no data/i)).toBeDefined();
  });

  it("applies the yFormat to the data table", () => {
    render(
      <TimelineChart
        title="Fmt"
        yFormat={(n) => `${n} tok`}
        points={[{ t: "a", value: 9 }]}
      />,
    );
    expect(screen.getByText("9 tok")).toBeDefined();
  });

  it("tints by band without throwing for each severity", () => {
    for (const band of ["ok", "warn", "crit"] as const) {
      const { container } = render(
        <TimelineChart
          title={`band-${band}`}
          band={band}
          points={[
            { t: "a", value: 1 },
            { t: "b", value: 2 },
          ]}
        />,
      );
      expect(container.querySelector("svg")).not.toBeNull();
      cleanup();
    }
  });
});
