import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { BarDistribution } from "./BarDistribution";

beforeEach(() => {
  cleanup();
});

describe("BarDistribution", () => {
  it("renders a labelled figure group with the title", () => {
    render(
      <BarDistribution
        title="Command risk"
        data={[
          { label: "low", value: 4 },
          { label: "high", value: 1 },
        ]}
      />,
    );
    const fig = screen.getByRole("group", { name: "Command risk" });
    expect(fig).toBeDefined();
    expect(fig.tagName.toLowerCase()).toBe("figure");
  });

  it("marks the svg decorative (aria-hidden)", () => {
    const { container } = render(
      <BarDistribution title="Risk" data={[{ label: "low", value: 1 }]} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the sr-only data table with caption and one row per datum", () => {
    render(
      <BarDistribution
        title="Outcomes"
        data={[
          { label: "EXECUTE", value: 10 },
          { label: "REFUSE", value: 3 },
          { label: "DEFER", value: 0 },
        ]}
      />,
    );
    const table = screen.getByTestId("chart-data-table");
    // caption echoes the title
    expect(within(table).getByText("Outcomes")).toBeDefined();
    // header + 3 data rows
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("EXECUTE")).toBeDefined();
    expect(within(table).getByText("REFUSE")).toBeDefined();
    expect(within(table).getByText("DEFER")).toBeDefined();
  });

  it("applies a custom value formatter to both legend and table", () => {
    render(
      <BarDistribution
        title="Burn"
        valueFormat={(n) => `${n}%`}
        data={[{ label: "cpu", value: 42 }]}
      />,
    );
    // appears in visible legend AND sr-only table
    expect(screen.getAllByText("42%").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the empty state (still a labelled group) for no data", () => {
    render(<BarDistribution title="Empty" data={[]} />);
    const fig = screen.getByRole("group", { name: "Empty" });
    expect(fig).toBeDefined();
    expect(screen.getByText(/no data/i)).toBeDefined();
    // no decorative chart svg in the empty state
    expect(fig.querySelector("svg")).toBeNull();
  });

  it("is robust to a single zero-value datum (no NaN widths)", () => {
    const { container } = render(
      <BarDistribution title="Zero" data={[{ label: "none", value: 0 }]} />,
    );
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
    rects.forEach((r) => {
      const w = Number(r.getAttribute("width"));
      expect(Number.isNaN(w)).toBe(false);
      expect(w).toBeGreaterThanOrEqual(0);
    });
  });

  it("clamps negative values to a non-negative bar width", () => {
    const { container } = render(
      <BarDistribution
        title="Neg"
        data={[
          { label: "a", value: -5 },
          { label: "b", value: 10 },
        ]}
      />,
    );
    container.querySelectorAll("rect").forEach((r) => {
      expect(Number(r.getAttribute("width"))).toBeGreaterThanOrEqual(0);
    });
  });

  it("scales to an explicit max when provided", () => {
    const { container } = render(
      <BarDistribution
        title="Capped"
        max={100}
        data={[{ label: "x", value: 50 }]}
      />,
    );
    // value bars (every other rect: track then bar) — the bar should be ~half
    // of the inner width (96 viewBox units → ~48).
    const rects = Array.from(container.querySelectorAll("rect"));
    const barWidths = rects.map((r) => Number(r.getAttribute("width")));
    // at least one bar near 48 (50/100 of inner 96)
    expect(barWidths.some((w) => Math.abs(w - 48) < 1)).toBe(true);
  });
});
