import "server-only";
import { prisma } from "@/lib/db";
import { createNotification, pushNotifications } from "@/server/services/notification.service";
import { emitToAdmins, emitToAuction } from "@/server/realtime/emit";

// Owned by the auctions workstream (Phases 4–5). The admin dashboard calls
// cancelAuction(); its signature is fixed here so both can be built in parallel.

export type CancelAuctionInput = {
  auctionId: string;
  /** Admin or owning artisan performing the cancel. */
  actorId: string;
  reason: string;
};

export class AuctionError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "NOT_CANCELLABLE" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

type LockedRow = { id: string; status: string; artisanUserId: string; title: string };

/**
 * Cancels a DRAFT/SCHEDULED/LIVE auction (or an ENDED one whose order is unpaid):
 * sets status CANCELLED, expires/cancels any PENDING winner order, notifies bidders,
 * and emits `auction:ended` with result CANCELLED. Throws if not cancellable.
 *
 * Permissions: an admin may cancel DRAFT, SCHEDULED, LIVE, or ENDED-with-a-PENDING-order.
 * The owning artisan may cancel only DRAFT or SCHEDULED (before it goes live).
 * `cancelledReason` is stored as "Cancelled by <role> <name>: <reason>".
 * The caller (admin action) is responsible for any AuditLog entry.
 */
export async function cancelAuction(input: CancelAuctionInput): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AuctionError("INVALID", "Give a reason for cancelling");
  if (reason.length > 500) throw new AuctionError("INVALID", "Keep the reason under 500 characters");

  const result = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT a.id, a.status::text AS status, s."userId" AS "artisanUserId", p.title
        FROM "Auction" a
        JOIN "ArtisanProfile" s ON s.id = a."artisanId"
        JOIN "Product" p ON p.id = a."productId"
        WHERE a.id = ${input.auctionId}
        FOR UPDATE OF a`;
      const a = rows[0];
      if (!a) throw new AuctionError("NOT_FOUND", "Auction not found");

      const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { name: true, role: true } });
      const isAdmin = actor?.role === "admin";
      const isOwner = actor != null && input.actorId === a.artisanUserId;
      if (!isAdmin && !isOwner) throw new AuctionError("FORBIDDEN", "You can't cancel this auction");

      const allowed = isAdmin ? ["DRAFT", "SCHEDULED", "LIVE", "ENDED"] : ["DRAFT", "SCHEDULED"];
      if (!allowed.includes(a.status)) {
        throw new AuctionError(
          "NOT_CANCELLABLE",
          isOwner && !isAdmin && a.status === "LIVE"
            ? "Live auctions can only be cancelled by an admin"
            : `A ${a.status.toLowerCase()} auction can't be cancelled`,
        );
      }

      // An ENDED auction is cancellable only while its winner order is unpaid.
      let cancelledOrder: { id: string; buyerId: string } | null = null;
      if (a.status === "ENDED") {
        const orders = await tx.$queryRaw<{ id: string; buyerId: string }[]>`
          UPDATE "Order" SET status = 'CANCELLED', "updatedAt" = (now() AT TIME ZONE 'UTC')
          WHERE "auctionId" = ${a.id} AND status = 'PENDING'
          RETURNING id, "buyerId"`;
        const anyOrder = await tx.order.findUnique({ where: { auctionId: a.id }, select: { status: true } });
        if (orders.length === 0 && anyOrder) {
          throw new AuctionError("NOT_CANCELLABLE", `The winner's order is already ${anyOrder.status.toLowerCase()}`);
        }
        cancelledOrder = orders[0] ?? null;
      }

      const who = `${actor!.role} ${actor!.name}`;
      await tx.$executeRaw`
        UPDATE "Auction" SET status = 'CANCELLED', "endedAt" = COALESCE("endedAt", (now() AT TIME ZONE 'UTC')),
          "cancelledReason" = ${`Cancelled by ${who}: ${reason}`}, "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE id = ${a.id}`;

      // Everyone who bid, plus the artisan when someone else cancelled.
      const bidders = await tx.bid.findMany({ where: { auctionId: a.id }, distinct: ["bidderId"], select: { bidderId: true } });
      const recipients = new Set(bidders.map((b) => b.bidderId));
      if (cancelledOrder) recipients.add(cancelledOrder.buyerId);
      recipients.delete(input.actorId);
      const notifications = [];
      for (const userId of recipients) {
        notifications.push(
          await createNotification(
            {
              userId,
              type: "SYSTEM",
              title: `Auction cancelled: ${a.title}`,
              body:
                cancelledOrder?.buyerId === userId
                  ? "This auction was cancelled, so you won't be charged."
                  : "This auction was cancelled and no sale will take place.",
              link: `/auctions/${a.id}`,
            },
            tx,
          ),
        );
      }
      if (input.actorId !== a.artisanUserId) {
        notifications.push(
          await createNotification(
            {
              userId: a.artisanUserId,
              type: "AUCTION_ENDED",
              title: `Your auction was cancelled: ${a.title}`,
              body: `Reason: ${reason}`,
              link: `/dashboard/auctions/${a.id}`,
            },
            tx,
          ),
        );
      }
      return { title: a.title, cancelledOrder, notifications, who };
    },
    { timeout: 10_000, maxWait: 10_000 },
  );

  emitToAuction(input.auctionId, "auction:ended", { auctionId: input.auctionId, result: "CANCELLED", finalPriceCents: null });
  pushNotifications(result.notifications);
  emitToAdmins("auction", `Auction cancelled by ${result.who}: ${result.title}`);
}
