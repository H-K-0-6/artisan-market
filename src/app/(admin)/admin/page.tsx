import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const [users, artisans, products, liveAuctions, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.artisanProfile.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.auction.count({ where: { status: "LIVE" } }),
    prisma.order.aggregate({
      where: { status: { in: ["PAID", "SHIPPED", "DELIVERED"] } },
      _sum: { totalCents: true, commissionCents: true },
    }),
  ]);

  const stats = [
    { label: "Users", value: String(users) },
    { label: "Artisans", value: String(artisans) },
    { label: "Active products", value: String(products) },
    { label: "Live auctions", value: String(liveAuctions) },
    { label: "Gross sales", value: formatCents(revenue._sum.totalCents ?? 0) },
    { label: "Platform commission", value: formatCents(revenue._sum.commissionCents ?? 0) },
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Admin overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
