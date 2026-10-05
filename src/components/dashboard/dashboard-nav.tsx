"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GavelIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptIcon,
  ScrollTextIcon,
  StoreIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  overview: LayoutDashboardIcon,
  products: PackageIcon,
  auctions: GavelIcon,
  orders: ReceiptIcon,
  shop: StoreIcon,
  users: UsersIcon,
  audit: ScrollTextIcon,
} satisfies Record<string, LucideIcon>;

export type DashboardNavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

export function DashboardNav({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:overflow-visible md:p-0">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
              active ? "bg-indigo-soft text-indigo" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "md:before:absolute md:before:-left-1 md:before:top-2 md:before:h-6 md:before:w-1 md:before:rounded-full md:before:bg-saffron",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
