import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireRolePage("artisan");
  const shop = await prisma.artisanProfile.findUniqueOrThrow({ where: { userId: session.user.id } });

  const [productCount, liveAuctions, sales] = await Promise.all([
    prisma.product.count({ where: { artisanId: shop.id, status: { not: "ARCHIVED" } } }),
    prisma.auction.count({ where: { artisanId: shop.id, status: "LIVE" } }),
    prisma.orderItem.findMany({
      where: { artisanId: shop.id, order: { status: { in: ["PAID", "SHIPPED", "DELIVERED"] } } },
      select: { unitPriceCents: true, qty: true },
    }),
  ]);
  const grossCents = sales.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);
  const netCents = grossCents - Math.round((grossCents * shop.commissionBps) / 10_000);

  const stats = [
    { label: "Active products", value: String(productCount) },
    { label: "Live auctions", value: String(liveAuctions) },
    { label: "Gross sales", value: formatCents(grossCents) },
    { label: `Net after ${shop.commissionBps / 100}% commission`, value: formatCents(netCents) },
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{shop.shopName}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{s.value}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
