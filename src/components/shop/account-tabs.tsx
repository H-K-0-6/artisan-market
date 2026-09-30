"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account/orders", label: "Orders" },
  { href: "/account/auctions", label: "Auctions" },
  { href: "/account/notifications", label: "Notifications" },
] as const;

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b text-sm" aria-label="Account sections">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 transition-colors",
              active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
