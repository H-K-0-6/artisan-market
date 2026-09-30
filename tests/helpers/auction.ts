import { prisma } from "@/lib/db";
import type { AuctionStatus } from "@/generated/prisma/client";

const MIN = 60_000;

/** An auction on a product; LIVE for 30 minutes by default. */
export function makeAuction(
  artisanId: string,
  productId: string,
  over: {
    status?: AuctionStatus;
    startPriceCents?: number;
    minIncrementCents?: number;
    reservePriceCents?: number | null;
    startsAt?: Date;
    endsAt?: Date;
  } = {},
) {
  const endsAt = over.endsAt ?? new Date(Date.now() + 30 * MIN);
  return prisma.auction.create({
    data: {
      artisanId,
      productId,
      status: over.status ?? "LIVE",
      startPriceCents: over.startPriceCents ?? 1000,
      minIncrementCents: over.minIncrementCents ?? 100,
      reservePriceCents: over.reservePriceCents ?? null,
      startsAt: over.startsAt ?? new Date(Date.now() - MIN),
      endsAt,
      originalEndsAt: endsAt,
    },
  });
}

/** Moves an auction's end into the past, as if time had run out. */
export const expireAuctionNow = (id: string) =>
  prisma.auction.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
