"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useUrlState } from "@/components/admin/use-url-state";
import { DataTableFilters, type FilterConfig } from "@/components/admin/data-table-filters";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZES = ["10", "20", "50", "100"];

/** Pagination/sort state as rendered by the server page. */
export type TableView = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: string;
  dir: "asc" | "desc";
  /** Current URL search params, flattened. */
  params: Record<string, string>;
};

export type DataTableProps<T> = TableView & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types vary per column
  columns: ColumnDef<T, any>[];
  data: T[];
  filters?: FilterConfig;
  getRowId?: (row: T) => string;
  empty?: string;
};

/**
 * shadcn "Data Table" on TanStack Table v8, driven by the server: pagination,
 * sorting and filters live in the URL and the page re-queries with skip/take.
 */
export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  pageCount,
  sort,
  dir,
  params,
  filters,
  getRowId,
  empty = "No results.",
}: DataTableProps<T>) {
  // TanStack Table returns fresh functions each render; opt out of React Compiler memoization.
  "use no memo";
  const { update, pending } = useUrlState(params);
  const sorting: SortingState = [{ id: sort, desc: dir === "desc" }];

  // eslint-disable-next-line react-hooks/incompatible-library -- opted out above with "use no memo"
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableSortingRemoval: false,
    pageCount,
    rowCount: total,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize } },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const s = next[0];
      if (s) update({ sort: s.id, dir: s.desc ? "desc" : "asc" });
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex: page - 1, pageSize }) : updater;
      if (next.pageSize !== pageSize) update({ size: String(next.pageSize) });
      else update({ page: String(next.pageIndex + 1) });
    },
  });

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="grid gap-3">
      {filters && <DataTableFilters params={params} config={filters} />}
      <div className={cn("overflow-x-auto rounded-lg border transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const col = header.column;
                  const sorted = col.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(col.columnDef.meta?.className)}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.isPlaceholder ? null : col.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2.5 h-7"
                          onClick={col.getToggleSortingHandler()}
                          data-sort-column={col.id}
                        >
                          {flexRender(col.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUpIcon />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon />
                          ) : (
                            <ArrowUpDownIcon className="opacity-40" />
                          )}
                        </Button>
                      ) : (
                        flexRender(col.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex items-center gap-2">
          <span>Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => v && table.setPageSize(Number(v))}
            items={PAGE_SIZES.map((s) => ({ value: s, label: s }))}
          >
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage() || pending}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={!table.getCanNextPage() || pending}
            onClick={() => table.nextPage()}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
