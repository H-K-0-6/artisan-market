"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account/orders", label: "Orders" },
  { href: "/account/auctions", label: "Bids and wins" },
  { href: "/account/notifications", label: "Notifications" },
] as const;

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-6 overflow-x-auto border-b text-[0.95rem]" aria-label="Account sections">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-[3px] pb-3 font-semibold transition-colors",
              active ? "border-saffron text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
