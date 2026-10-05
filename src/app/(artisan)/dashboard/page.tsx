import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { PageHeader, StatTile } from "@/components/dashboard/dashboard-shell";
import { AuctionCard } from "@/components/auction/auction-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Your studio" };

export default async function DashboardPage() {
  const session = await requireRolePage("artisan");
  const shop = await prisma.artisanProfile.findUniqueOrThrow({ where: { userId: session.user.id } });

  const [productCount, lowStock, lots, sales, toShip] = await Promise.all([
    prisma.product.count({ where: { artisanId: shop.id, status: "ACTIVE", priceCents: { gt: 0 } } }),
    prisma.product.count({ where: { artisanId: shop.id, status: "ACTIVE", priceCents: { gt: 0 }, stock: { lte: 2 } } }),
    prisma.auction.findMany({
      where: { artisanId: shop.id, status: { in: ["LIVE", "SCHEDULED"] } },
      orderBy: [{ status: "asc" }, { endsAt: "asc" }],
      take: 3,
      include: {
        product: { select: { title: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
        artisan: { select: { shopName: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: { artisanId: shop.id, order: { status: { in: ["PAID", "SHIPPED", "DELIVERED"] } } },
      select: { unitPriceCents: true, qty: true },
    }),
    prisma.orderItem.findMany({
      where: { artisanId: shop.id, shippedAt: null, order: { status: "PAID" } },
      orderBy: { order: { paidAt: "asc" } },
      take: 5,
      include: {
        order: { select: { id: true, paidAt: true, buyer: { select: { name: true } } } },
        product: { select: { images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
      },
    }),
  ]);
  const grossCents = sales.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);
  const netCents = grossCents - Math.round((grossCents * shop.commissionBps) / 10_000);
  const liveCount = lots.filter((l) => l.status === "LIVE").length;
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="grid gap-10">
      <PageHeader
        title={`Hello, ${firstName}`}
        description={toShip.length ? `You have ${toShip.length} ${toShip.length === 1 ? "piece" : "pieces"} waiting to ship.` : "Nothing waiting to ship. Nice work."}
        actions={
          <>
            <Link href="/dashboard/products/new" className={buttonVariants({ size: "lg" })}>
              List a piece
            </Link>
            <Link href="/dashboard/auctions/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Schedule an auction
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pieces for sale" value={String(productCount)} note={lowStock ? `${lowStock} running low` : "Stock looks healthy"} tone={lowStock ? "madder" : "indigo"} />
        <StatTile label="Lots live" value={String(liveCount)} note={`${lots.length - liveCount} coming up`} tone="saffron" />
        <StatTile label="Sales" value={formatCents(grossCents)} note="Paid orders, all time" tone="weld" />
        <StatTile label="Your earnings" value={formatCents(netCents)} note={`After the ${shop.commissionBps / 100}% platform fee`} tone="weld" />
      </div>

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-2xl">Ready to ship</h2>
          <Link href="/dashboard/orders" className="text-sm font-semibold text-indigo underline decoration-indigo/30 decoration-2 underline-offset-4">
            All orders
          </Link>
        </div>
        {toShip.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            When a collector pays, the piece shows up here so you can pack it and add tracking.
          </p>
        ) : (
          <ul className="grid divide-y overflow-hidden rounded-2xl border bg-card">
            {toShip.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-indigo-soft">
                  {item.product.images[0] && <Image src={item.product.images[0].url} alt="" fill sizes="48px" className="object-cover" />}
                </div>
                <div className="grid flex-1 gap-0.5">
                  <span className="font-semibold">
                    {item.titleSnapshot}
                    {item.qty > 1 && <span className="text-muted-foreground"> x{item.qty}</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">For {item.order.buyer.name}</span>
                </div>
                <Link href="/dashboard/orders" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Add tracking
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-2xl">Your lots</h2>
          <Link href="/dashboard/auctions" className="text-sm font-semibold text-indigo underline decoration-indigo/30 decoration-2 underline-offset-4">
            Manage auctions
          </Link>
        </div>
        {lots.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            Have a one-off piece? Schedule an auction and let collectors bid on it.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
            {lots.map((a) => (
              <AuctionCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
