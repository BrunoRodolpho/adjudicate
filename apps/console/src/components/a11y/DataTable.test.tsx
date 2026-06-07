import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "./DataTable";

beforeEach(() => {
  cleanup();
});

const columns: DataTableColumn[] = [
  { key: "session", header: "Session" },
  { key: "consumed", header: "Consumed", align: "right" },
];

const rows = [
  { session: "sess-a", consumed: "10,000" },
  { session: "sess-b", consumed: "52,000" },
];

const getRowKey = (row: Record<string, unknown>) => String(row.session);

describe("DataTable", () => {
  it("renders the caption as the table's accessible name (sr-only by default)", () => {
    render(
      <DataTable
        caption="Token budget per session"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
      />,
    );
    // Tables expose their caption as the accessible name.
    const table = screen.getByRole("table", {
      name: "Token budget per session",
    });
    expect(table).toBeDefined();
    const caption = screen.getByText("Token budget per session");
    expect(caption.tagName).toBe("CAPTION");
    expect(caption.className).toContain("sr-only");
  });

  it("shows the caption visually when captionVisible is true", () => {
    render(
      <DataTable
        caption="Visible caption"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        captionVisible
      />,
    );
    const caption = screen.getByText("Visible caption");
    expect(caption.tagName).toBe("CAPTION");
    expect(caption.className).not.toContain("sr-only");
  });

  it("marks column headers with scope=col", () => {
    render(
      <DataTable
        caption="cap"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
      />,
    );
    const colHeader = screen.getByRole("columnheader", { name: "Session" });
    expect(colHeader.getAttribute("scope")).toBe("col");
    expect(
      screen.getByRole("columnheader", { name: "Consumed" }).getAttribute("scope"),
    ).toBe("col");
  });

  it("marks the first cell of each row as a row header (scope=row)", () => {
    render(
      <DataTable
        caption="cap"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
      />,
    );
    const rowHeader = screen.getByRole("rowheader", { name: "sess-a" });
    expect(rowHeader.tagName).toBe("TH");
    expect(rowHeader.getAttribute("scope")).toBe("row");
  });

  it("renders the row data", () => {
    render(
      <DataTable
        caption="cap"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
      />,
    );
    expect(screen.getByText("sess-a")).toBeDefined();
    expect(screen.getByText("sess-b")).toBeDefined();
    expect(screen.getByText("52,000")).toBeDefined();
  });

  it("right-aligns columns flagged align=right with tabular-nums", () => {
    render(
      <DataTable
        caption="cap"
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
      />,
    );
    const cell = screen.getByText("10,000");
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("tabular-nums");
  });

  it("renders the empty state when there are no rows", () => {
    render(
      <DataTable
        caption="cap"
        columns={columns}
        rows={[]}
        getRowKey={getRowKey}
        emptyMessage="No token usage recorded."
      />,
    );
    expect(screen.getByText("No token usage recorded.")).toBeDefined();
  });
});
