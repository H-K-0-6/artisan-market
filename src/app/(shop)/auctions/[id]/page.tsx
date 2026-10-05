import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getPublicAuction, recentBids } from "@/server/queries/auctions";
import { LiveAuction } from "@/components/auction/live-auction";
import { lotLabel } from "@/components/brand/live";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.auction.findUnique({ where: { id }, select: { lotNumber: true, product: { select: { title: true } } } });
  return { title: a ? `${lotLabel(a.lotNumber)}: ${a.product.title}` : "Auction" };
}

const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function AuctionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [auction, session] = await Promise.all([getPublicAuction(id), getSession()]);
  const bids = await recentBids(id);
  const user = session?.user;

  const isOwner = user?.id === auction.artisan.userId;
  const canBid = !!user && !user.banned && user.role === "buyer" && !isOwner;
  const reason = isOwner
    ? "This is your lot, so you can't bid on it."
    : user && user.role !== "buyer"
      ? "Bidding is for collector accounts. Sign in as a buyer to bid."
      : undefined;

  const myOrder =
    user && auction.winnerId === user.id
      ? await prisma.order.findUnique({ where: { auctionId: id }, select: { id: true, status: true, payDeadline: true } })
      : null;

  const details = [
    { label: "Opening bid", value: formatCents(auction.startPriceCents) },
    { label: "Bid increment", value: formatCents(auction.minIncrementCents) },
    { label: "Reserve", value: auction.reservePriceCents != null ? "Yes, hidden until met" : "None" },
    { label: "Opens", value: when.format(auction.startsAt) },
    { label: "Scheduled to close", value: when.format(auction.originalEndsAt) },
  ];

  return (
    <div className="grid gap-10">
      <Link href="/auctions" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        All auctions
      </Link>

      {/* Mobile order: photo, then bidding, then details. Desktop pins bidding in the right column. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] lg:gap-x-14">
        <div className="grid content-start gap-8">
          <div className="grid gap-3">
            <h1 className="display text-4xl sm:text-5xl">{auction.product.title}</h1>
            <p className="text-muted-foreground">
              Offered by{" "}
              <Link href={`/shops/${auction.artisan.slug}`} className="font-semibold text-foreground underline decoration-saffron decoration-2 underline-offset-4">
                {auction.artisan.shopName}
              </Link>
            </p>
          </div>

          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-indigo-soft sm:aspect-[5/4]">
            {auction.product.images[0] && (
              <Image src={auction.product.images[0].url} alt={auction.product.title} fill loading="eager" sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
            )}
          </div>
          {auction.product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {auction.product.images.slice(1, 5).map((img) => (
                <div key={img.url} className="relative aspect-square overflow-hidden rounded-xl bg-indigo-soft">
                  <Image src={img.url} alt="" fill sizes="15vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <LiveAuction
            auctionId={auction.id}
            lotNumber={auction.lotNumber}
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
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
            <section className="grid content-start gap-2">
              <h2 className="font-sans text-base font-semibold tracking-normal">About this piece</h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{auction.product.description}</p>
            </section>
            <section className="grid content-start gap-2">
              <h2 className="font-sans text-base font-semibold tracking-normal">Lot details</h2>
              <dl className="grid divide-y rounded-2xl border bg-card text-sm">
                {details.map((d) => (
                  <div key={d.label} className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="numeric text-right font-medium">{d.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">A bid in the final 2 minutes adds 2 more to the clock.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
