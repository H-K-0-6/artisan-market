"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { listOrders } from "@/server/queries/admin";
import { formatDateTime } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { DataTable, type TableView } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";

type Row = Awaited<ReturnType<typeof listOrders>>["rows"][number];

const ORDER_STATUSES = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "EXPIRED", "REFUNDED"];

const columns: ColumnDef<Row>[] = [
  {
    id: "id",
    header: "Order",
    enableSorting: false,
    cell: ({ row }) => (
      <Link href={`/admin/orders/${row.original.id}`} className="font-mono text-xs hover:underline">
        {row.original.id.slice(-10)}
      </Link>
    ),
  },
  {
    id: "buyer",
    header: "Buyer",
    enableSorting: false,
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.buyer.id}`} className="hover:underline">
        {row.original.buyer.name}
        <span className="block text-xs text-muted-foreground">{row.original.buyer.email}</span>
      </Link>
    ),
  },
  { id: "status", accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  {
    id: "source",
    accessorKey: "source",
    header: "Source",
    enableSorting: false,
    cell: ({ getValue }) => <Badge variant="outline">{getValue<string>() === "AUCTION" ? "Auction" : "Cart"}</Badge>,
  },
  {
    id: "items",
    header: "Items",
    enableSorting: false,
    meta: { className: "text-right" },
    cell: ({ row }) => <span className="tabular-nums">{row.original._count.items}</span>,
  },
  {
    id: "totalCents",
    accessorKey: "totalCents",
    header: "Total",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{formatCents(getValue<number>())}</span>,
  },
  {
    id: "commissionCents",
    accessorKey: "commissionCents",
    header: "Commission",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{formatCents(getValue<number>())}</span>,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Placed",
    cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue<Date>())}</span>,
  },
];

export function OrdersTable({ rows, view }: { rows: Row[]; view: TableView }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      {...view}
      filters={{
        search: { placeholder: "Order id or buyer email" },
        selects: [
          {
            key: "status",
            label: "Statuses",
            options: ORDER_STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })),
          },
          {
            key: "source",
            label: "Sources",
            options: [
              { value: "CART", label: "Cart" },
              { value: "AUCTION", label: "Auction" },
            ],
          },
        ],
      }}
      empty="No orders match these filters."
    />
  );
}
