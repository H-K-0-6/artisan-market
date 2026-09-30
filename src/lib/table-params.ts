// Server-driven tables keep their state in the URL: ?page=2&size=20&sort=createdAt&dir=desc&<filters>.

export type SearchParams = Record<string, string | string[] | undefined>;
export type SortDir = "asc" | "desc";

export type TableState<S extends string = string> = {
  page: number;
  pageSize: number;
  sort: S;
  dir: SortDir;
};

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/** Page/size/sort from the URL, with the sort column whitelisted. */
export function parseTableState<S extends string>(
  sp: SearchParams,
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: SortDir; defaultPageSize?: number },
): TableState<S> {
  const page = Math.max(1, Number.parseInt(first(sp, "page") ?? "1", 10) || 1);
  const size = Number.parseInt(first(sp, "size") ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? size : (opts.defaultPageSize ?? 20);
  const sortParam = first(sp, "sort");
  const sort = sortParam && (opts.sortable as readonly string[]).includes(sortParam) ? (sortParam as S) : opts.defaultSort;
  const dirParam = first(sp, "dir");
  const dir: SortDir = dirParam === "asc" || dirParam === "desc" ? dirParam : sortParam ? "asc" : (opts.defaultDir ?? "desc");
  return { page, pageSize, sort, dir };
}

/** A filter value only if it's one of the allowed options. */
export function pickEnum<T extends string>(sp: SearchParams, key: string, allowed: readonly T[]): T | undefined {
  const v = first(sp, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Flattens search params to plain strings, for client components that rebuild URLs. */
export function flattenParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) out[k] = s;
  }
  return out;
}

export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paged<T>(rows: T[], total: number, state: { page: number; pageSize: number }): Paged<T> {
  return { rows, total, page: state.page, pageSize: state.pageSize, pageCount: Math.max(1, Math.ceil(total / state.pageSize)) };
}

/** What a DataTable needs to render server state (see components/admin/data-table.tsx). */
export function toView(result: Paged<unknown>, state: TableState, sp: SearchParams) {
  return {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    sort: state.sort,
    dir: state.dir,
    params: flattenParams(sp),
  };
}
