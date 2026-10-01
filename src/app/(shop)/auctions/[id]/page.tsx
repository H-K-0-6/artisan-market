import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getPublicAuction, recentBids } from "@/server/queries/auctions";
import { LiveAuction } from "@/components/auction/live-auction";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.auction.findUnique({ where: { id }, select: { product: { select: { title: true } } } });
  return { title: a ? `Auction: ${a.product.title}` : "Auction" };
}

export default async function AuctionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [auction, session] = await Promise.all([getPublicAuction(id), getSession()]);
  const bids = await recentBids(id);
  const user = session?.user;

  const isOwner = user?.id === auction.artisan.userId;
  const canBid = !!user && !user.banned && user.role === "buyer" && !isOwner;
  const reason = isOwner
    ? "This is your auction, so you can't bid on it."
    : user && user.role !== "buyer"
      ? "Only buyer accounts can bid."
      : undefined;

  const myOrder =
    user && auction.winnerId === user.id
      ? await prisma.order.findUnique({ where: { auctionId: id }, select: { id: true, status: true, payDeadline: true } })
      : null;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-4">
        <Link href="/auctions" className="text-sm text-muted-foreground hover:underline">
          ← All auctions
        </Link>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
          {auction.product.images[0] && (
            <Image src={auction.product.images[0].url} alt={auction.product.title} fill loading="eager" sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
          )}
        </div>
        {auction.product.images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {auction.product.images.slice(1, 5).map((img) => (
              <div key={img.url} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image src={img.url} alt="" fill sizes="15vw" className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid content-start gap-6">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{auction.product.title}</h1>
          <p className="text-sm text-muted-foreground">
            by {auction.artisan.shopName} · starts at {formatCents(auction.startPriceCents)} · increments of{" "}
            {formatCents(auction.minIncrementCents)}
          </p>
        </div>

        <LiveAuction
          auctionId={auction.id}
          title={auction.product.title}
          initial={{
            status: auction.status as "SCHEDULED" | "LIVE" | "ENDED" | "PAID" | "UNSOLD" | "CANCELLED",
            currentPriceCents: auction.currentPriceCents,
            minNextBidCents: auction.minNextBidCents,
            minIncrementCents: auction.minIncrementCents,
            bidCount: auction.bidCount,
            reserveMet: auction.reserveMet,
            hasReserve: auction.reservePriceCents != null,
            startsAt: auction.startsAt.toISOString(),
            endsAt: auction.endsAt.toISOString(),
            serverNow: auction.serverNow,
          }}
          bids={bids.map((b) => ({ id: b.id, alias: b.alias, amountCents: b.amountCents, createdAt: b.createdAt, mine: b.bidderId === user?.id }))}
          viewer={{ signedIn: !!user, canBid, reason }}
          myOrder={myOrder ? { ...myOrder, payDeadline: myOrder.payDeadline?.toISOString() ?? null } : null}
          myHighBidCents={user && auction.highBidderId === user.id ? auction.currentPriceCents : null}
        />

        <section className="grid gap-2">
          <h2 className="font-medium">About this piece</h2>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{auction.product.description}</p>
        </section>
      </div>
    </div>
  );
}
