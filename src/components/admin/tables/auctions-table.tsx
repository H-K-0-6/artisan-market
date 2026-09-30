"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { listAuctions } from "@/server/queries/admin";
import { formatDateTime } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { DataTable, type TableView } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

type Row = Awaited<ReturnType<typeof listAuctions>>["rows"][number];

const AUCTION_STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "PAID", "UNSOLD", "CANCELLED"];

const columns: ColumnDef<Row>[] = [
  {
    id: "product",
    header: "Auction",
    enableSorting: false,
    cell: ({ row }) => (
      <Link href={`/admin/auctions/${row.original.id}`} className="font-medium hover:underline">
        {row.original.product.title}
        <span className="block text-xs font-normal text-muted-foreground">{row.original.artisan.shopName}</span>
      </Link>
    ),
  },
  { id: "status", accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  {
    id: "currentPriceCents",
    accessorKey: "currentPriceCents",
    header: "Price",
    meta: { className: "text-right" },
    cell: ({ row }) => (
      <div className="tabular-nums">
        {row.original.currentPriceCents != null ? formatCents(row.original.currentPriceCents) : (
          <span className="text-muted-foreground">from {formatCents(row.original.startPriceCents)}</span>
        )}
        {row.original.reservePriceCents != null && (
          <span className="block text-xs text-muted-foreground">
            reserve {formatCents(row.original.reservePriceCents)} {row.original.reserveMet ? "(met)" : "(not met)"}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "bidCount",
    accessorKey: "bidCount",
    header: "Bids",
    meta: { className: "text-right" },
    cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
  },
  {
    id: "highBidder",
    header: "High bidder",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.highBidder ? (
        <Link href={`/admin/users/${row.original.highBidder.id}`} className="hover:underline">
          {row.original.highBidder.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "startsAt",
    accessorKey: "startsAt",
    header: "Starts",
    cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue<Date>())}</span>,
  },
  {
    id: "endsAt",
    accessorKey: "endsAt",
    header: "Ends",
    cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue<Date>())}</span>,
  },
];

export function AuctionsTable({ rows, view }: { rows: Row[]; view: TableView }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      {...view}
      filters={{
        search: { placeholder: "Search product or shop" },
        selects: [
          {
            key: "status",
            label: "Statuses",
            options: AUCTION_STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })),
          },
        ],
      }}
      empty="No auctions match these filters."
    />
  );
}
