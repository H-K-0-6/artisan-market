import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { commissionCents, formatCents } from "@/lib/money";
import { scheduleAuctionEnd, scheduleAuctionStart, scheduleOrderExpire } from "@/lib/boss";
import { createNotification, pushNotifications } from "@/server/services/notification.service";
import { emitToAdmins, emitToAuction, emitToUser } from "@/server/realtime/emit";

// Auction state transitions run by pg-boss jobs (src/server/jobs/*). Every step is
// a conditional UPDATE guarded by status and the DATABASE clock (now(), read as UTC), so running
// any of them twice, or concurrently, is harmless.
//
// Prisma stores DateTime as UTC in "timestamp without time zone" columns, and the
// database session TimeZone may not be UTC, so SQL compares against
// (now() AT TIME ZONE 'UTC') rather than bare now().
//
// No "server-only" import here: this module runs inside the tsx custom server.

export const PAY_WINDOW_MS = 48 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type NotificationRow = Awaited<ReturnType<typeof createNotification>>;

export type StepResult =
  | { kind: "done" }
  /** Not due yet (e.g. endsAt moved later by anti-sniping): run again at `at`. */
  | { kind: "reschedule"; at: Date }
  /** Nothing to do (already handled, cancelled, or missing). */
  | { kind: "noop" };

// ---------------------------------------------------------------------------
// SCHEDULED -> LIVE

export async function startAuction(auctionId: string): Promise<StepResult> {
  const rows = await prisma.$queryRaw<{ id: string; endsAt: Date; title: string }[]>`
    UPDATE "Auction" a SET status = 'LIVE', "updatedAt" = (now() AT TIME ZONE 'UTC')
    FROM "Product" p
    WHERE a.id = ${auctionId} AND p.id = a."productId"
      AND a.status = 'SCHEDULED' AND a."startsAt" <= (now() AT TIME ZONE 'UTC')
    RETURNING a.id, a."endsAt", p.title`;

  if (rows.length === 0) {
    const a = await prisma.auction.findUnique({ where: { id: auctionId }, select: { status: true, startsAt: true } });
    if (a?.status === "SCHEDULED") return { kind: "reschedule", at: a.startsAt };
    return { kind: "noop" };
  }

  const { endsAt, title } = rows[0];
  emitToAuction(auctionId, "auction:started", { auctionId, endsAt: endsAt.toISOString(), serverNow: Date.now() });
  emitToAdmins("auction", `Auction started: ${title}`);
  return { kind: "done" };
}

// ---------------------------------------------------------------------------
// LIVE -> ENDED (winner order created atomically) | UNSOLD

type ClosedRow = {
  id: string;
  status: "ENDED" | "UNSOLD";
  winnerId: string | null;
  currentPriceCents: number | null;
  bidCount: number;
  endedAt: Date;
  productId: string;
  artisanId: string;
};

