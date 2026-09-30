import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { maskName, minNextBid } from "@/server/services/bid.rules";

const cardInclude = {
  product: { select: { title: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
  artisan: { select: { shopName: true, slug: true } },
} satisfies Prisma.AuctionInclude;

export type AuctionTab = "live" | "upcoming" | "ended";

/** Public auction listings for the /auctions tabs. */
export function listAuctions(tab: AuctionTab) {
  if (tab === "upcoming") {
    return prisma.auction.findMany({ where: { status: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 60, include: cardInclude });
  }
  if (tab === "ended") {
    return prisma.auction.findMany({
      where: { status: { in: ["ENDED", "PAID", "UNSOLD"] } },
      orderBy: { endedAt: "desc" },
      take: 60,
      include: cardInclude,
    });
  }
  return prisma.auction.findMany({ where: { status: "LIVE" }, orderBy: { endsAt: "asc" }, take: 60, include: cardInclude });
}

export type AuctionCardData = Awaited<ReturnType<typeof listAuctions>>[number];

/** Recent bids with bidder names masked (public view). */
export async function recentBids(auctionId: string, take = 20) {
  const bids = await prisma.bid.findMany({
    where: { auctionId },
    orderBy: { amountCents: "desc" },
    take,
    select: { id: true, amountCents: true, createdAt: true, bidderId: true, bidder: { select: { name: true } } },
  });
  return bids.map((b) => ({
    id: b.id,
    amountCents: b.amountCents,
    createdAt: b.createdAt.toISOString(),
    bidderId: b.bidderId,
    alias: maskName(b.bidder.name),
  }));
}

/** Everything the public live room needs. Drafts are never public. */
export async function getPublicAuction(id: string) {
  const a = await prisma.auction.findFirst({
    where: { id, status: { not: "DRAFT" } },
    include: {
      product: {
        select: {
          title: true,
          description: true,
          slug: true,
          images: { orderBy: { position: "asc" }, select: { url: true } },
        },
      },
      artisan: { select: { shopName: true, slug: true, userId: true } },
    },
  });
  if (!a) notFound();
  return { ...a, minNextBidCents: minNextBid(a), serverNow: Date.now() };
}

// ---------- Artisan dashboard ----------

export function listMyAuctions(artisanId: string) {
  return prisma.auction.findMany({
    where: { artisanId },
    orderBy: [{ createdAt: "desc" }],
    include: { product: { select: { title: true } }, order: { select: { status: true } } },
  });
}

export async function getMyAuction(artisanId: string, id: string) {
  const a = await prisma.auction.findFirst({
    where: { id, artisanId },
    include: {
      product: { select: { id: true, title: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
      order: { select: { id: true, status: true, payDeadline: true, paidAt: true, totalCents: true, commissionCents: true } },
      bids: { orderBy: { amountCents: "desc" }, select: { id: true, amountCents: true, createdAt: true, bidder: { select: { name: true } } } },
    },
  });
  if (!a) notFound();
  return a;
}

/** Products the artisan can put up for auction (listed or draft, no open auction). */
export function listAuctionableProducts(artisanId: string) {
  return prisma.product.findMany({
    where: {
      artisanId,
      status: { in: ["ACTIVE", "DRAFT"] },
      auctions: { none: { status: { in: ["DRAFT", "SCHEDULED", "LIVE", "ENDED"] } } },
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

// ---------- Buyer account ----------

/** Auctions the buyer has bid on, plus the ones they won (with order/payment status). */
export async function listMyBidding(userId: string) {
  const auctions = await prisma.auction.findMany({
    where: { bids: { some: { bidderId: userId } } },
    orderBy: { endsAt: "desc" },
    include: {
      ...cardInclude,
      order: { select: { id: true, status: true, payDeadline: true, buyerId: true, totalCents: true } },
      bids: { where: { bidderId: userId }, orderBy: { amountCents: "desc" }, take: 1, select: { amountCents: true } },
    },
  });
  return auctions.map((a) => ({ ...a, myTopBidCents: a.bids[0]?.amountCents ?? null }));
}
