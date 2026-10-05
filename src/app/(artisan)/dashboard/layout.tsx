import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-nav";

const NAV: DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "overview", exact: true },
  { href: "/dashboard/products", label: "Products", icon: "products" },
  { href: "/dashboard/auctions", label: "Auctions", icon: "auctions" },
  { href: "/dashboard/orders", label: "Orders", icon: "orders" },
  { href: "/dashboard/shop", label: "Shop profile", icon: "shop" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRolePage("artisan");
  const shop = await prisma.artisanProfile.findUnique({ where: { userId: session.user.id }, select: { shopName: true } });
  return (
    <DashboardShell title="Your studio" subtitle={shop?.shopName} items={NAV}>
      {children}
    </DashboardShell>
  );
}
