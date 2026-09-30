"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { listUsers } from "@/server/queries/admin";
import { formatDate } from "@/lib/format";
import { DataTable, type TableView } from "@/components/admin/data-table";
import { RoleBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";

type Row = Awaited<ReturnType<typeof listUsers>>["rows"][number];

const columns: ColumnDef<Row>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
        {row.original.artisan && <span className="block text-xs font-normal text-muted-foreground">{row.original.artisan.shopName}</span>}
      </Link>
    ),
  },
  { id: "email", accessorKey: "email", header: "Email" },
  { id: "role", accessorKey: "role", header: "Role", cell: ({ getValue }) => <RoleBadge role={getValue<string>()} /> },
  {
    id: "banned",
    accessorKey: "banned",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.banned ? (
        <Badge variant="destructive" title={row.original.banReason ?? undefined}>
          Banned
        </Badge>
      ) : (
        <span className="text-muted-foreground">Active</span>
      ),
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Joined",
    cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue<Date>())}</span>,
  },
  {
    id: "orders",
    accessorFn: (r) => r._count.orders,
    header: "Orders",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
  },
];

export function UsersTable({ rows, view }: { rows: Row[]; view: TableView }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      {...view}
      filters={{
        search: { placeholder: "Search name or email" },
        selects: [
          {
            key: "role",
            label: "Roles",
            options: [
              { value: "buyer", label: "Buyers" },
              { value: "artisan", label: "Artisans" },
              { value: "admin", label: "Admins" },
            ],
          },
          {
            key: "banned",
            label: "Statuses",
            options: [
              { value: "false", label: "Active" },
              { value: "true", label: "Banned" },
            ],
          },
        ],
      }}
      empty="No users match these filters."
    />
  );
}
