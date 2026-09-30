import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { listNotifications } from "@/server/queries/notifications";
import { MarkAllReadButton } from "@/components/shop/mark-all-read-button";
import { Pager } from "@/components/pager";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

const TYPE_LABEL: Record<string, string> = {
  OUTBID: "Outbid",
  AUCTION_WON: "Auction won",
  AUCTION_ENDED: "Auction ended",
  ORDER_PAID: "Order paid",
  ORDER_SHIPPED: "Shipped",
  LISTING_HIDDEN: "Listing hidden",
  SYSTEM: "System",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireRolePage();
  const sp = await searchParams;
  const requested = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  let data = await listNotifications(session.user.id, requested);
  if (requested > data.pageCount) data = await listNotifications(session.user.id, data.pageCount);
  const page = Math.min(requested, data.pageCount);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {data.total} notification{data.total === 1 ? "" : "s"} · {data.unread} unread
        </p>
        <MarkAllReadButton disabled={data.unread === 0} />
      </div>

      {data.items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.readAt && "bg-muted/40")}>
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(!n.readAt && "font-medium")}>{n.title}</span>
                  <Badge variant="secondary">{TYPE_LABEL[n.type] ?? n.type}</Badge>
                  {!n.readAt && <span className="sr-only">(unread)</span>}
                </div>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                  {n.link && (
                    <Link href={n.link} className="underline hover:text-foreground">
                      View
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} pageCount={data.pageCount} href={(p) => `/account/notifications?page=${p}`} />
    </div>
  );
}
