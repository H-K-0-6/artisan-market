"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { useSocketConnected, useSocketEvent } from "@/lib/socket-client";
import type { ServerEvents } from "@/server/realtime/emit";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = ServerEvents["admin:activity"] & { key: string; live?: boolean };

/** Live `admin:activity` feed, seeded with the latest audit entries. */
export function ActivityFeed({ initial }: { initial: ServerEvents["admin:activity"][] }) {
  const [items, setItems] = useState<Item[]>(() => initial.map((i, n) => ({ ...i, key: `init-${n}` })));
  const connected = useSocketConnected();
  const [, setTick] = useState(0);

  const onActivity = useCallback((e: ServerEvents["admin:activity"]) => {
    setItems((prev) => [{ ...e, key: `${e.at}-${Math.random()}`, live: true }, ...prev].slice(0, 30));
  }, []);
  useSocketEvent("admin:activity", onActivity);

  // Re-render every 30s so relative times stay fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span className={cn("size-2 rounded-full", connected ? "bg-weld" : "bg-muted-foreground/40")} aria-hidden />
        {connected ? "Live" : "Connecting…"}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="grid gap-3 text-sm" data-testid="activity-feed">
          {items.map((i) => (
            <li key={i.key} className={cn("grid gap-0.5 rounded-md", i.live && "animate-in fade-in-0 slide-in-from-top-1")}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">{i.kind}</Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(i.at)}</span>
              </div>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
