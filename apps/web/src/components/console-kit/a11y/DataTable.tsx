import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { VisuallyHidden } from "./VisuallyHidden";

export interface DataTableColumn {
  /** Key into each row's record. */
  readonly key: string;
  /** Visible (or screen-reader) column header text. */
  readonly header: string;
  /** Cell + header text alignment. Defaults to "left". */
  readonly align?: "left" | "right";
}

export interface DataTableProps {
  /**
   * Required table caption. Captions give the table an accessible name; this is
   * a hard a11y requirement, so the prop is mandatory. Hide it visually with
   * `captionVisible={false}` when the surrounding section already labels the
   * table.
   */
  readonly caption: string;
  readonly columns: readonly DataTableColumn[];
  readonly rows: readonly Record<string, ReactNode>[];
  /** Stable React key per row (e.g. an id or hash). */
  getRowKey(row: Record<string, ReactNode>, index: number): string;
  /** When false (default) the caption is `sr-only`. Set true to show it. */
  readonly captionVisible?: boolean;
  /** Optional class applied to the scroll/border wrapper. */
  readonly className?: string;
  /** Message shown when `rows` is empty. */
  readonly emptyMessage?: string;
}

/**
 * Accessible table wrapper that standardises the many ad-hoc `<table>` blocks
 * across the console. It enforces:
 *
 *  - a `<caption>` (the table's accessible name) — visible or `sr-only`;
 *  - `scope="col"` on every column header;
 *  - `scope="row"` on the first column's cell of each row, so the leading cell
 *    labels its row for assistive tech.
 *
 * Presentation matches the console table idiom (edge border, panel surface,
 * `text-[11px]`, uppercase faint column labels). Right-aligned columns get
 * `tabular-nums` for numeric legibility. Purely presentational — no data
 * fetching, clock, or RNG.
 *
 * Ported from apps/console (ADR-128: copy, don't share). Token classes were
 * renamed to the console.* dark namespace so the table reads correctly on the
 * dark surface.
 */
export function DataTable({
  caption,
  columns,
  rows,
  getRowKey,
  captionVisible = false,
  className,
  emptyMessage = "No records.",
}: DataTableProps) {
  return (
    <div className="relative">
      <div
        tabIndex={0}
        role="region"
        aria-label={caption}
        className={cn(
          "overflow-auto rounded-sm border border-console-edge bg-console-panel/40 focus-ring-console",
          // Sticky first column keeps the row label pinned while the rest of a
          // wide row scrolls horizontally on narrow screens (WS-G affordance).
          "[&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:bg-console-panel [&_thead_tr>:first-child]:z-10",
          className,
        )}
      >
        <table className="w-full border-collapse text-[11px]">
        {captionVisible ? (
          <caption className="px-3 py-1.5 text-left text-[10px] uppercase tracking-section text-console-muted">
            {caption}
          </caption>
        ) : (
          <VisuallyHidden as="caption">{caption}</VisuallyHidden>
        )}
        <thead>
          <tr className="border-b border-console-edge">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-3 py-1.5 text-[10px] font-normal uppercase tracking-section text-console-muted",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-[11px] italic text-console-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                className="border-b border-console-edge/50 last:border-0"
              >
                {columns.map((col, ci) => {
                  const alignClass =
                    col.align === "right"
                      ? "text-right tabular-nums"
                      : "text-left";
                  const content = row[col.key] ?? null;
                  // First column doubles as the row header for assistive tech.
                  return ci === 0 ? (
                    <th
                      key={col.key}
                      scope="row"
                      className={cn(
                        "px-3 py-1.5 align-top font-normal text-console-ink",
                        alignClass,
                      )}
                    >
                      {content}
                    </th>
                  ) : (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-1.5 align-top text-console-muted",
                        alignClass,
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
      {/* Right edge-fade — hints the table scrolls horizontally on mobile. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-sm bg-gradient-to-l from-console-panel to-transparent sm:hidden"
      />
    </div>
  );
}
