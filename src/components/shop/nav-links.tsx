"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiveDot } from "@/components/brand/live";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

export function NavLinks({ items, liveCount }: { items: Item[]; liveCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-[0.95rem]">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isAuctions = item.href === "/auctions";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-md px-3 font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white",
              active && "text-white after:absolute after:inset-x-3 after:-bottom-[13px] after:h-[3px] after:rounded-full after:bg-saffron",
            )}
          >
            {item.label}
            {isAuctions && liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-saffron/15 py-0.5 pl-1.5 pr-2 text-xs font-semibold text-saffron">
                <LiveDot className="size-2" />
                {liveCount} live
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
