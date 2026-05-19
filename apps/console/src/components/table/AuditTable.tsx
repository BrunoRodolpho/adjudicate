"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import type { AuditRecord } from "@adjudicate/core";
import { auditColumns } from "./columns";
import { cn } from "@/lib/cn";

interface Props {
  readonly records: readonly AuditRecord[];
  /**
   * Optional set of `intentHash` values to highlight. The live-tail hook
   * passes the hashes that arrived in the most recent poll; the row gets
   * a 1.5s fade so the operator can spot the new arrival. When omitted,
   * the table renders with no highlight.
   */
  readonly highlightHashes?: ReadonlySet<string>;
}

/**
 * Audit table — TanStack Table + plain HTML rows.
 *
 * Phase 1 row counts are small (six fixtures via the mock gateway).
 * When the tRPC gateway lands and row counts cross ~500, wrap `<tbody>`'s
 * row mapping with `@tanstack/react-virtual` — the column model and click
 * handler do not need to change.
 *
 * Click anywhere on a row → navigate to the detail route. The header is
 * sticky so long lists keep their column labels in view.
 *
 * When `highlightHashes` is provided, rows whose `intentHash` is in the
 * set briefly render with an emerald-tinted background. T-080's live tail
 * passes the set; outside live mode the table renders identically to
 * Phase 1.
 */
export function AuditTable({ records, highlightHashes }: Props) {
  const router = useRouter();
  const table = useReactTable({
    data: records as AuditRecord[],
    columns: auditColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-auto rounded-sm border border-edge bg-panel/40">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-panel">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-edge">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-2 py-1.5 text-left text-[10px] uppercase tracking-section text-faint"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={auditColumns.length}
                className="px-3 py-8 text-center"
              >
                <p className="text-[11px] italic text-faint">
                  No audit records match the current filters.
                </p>
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const highlighted = Boolean(
                highlightHashes?.has(row.original.intentHash),
              );
              return (
                <tr
                  key={row.id}
                  onClick={() =>
                    router.push(`/decisions/${row.original.intentHash}`)
                  }
                  className={cn(
                    "cursor-pointer border-b border-edge transition-colors hover:bg-edge/30",
                    highlighted &&
                      "animate-[fadeBg_1500ms_ease-out] bg-emerald-500/10",
                  )}
                >
                  {row.getVisibleCells().map((c) => (
                    <td key={c.id} className="px-2 py-1.5 align-top">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
