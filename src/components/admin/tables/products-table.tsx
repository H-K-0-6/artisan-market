"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { listProducts } from "@/server/queries/admin";
import { formatDate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { DataTable, type TableView } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { HideProductButton, RestoreProductButton } from "@/components/admin/moderation";

type Row = Awaited<ReturnType<typeof listProducts>>["rows"][number];

const columns: ColumnDef<Row>[] = [
  {
    id: "title",
    accessorKey: "title",
    header: "Product",
    cell: ({ row }) => (
      <div className="grid gap-0.5">
        {row.original.status === "ACTIVE" ? (
          <Link href={`/products/${row.original.slug}`} className="font-medium hover:underline">
            {row.original.title}
          </Link>
        ) : (
          <span className="font-medium">{row.original.title}</span>
        )}
        {row.original.category && <span className="text-xs text-muted-foreground">{row.original.category.name}</span>}
      </div>
    ),
  },
  {
    id: "artisan",
    header: "Artisan",
    enableSorting: false,
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.artisan.userId}`} className="hover:underline">
        {row.original.artisan.shopName}
      </Link>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="grid max-w-56 gap-1">
        <StatusBadge status={row.original.status} />
        {row.original.hiddenReason && (
          <span className="truncate text-xs text-muted-foreground" title={row.original.hiddenReason}>
            {row.original.hiddenReason}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "priceCents",
    accessorKey: "priceCents",
    header: "Price",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>() ? formatCents(getValue<number>()) : "Auction"}</span>,
  },
  {
    id: "stock",
    accessorKey: "stock",
    header: "Stock",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue<Date>())}</span>,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    meta: { className: "text-right" },
    cell: ({ row }) =>
      row.original.status === "HIDDEN" ? (
        <RestoreProductButton productId={row.original.id} />
      ) : row.original.status === "ARCHIVED" ? null : (
        <HideProductButton productId={row.original.id} title={row.original.title} />
      ),
  },
];

export function ProductsTable({ rows, view }: { rows: Row[]; view: TableView }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      {...view}
      filters={{
        search: { placeholder: "Search title or shop" },
        selects: [
          {
            key: "status",
            label: "Statuses",
            options: ["ACTIVE", "DRAFT", "HIDDEN", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })),
          },
        ],
      }}
      empty="No products match these filters."
    />
  );
}