export async function closeAuction(auctionId: string): Promise<StepResult> {
  const closed = await prisma.$transaction(
    async (tx) => {
      // Idempotent close: only one caller can move a LIVE auction past its end.
      // A concurrent bid holds the row lock; once it commits, Postgres re-checks
      // this WHERE against the new row, so an anti-snipe extension wins.
      const rows = await tx.$queryRaw<ClosedRow[]>`
        UPDATE "Auction" SET
          status = (CASE WHEN "bidCount" > 0 AND "highBidderId" IS NOT NULL AND "reserveMet"
                    THEN 'ENDED' ELSE 'UNSOLD' END)::"AuctionStatus",
          "winnerId" = CASE WHEN "bidCount" > 0 AND "reserveMet" THEN "highBidderId" ELSE NULL END,
          "endedAt" = (now() AT TIME ZONE 'UTC'),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE id = ${auctionId} AND status = 'LIVE' AND "endsAt" <= (now() AT TIME ZONE 'UTC')
        RETURNING id, status::text AS status, "winnerId", "currentPriceCents", "bidCount", "endedAt", "productId", "artisanId"`;
      if (rows.length === 0) return null;
      const a = rows[0];

      const product = await tx.product.findUniqueOrThrow({ where: { id: a.productId }, select: { title: true } });
      const shop = await tx.artisanProfile.findUniqueOrThrow({
        where: { id: a.artisanId },
        select: { userId: true, commissionBps: true },
      });
      const notifications: NotificationRow[] = [];
      let order: { id: string; payDeadline: Date } | null = null;

      if (a.status === "ENDED" && a.winnerId && a.currentPriceCents != null) {
        const price = a.currentPriceCents;
        const payDeadline = new Date(a.endedAt.getTime() + PAY_WINDOW_MS);
        const created = await tx.order.create({
          data: {
            buyerId: a.winnerId,
            source: "AUCTION",
            status: "PENDING",
            auctionId: a.id,
            subtotalCents: price,
            commissionCents: commissionCents(price, shop.commissionBps),
            totalCents: price,
            payDeadline,
            items: {
              create: [
                {
                  productId: a.productId,
                  artisanId: a.artisanId,
                  titleSnapshot: product.title,
                  unitPriceCents: price,
                  qty: 1,
                },
              ],
            },
          },
          select: { id: true },
        });
        order = { id: created.id, payDeadline };

        notifications.push(
          await createNotification(
            {
              userId: a.winnerId,
              type: "AUCTION_WON",
              title: `You won ${product.title}`,
              body: `Your winning bid was ${formatCents(price)}. Pay within 48 hours to secure it.`,
              link: `/pay/${order.id}`,
            },
            tx,
          ),
          await createNotification(
            {
              userId: shop.userId,
              type: "AUCTION_ENDED",
              title: `${product.title} sold for ${formatCents(price)}`,
              body: "The winner has 48 hours to pay. You'll be notified when the order is paid.",
              link: `/dashboard/auctions/${a.id}`,
            },
            tx,
          ),
        );
      } else {
        notifications.push(
          await createNotification(
            {
              userId: shop.userId,
              type: "AUCTION_ENDED",
              title: `${product.title} ended without a sale`,
              body: a.bidCount > 0 ? "Bidding didn't reach your reserve price." : "The auction received no bids.",
              link: `/dashboard/auctions/${a.id}`,
            },
            tx,
          ),
        );
      }

      return { auction: a, title: product.title, order, notifications };
    },
    { timeout: 10_000, maxWait: 10_000 },
  );

  if (!closed) {
    const a = await prisma.auction.findUnique({ where: { id: auctionId }, select: { status: true, endsAt: true } });
    if (a?.status === "LIVE") return { kind: "reschedule", at: a.endsAt };
    return { kind: "noop" };
  }

  // After commit: broadcast, push notifications, queue the payment deadline.
  const { auction: a, title, order, notifications } = closed;
  const sold = a.status === "ENDED";
  emitToAuction(a.id, "auction:ended", {
    auctionId: a.id,
    result: sold ? "SOLD" : "UNSOLD",
    finalPriceCents: sold ? a.currentPriceCents : null,
  });
  if (sold && order && a.winnerId) {
    emitToUser(a.winnerId, "auction:won", {
      auctionId: a.id,
      title,
      amountCents: a.currentPriceCents!,
      orderId: order.id,
    });
    await scheduleOrderExpire(order.id, order.payDeadline);
  }
  pushNotifications(notifications);
  emitToAdmins(
    "auction",
    sold ? `Auction sold: ${title} for ${formatCents(a.currentPriceCents!)}` : `Auction ended unsold: ${title}`,
  );
  return { kind: "done" };
}

// ---------------------------------------------------------------------------
// Unpaid winner order -> EXPIRED, auction -> UNSOLD

