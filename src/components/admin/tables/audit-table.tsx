"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { listAuditLogs } from "@/server/queries/admin";
import { formatDateTime } from "@/lib/format";
import { auditTargetHref } from "@/lib/audit-links";
import { DataTable, type TableView } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

type Row = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];

function metaSummary(meta: unknown) {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const label = m.title ?? m.email;
  const extra =
    m.from && m.to ? `${m.from} → ${m.to}` : typeof m.hiddenProducts === "number" && m.hiddenProducts > 0 ? `${m.hiddenProducts} products hidden` : null;
  return [label, extra].filter(Boolean).join(" · ") || null;
}

const columns: ColumnDef<Row>[] = [
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "When",
    cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue<Date>())}</span>,
  },
  {
    id: "actor",
    header: "Actor",
    enableSorting: false,
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.actor.id}`} className="hover:underline">
        {row.original.actor.name}
      </Link>
    ),
  },
  {
    id: "action",
    accessorKey: "action",
    header: "Action",
    enableSorting: false,
    cell: ({ getValue }) => <Badge variant="secondary" className="font-mono">{getValue<string>()}</Badge>,
  },
  {
    id: "target",
    header: "Target",
    enableSorting: false,
    cell: ({ row }) => {
      const href = auditTargetHref(row.original.targetType, row.original.targetId);
      const summary = metaSummary(row.original.meta);
      return (
        <div className="grid gap-0.5">
          {href ? (
            <Link href={href} className="hover:underline">
              {row.original.targetType} <span className="font-mono text-xs">{row.original.targetId.slice(-10)}</span>
            </Link>
          ) : (
            <span>{row.original.targetType}</span>
          )}
          {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        </div>
      );
    },
  },
  {
    id: "reason",
    accessorKey: "reason",
    header: "Reason",
    enableSorting: false,
    cell: ({ getValue }) => <span className="line-clamp-2 max-w-72">{getValue<string | null>() ?? "—"}</span>,
  },
];

export function AuditTable({ rows, view, actions }: { rows: Row[]; view: TableView; actions: string[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      {...view}
      filters={{
        selects: [
          { key: "action", label: "Actions", options: actions.map((a) => ({ value: a, label: a })) },
          {
            key: "target",
            label: "Targets",
            options: ["user", "product", "auction", "order"].map((t) => ({ value: t, label: t })),
          },
        ],
      }}
      empty="No audit entries yet."
    />
  );
}
