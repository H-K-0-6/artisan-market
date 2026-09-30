"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { BellIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { useSocketEvent } from "@/lib/socket-client";
import type { ServerEvents } from "@/server/realtime/emit";
import type { NotificationItem } from "@/server/queries/notifications";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notification";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MAX_ITEMS = 10;

export function NotificationBell({ initialItems, initialUnread }: { initialItems: NotificationItem[]; initialUnread: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const onNotification = useCallback(
    (n: ServerEvents["notification"]) => {
      setItems((prev) => [{ ...n, readAt: null }, ...prev.filter((p) => p.id !== n.id)].slice(0, MAX_ITEMS));
      setUnread((c) => c + 1);
      toast(n.title, {
        description: n.body,
        action: n.link ? { label: "View", onClick: () => router.push(n.link!) } : undefined,
      });
    },
    [router],
  );
  useSocketEvent("notification", onNotification);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      startTransition(async () => {
        const fresh = await fetchMyNotifications();
        setItems(fresh.items);
        setUnread(fresh.unread);
      });
    }
  }

  function markOne(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target || target.readAt) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    setUnread((c) => Math.max(0, c - 1));
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
          />
        }
      >
        <BellIcon />
        {unread > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button variant="link" size="xs" disabled={unread === 0} onClick={markAll}>
            Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {items.map((n) => {
            const content = (
              <>
                <div className="flex items-start gap-2">
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")}
                    aria-hidden
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <span className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
              </>
            );
            const cls = "block w-full px-3 py-2 text-left hover:bg-muted";
            return (
              <li key={n.id} className="border-b last:border-b-0">
                {n.link ? (
                  <Link
                    href={n.link}
                    className={cls}
                    onClick={() => {
                      markOne(n.id);
                      setOpen(false);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button type="button" className={cls} onClick={() => markOne(n.id)}>
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <Link
          href="/account/notifications"
          onClick={() => setOpen(false)}
          className="border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          View all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
