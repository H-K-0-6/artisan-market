import "server-only";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { createNotification, pushNotifications } from "@/server/services/notification.service";
import { emitToAdmins, emitToAuction, emitToUser } from "@/server/realtime/emit";
import { BidError, createRateLimiter, evaluateBid, maskName, type AuctionForBid } from "@/server/services/bid.rules";

export { BidError } from "@/server/services/bid.rules";
export type { BidErrorCode } from "@/server/services/bid.rules";

// About 5 bids per second per user. In-memory, so per process (fine for one node).
const globalForLimiter = globalThis as unknown as { bidLimiter?: ReturnType<typeof createRateLimiter> };
const takeBidToken = (globalForLimiter.bidLimiter ??= createRateLimiter(5, 1000));

type LockedAuction = AuctionForBid & { id: string; productId: string };

export type PlacedBid = {
  bidId: string;
  auctionId: string;
  amountCents: number;
  minNextBidCents: number;
  endsAt: string;
  bidCount: number;
  reserveMet: boolean;
  extended: boolean;
};

/**
 * The only way a bid is written. One transaction:
 *  1. lock the auction row (SELECT ... FOR UPDATE) so bids on it are serialized;
 *  2. read the database clock (after the lock, so lock waits don't make it stale);
 *  3. re-read the bidder (role, ban) and validate with evaluateBid();
 *  4. insert the Bid, update the auction (price, high bidder, count, reserve, anti-snipe);
 *  5. store an OUTBID notification for the previous high bidder.
 * Socket events go out only after commit.
 */
export async function placeBid(userId: string, auctionId: string, amountCents: number): Promise<PlacedBid> {
  if (!takeBidToken(userId)) throw new BidError("RATE_LIMITED", "You're bidding too fast. Try again in a moment.");

  const r = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<LockedAuction[]>`
        SELECT a.id, a.status::text AS status, a."endsAt", a."startPriceCents", a."minIncrementCents",
               a."reservePriceCents", a."currentPriceCents", a."highBidderId", a."bidCount", a."productId",
               s."userId" AS "artisanUserId"
        FROM "Auction" a JOIN "ArtisanProfile" s ON s.id = a."artisanId"
        WHERE a.id = ${auctionId}
        FOR UPDATE OF a`;
      const auction = locked[0];
      if (!auction) throw new BidError("NOT_FOUND", "Auction not found");

      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS now`;
      const bidder = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true, banned: true, banExpires: true },
      });
      if (!bidder) throw new BidError("NOT_ALLOWED", "Your account can't place bids");

      const accepted = evaluateBid(auction, bidder, amountCents, now);

      // createdAt is the locked "now", so Bid order by time matches the order bids were accepted.
      const bid = await tx.bid.create({
        data: { auctionId, bidderId: userId, amountCents, createdAt: now },
        select: { id: true },
      });
      const updated = await tx.auction.update({
        where: { id: auctionId },
        data: {
          currentPriceCents: amountCents,
          highBidderId: userId,
          bidCount: { increment: 1 },
          reserveMet: accepted.reserveMet,
          endsAt: accepted.endsAt,
        },
        select: { bidCount: true, product: { select: { title: true } } },
      });

      const previous = auction.highBidderId;
      const outbid =
        previous && previous !== userId
          ? await createNotification(
              {
                userId: previous,
                type: "OUTBID",
                title: `You've been outbid on ${updated.product.title}`,
                body: `The current bid is ${formatCents(amountCents)}. Bid again before the auction ends.`,
                link: `/auctions/${auctionId}`,
              },
              tx,
            )
          : null;

      return { bidId: bid.id, bidder, accepted, bidCount: updated.bidCount, title: updated.product.title, previous, outbid };
    },
    { timeout: 5_000, maxWait: 10_000 },
  );

  // Committed: broadcast.
  const endsAt = r.accepted.endsAt.toISOString();
  const serverNow = Date.now();
  emitToAuction(auctionId, "bid:placed", {
    auctionId,
    amountCents,
    bidderAlias: maskName(r.bidder.name),
    minNextBidCents: r.accepted.minNextBidCents,
    endsAt,
    bidCount: r.bidCount,
    reserveMet: r.accepted.reserveMet,
    serverNow,
  });
  if (r.accepted.extended) emitToAuction(auctionId, "auction:extended", { auctionId, endsAt, serverNow });
  if (r.outbid && r.previous) {
    emitToUser(r.previous, "bid:outbid", { auctionId, title: r.title, amountCents });
    pushNotifications([r.outbid]);
  }
  emitToAdmins("bid", `${formatCents(amountCents)} bid on ${r.title}`);

  return {
    bidId: r.bidId,
    auctionId,
    amountCents,
    minNextBidCents: r.accepted.minNextBidCents,
    endsAt,
    bidCount: r.bidCount,
    reserveMet: r.accepted.reserveMet,
    extended: r.accepted.extended,
  };
}

/** Maps a thrown error to a client-safe shape for the route handler and server action. */
export function toBidErrorResponse(err: unknown) {
  if (err instanceof BidError) return { code: err.code, message: err.message, minCents: err.minCents };
  console.error("[bid] unexpected error", err);
  return { code: "SERVER_ERROR" as const, message: "Something went wrong placing your bid. Please try again." };
}
