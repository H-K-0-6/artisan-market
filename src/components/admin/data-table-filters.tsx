"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { useUrlState } from "@/components/admin/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FilterConfig = {
  search?: { key?: string; placeholder: string };
  selects?: { key: string; label: string; options: { value: string; label: string }[] }[];
};

const ALL = "__all__";

/** Search box + select filters, all written to the URL. */
export function DataTableFilters({ params, config }: { params: Record<string, string>; config: FilterConfig }) {
  const { update } = useUrlState(params);
  const searchKey = config.search?.key ?? "q";
  const current = params[searchKey] ?? "";
  const [q, setQ] = useState(current);
  const lastSent = useRef(current);

  // Debounced search.
  useEffect(() => {
    if (q.trim() === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = q.trim();
      update({ [searchKey]: q.trim() || null });
    }, 350);
    return () => clearTimeout(t);
  }, [q, searchKey, update]);

  const filterKeys = [...(config.search ? [searchKey] : []), ...(config.selects?.map((s) => s.key) ?? [])];
  const active = filterKeys.some((k) => params[k]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {config.search && (
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={config.search.placeholder}
            aria-label={config.search.placeholder}
            className="pl-8"
          />
        </div>
      )}
      {config.selects?.map((s) => {
        const items = [{ value: ALL, label: `All ${s.label.toLowerCase()}` }, ...s.options];
        return (
          <Select
            key={s.key}
            value={params[s.key] ?? ALL}
            items={items}
            onValueChange={(v) => update({ [s.key]: !v || v === ALL ? null : String(v) })}
          >
            <SelectTrigger aria-label={s.label} data-filter={s.key} className="min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            lastSent.current = "";
            update(Object.fromEntries(filterKeys.map((k) => [k, null])));
          }}
        >
          <XIcon /> Reset
        </Button>
      )}
    </div>
  );
}
