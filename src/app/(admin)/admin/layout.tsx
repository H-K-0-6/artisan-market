import { requireRolePage } from "@/lib/rbac";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-nav";

const NAV: DashboardNavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview", exact: true },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/products", label: "Products", icon: "products" },
  { href: "/admin/auctions", label: "Auctions", icon: "auctions" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/audit", label: "Audit log", icon: "audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRolePage("admin");
  return (
    <DashboardShell title="Admin" subtitle={session.user.email} items={NAV}>
      {children}
    </DashboardShell>
  );
}
