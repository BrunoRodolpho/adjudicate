"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import type { AuditRecord } from "@adjudicate/core";
import { auditColumns } from "./columns";

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
 */
export function AuditTable({ records }: { records: readonly AuditRecord[] }) {
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
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() =>
                  router.push(`/decisions/${row.original.intentHash}`)
                }
                className="cursor-pointer border-b border-edge transition-colors hover:bg-edge/30"
              >
                {row.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-2 py-1.5 align-top">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
