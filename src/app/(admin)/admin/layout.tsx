import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { SiteHeader } from "@/components/shop/site-header";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/auctions", label: "Auctions" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage("admin");
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-8 md:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 text-sm md:flex-col">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 hover:bg-muted">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}
