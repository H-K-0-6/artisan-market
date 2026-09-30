import { prisma } from "@/lib/db";
import { minNextBid } from "@/server/services/bid.rules";
import type { ServerEvents } from "@/server/realtime/emit";

// No "server-only": also used by the Socket.IO handlers in the tsx custom server.

/** The public snapshot sent as `auction:state` when a client joins a room. */
export async function getAuctionState(auctionId: string): Promise<ServerEvents["auction:state"] | null> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true,
      status: true,
      currentPriceCents: true,
      startPriceCents: true,
      minIncrementCents: true,
      bidCount: true,
      reserveMet: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!a) return null;
  return {
    auctionId: a.id,
    status: a.status,
    currentPriceCents: a.currentPriceCents,
    minNextBidCents: minNextBid(a),
    endsAt: a.endsAt.toISOString(),
    startsAt: a.startsAt.toISOString(),
    bidCount: a.bidCount,
    reserveMet: a.reserveMet,
    serverNow: Date.now(),
  };
}
