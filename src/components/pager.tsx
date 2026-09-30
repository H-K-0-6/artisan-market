import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Simple server-rendered previous/next pager driven by a `page` search param. */
export function Pager({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const btn = (disabled: boolean) =>
    cn(buttonVariants({ variant: "outline", size: "sm" }), disabled && "pointer-events-none opacity-50");
  return (
    <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
      <Link href={href(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={btn(page <= 1)}>
        <ChevronLeftIcon /> Previous
      </Link>
      <span className="tabular-nums text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <Link
        href={href(page + 1)}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        className={btn(page >= pageCount)}
      >
        Next <ChevronRightIcon />
      </Link>
    </nav>
  );
}