export async function expireAuctionOrder(orderId: string): Promise<StepResult> {
  const result = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; buyerId: string; auctionId: string; stripeCheckoutSessionId: string | null }[]
      >`
        UPDATE "Order" SET status = 'EXPIRED', "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE id = ${orderId} AND status = 'PENDING' AND source = 'AUCTION'
          AND "payDeadline" IS NOT NULL AND "payDeadline" <= (now() AT TIME ZONE 'UTC')
        RETURNING id, "buyerId", "auctionId", "stripeCheckoutSessionId"`;
      if (rows.length === 0) return null;
      const o = rows[0];

      await tx.$executeRaw`
        UPDATE "Auction" SET status = 'UNSOLD', "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE id = ${o.auctionId} AND status = 'ENDED'`;
      const auction = await tx.auction.findUniqueOrThrow({
        where: { id: o.auctionId },
        select: { id: true, product: { select: { title: true } }, artisan: { select: { userId: true } } },
      });
      const notifications = await notifyExpired(tx, o.buyerId, auction);
      return { order: o, notifications, title: auction.product.title };
    },
    { timeout: 10_000, maxWait: 10_000 },
  );

  if (!result) {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, payDeadline: true } });
    if (o?.status === "PENDING" && o.payDeadline) return { kind: "reschedule", at: o.payDeadline };
    return { kind: "noop" };
  }

  pushNotifications(result.notifications);
  emitToAdmins("order", `Payment window expired: ${result.title}`);
  if (result.order.stripeCheckoutSessionId) await expireCheckoutSession(result.order.stripeCheckoutSessionId);
  return { kind: "done" };
}

async function notifyExpired(
  tx: Tx,
  buyerId: string,
  auction: { id: string; product: { title: string }; artisan: { userId: string } },
) {
  return [
    await createNotification(
      {
        userId: buyerId,
        type: "SYSTEM",
        title: `Payment window closed for ${auction.product.title}`,
        body: "The 48-hour payment deadline passed, so the order was cancelled.",
        link: "/account/auctions",
      },
      tx,
    ),
    await createNotification(
      {
        userId: auction.artisan.userId,
        type: "AUCTION_ENDED",
        title: `${auction.product.title}: winner didn't pay`,
        body: "The payment deadline passed. The auction is now marked unsold.",
        link: `/dashboard/auctions/${auction.id}`,
      },
      tx,
    ),
  ];
}

/** Best effort: stop an open Checkout Session from being paid after the order is gone. */
export async function expireCheckoutSession(sessionId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    console.error("[auction] could not expire checkout session", err);
  }
}

// ---------------------------------------------------------------------------
// Safety sweep (every 30s): catches anything a missed or failed job left behind.

export async function sweep() {
  const [toStart, toClose, toExpire] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Auction" WHERE status = 'SCHEDULED' AND "startsAt" <= (now() AT TIME ZONE 'UTC') ORDER BY "startsAt" LIMIT 100`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Auction" WHERE status = 'LIVE' AND "endsAt" <= (now() AT TIME ZONE 'UTC') ORDER BY "endsAt" LIMIT 100`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE status = 'PENDING' AND source = 'AUCTION' AND "payDeadline" <= (now() AT TIME ZONE 'UTC') LIMIT 100`,
  ]);
  for (const { id } of toStart) await runStep("start", id, () => startAuction(id));
  // An auction that should have both started and ended closes in the same sweep.
  for (const { id } of [...toClose, ...toStart]) await runStep("close", id, () => closeAuction(id));
  for (const { id } of toExpire) await runStep("expire", id, () => expireAuctionOrder(id));
  return { started: toStart.length, closed: toClose.length, expired: toExpire.length };
}

async function runStep(label: string, id: string, fn: () => Promise<StepResult>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[sweep] ${label} ${id} failed`, err);
  }
}

/** Queues the start and end jobs for a newly scheduled auction. */
export async function queueAuctionJobs(auction: { id: string; startsAt: Date; endsAt: Date }) {
  await Promise.all([scheduleAuctionStart(auction.id, auction.startsAt), scheduleAuctionEnd(auction.id, auction.endsAt)]);
}
