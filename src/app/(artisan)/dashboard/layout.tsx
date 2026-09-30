import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { SiteHeader } from "@/components/shop/site-header";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/auctions", label: "Auctions" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/shop", label: "Shop profile" },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage("artisan");
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 md:grid-cols-[180px_1fr]">
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
