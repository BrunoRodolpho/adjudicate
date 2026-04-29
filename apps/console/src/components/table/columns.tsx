"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AuditRecord } from "@adjudicate/core";
import { BasisFlatSet } from "@/components/decision/BasisFlatSet";
import { DecisionBadge } from "@/components/decision/DecisionBadge";
import { ReplayButton } from "@/components/replay/ReplayButton";
import {
  formatDurationMs,
  formatRelative,
  truncateHash,
} from "@/lib/format";
import { PackMetadataRegistry } from "@/lib/packs/metadata";

/**
 * Column model for the Audit Explorer table.
 *
 * Density-first: every cell is `text-[11px]` mono, `align-top`, no
 * decoration. The `Decision` column is the single visual anchor (badge);
 * everything else is plain text or a compact compound view (Basis chips,
 * truncated hash).
 *
 * Discriminated-union narrowing on `decision.kind` is intentionally local
 * to each cell that needs kind-specific data (Refusal column reads
 * `decision.refusal.code` only when kind === "REFUSE"). No casts.
 */
export const auditColumns: ColumnDef<AuditRecord>[] = [
  {
    id: "at",
    header: "Time",
    accessorFn: (r) => r.at,
    cell: ({ row }) => (
      <time
        title={row.original.at}
        className="tabular-nums text-muted"
      >
        {formatRelative(row.original.at)}
      </time>
    ),
  },
  {
    id: "pack",
    header: "Pack",
    accessorFn: (r) => {
      const meta = PackMetadataRegistry.match(r.envelope.kind);
      return meta?.displayName ?? "—";
    },
    cell: ({ row }) => {
      const meta = PackMetadataRegistry.match(row.original.envelope.kind);
      return meta ? (
        <span className="text-muted">{meta.displayName}</span>
      ) : (
        <span className="text-faint" title="No registered Pack handles this intent kind">
          unknown
        </span>
      );
    },
  },
  {
    id: "intentKind",
    header: "Intent",
    accessorFn: (r) => r.envelope.kind,
    cell: ({ row }) => (
      <span className="text-ink">{row.original.envelope.kind}</span>
    ),
  },
  {
    id: "decision",
    header: "Decision",
    accessorFn: (r) => r.decision.kind,
    cell: ({ row }) => <DecisionBadge kind={row.original.decision.kind} />,
  },
  {
    id: "refusal",
    header: "Refusal",
    cell: ({ row }) => {
      const d = row.original.decision;
      if (d.kind !== "REFUSE") {
        return <span className="text-faint">—</span>;
      }
      return (
        <code className="text-[11px] text-red-300/90">{d.refusal.code}</code>
      );
    },
  },
  {
    id: "taint",
    header: "Taint",
    accessorFn: (r) => r.envelope.taint,
    cell: ({ row }) => (
      <span className="text-muted">{row.original.envelope.taint}</span>
    ),
  },
  {
    id: "actor",
    header: "Actor",
    accessorFn: (r) => r.envelope.actor.principal,
    cell: ({ row }) => (
      <span className="text-muted">{row.original.envelope.actor.principal}</span>
    ),
  },
  {
    id: "basis",
    header: "Basis",
    cell: ({ row }) => (
      <div className="max-w-[280px]">
        <BasisFlatSet basis={row.original.decision_basis} />
      </div>
    ),
  },
  {
    id: "duration",
    header: "Δms",
    accessorFn: (r) => r.durationMs,
    cell: ({ row }) => (
      <span className="tabular-nums text-muted">
        {formatDurationMs(row.original.durationMs)}
      </span>
    ),
  },
  {
    id: "intentHash",
    header: "Hash",
    cell: ({ row }) => (
      <code className="text-[10px] text-faint">
        {truncateHash(row.original.intentHash, 6, 4)}
      </code>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <ReplayButton
          intentHash={row.original.intentHash}
          intentKind={row.original.envelope.kind}
          variant="icon"
        />
      </div>
    ),
  },
];
