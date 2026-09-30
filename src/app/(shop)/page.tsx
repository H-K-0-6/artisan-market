import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export default async function HomePage() {
  const [products, liveAuctions] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE", priceCents: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { images: { orderBy: { position: "asc" }, take: 1 }, artisan: { select: { shopName: true } } },
    }),
    prisma.auction.findMany({
      where: { status: "LIVE" },
      orderBy: { endsAt: "asc" },
      take: 4,
      include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
    }),
  ]);

  return (
    <div className="grid gap-12">
      <section className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Handcrafted, one piece at a time</h1>
        <p className="max-w-xl text-muted-foreground">
          Buy directly from independent makers, or bid on one-off pieces in live auctions.
        </p>
      </section>

      {liveAuctions.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Live now</h2>
            <Link href="/auctions" className="text-sm underline">All auctions</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {liveAuctions.map((a) => (
              <Link key={a.id} href={`/auctions/${a.id}`} className="group grid gap-2">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {a.product.images[0] && (
                    <Image src={a.product.images[0].url} alt={a.product.title} fill sizes="25vw" className="object-cover transition group-hover:scale-105" />
                  )}
                  <Badge className="absolute left-2 top-2">LIVE</Badge>
                </div>
                <div className="text-sm font-medium">{a.product.title}</div>
                <div className="text-sm text-muted-foreground">
                  {a.currentPriceCents ? `Current bid ${formatCents(a.currentPriceCents)}` : `Starts at ${formatCents(a.startPriceCents)}`}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">New in the shop</h2>
          <Link href="/products" className="text-sm underline">Browse all</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} className="group grid gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {p.images[0] && (
                  <Image src={p.images[0].url} alt={p.title} fill sizes="25vw" className="object-cover transition group-hover:scale-105" />
                )}
              </div>
              <div className="text-sm font-medium">{p.title}</div>
              <div className="text-sm text-muted-foreground">
                {formatCents(p.priceCents)} · {p.artisan.shopName}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
