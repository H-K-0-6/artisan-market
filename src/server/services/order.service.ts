import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { commissionCents } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import { createNotification, notify, pushNotifications } from "@/server/services/notification.service";
import { emitToAdmins } from "@/server/realtime/emit";

/** A user-facing failure (bad cart, not enough stock, not allowed...). */
export class OrderError extends Error {}

type Tx = Prisma.TransactionClient;
type NotificationRow = Awaited<ReturnType<typeof createNotification>>;

// ---------------------------------------------------------------------------
// Checkout: cart -> PENDING order with stock reserved
// ---------------------------------------------------------------------------

/**
 * Turns the buyer's cart into a PENDING CART order in one transaction:
 * re-reads prices from the DB, reserves stock with a conditional decrement
 * (so two buyers can never both get the last unit), snapshots each line and
 * empties the cart. Throws OrderError with a readable message on any problem.
 */
export async function createOrderFromCart(buyerId: string) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { userId: buyerId },
      include: {
        items: {
          // Lock rows in a stable order to avoid deadlocks between concurrent checkouts.
          orderBy: { productId: "asc" },
          include: {
            product: {
              include: {
                artisan: { select: { id: true, userId: true, commissionBps: true, user: { select: { banned: true } } } },
              },
            },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) throw new OrderError("Your cart is empty");

    for (const { product: p, qty } of cart.items) {
      if (p.status !== "ACTIVE" || p.priceCents <= 0 || p.artisan.user.banned) {
        throw new OrderError(`"${p.title}" is no longer available. Remove it from your cart to continue.`);
      }
      if (p.artisan.userId === buyerId) throw new OrderError(`You can't buy your own product "${p.title}"`);
      if (qty < 1) throw new OrderError(`Invalid quantity for "${p.title}"`);
    }

    for (const { product: p, qty } of cart.items) {
      const { count } = await tx.product.updateMany({
        where: { id: p.id, status: "ACTIVE", stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      });
      if (count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: p.id }, select: { stock: true } });
        const left = fresh?.stock ?? 0;
        throw new OrderError(
          left > 0
            ? `Only ${left} of "${p.title}" left. Update your cart and try again.`
            : `"${p.title}" just sold out. Remove it from your cart to continue.`,
        );
      }
    }

    const lines = cart.items.map(({ product: p, qty }) => ({
      productId: p.id,
      artisanId: p.artisan.id,
      titleSnapshot: p.title,
      unitPriceCents: p.priceCents,
      qty,
      commission: commissionCents(p.priceCents * qty, p.artisan.commissionBps),
    }));
    const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);

    const order = await tx.order.create({
      data: {
        buyerId,
        source: "CART",
        status: "PENDING",
        subtotalCents,
        commissionCents: lines.reduce((s, l) => s + l.commission, 0),
        totalCents: subtotalCents,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            artisanId: l.artisanId,
            titleSnapshot: l.titleSnapshot,
            unitPriceCents: l.unitPriceCents,
            qty: l.qty,
          })),
        },
      },
      include: { items: true },
    });

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return order;
  });
}

async function restoreStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { productId: "asc" } });
  for (const item of items) {
    await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.qty } } });
  }
  return items;
}

/**
 * Moves a PENDING CART order to CANCELLED/EXPIRED and gives its reserved stock
 * back. A no-op (returns false) if the order is no longer PENDING, so it is safe
 * to call more than once. With `restoreCart`, the items go back into the cart.
 */
export async function releaseCartOrder(
  orderId: string,
  status: "CANCELLED" | "EXPIRED",
  opts: { restoreCart?: boolean; db?: Tx } = {},
) {
  const run = async (tx: Tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, source: "CART", status: "PENDING" },
      data: { status },
    });
    if (count === 0) return false;
    const items = await restoreStock(tx, orderId);
    if (opts.restoreCart) {
      const { buyerId } = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { buyerId: true } });
      const cart = await tx.cart.upsert({ where: { userId: buyerId }, update: {}, create: { userId: buyerId } });
      for (const item of items) {
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
          update: { qty: { increment: item.qty } },
          create: { cartId: cart.id, productId: item.productId, qty: item.qty },
        });
      }
    }
    return true;
  };
  return opts.db ? run(opts.db) : prisma.$transaction(run);
}

// ---------------------------------------------------------------------------
// Stripe webhook events
// ---------------------------------------------------------------------------

export type StripeEventResult =
  | { outcome: "duplicate" }
  | { outcome: "ignored" }
  | { outcome: "processed"; orderId?: string; changed: boolean; refunded?: boolean };

/** Refunds a whole PaymentIntent. Injected so tests don't call Stripe. */
export type RefundPayment = (paymentIntentId: string, idempotencyKey: string) => Promise<void>;

const stripeRefund: RefundPayment = async (paymentIntentId, idempotencyKey) => {
  const { stripe } = await import("@/lib/stripe");
  await stripe.refunds.create(
    { payment_intent: paymentIntentId, reason: "duplicate", metadata: { reason: "order no longer payable" } },
    { idempotencyKey },
  );
};

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
]);

/**
 * Applies a verified Stripe event. The ProcessedStripeEvent row is inserted in
 * the same transaction as the side effects, so a replayed (or concurrently
 * redelivered) event id changes nothing. Socket pushes happen after commit.
 */
export async function handleStripeEvent(
  event: Pick<Stripe.Event, "id" | "type" | "data">,
  deps: { refund?: RefundPayment } = {},
): Promise<StripeEventResult> {
  if (!HANDLED.has(event.type)) return { outcome: "ignored" };
  const session = event.data.object as Stripe.Checkout.Session;

  const result = await prisma.$transaction(async (tx) => {
    // ON CONFLICT DO NOTHING: a concurrent delivery of the same id waits on the
    // unique index and then inserts nothing.
    const { count } = await tx.processedStripeEvent.createMany({
      data: [{ id: event.id, type: event.type }],
      skipDuplicates: true,
    });
    if (count === 0) return { outcome: "duplicate" as const, notifications: [], adminMessage: null, refund: null };

    if (event.type === "checkout.session.expired") return onSessionExpired(tx, session);
    return onSessionPaid(tx, session);
  });

  if (result.outcome === "duplicate") return { outcome: "duplicate" };
  pushNotifications(result.notifications);
  if (result.adminMessage) emitToAdmins("order", result.adminMessage);

  // Money arrived for an order that can no longer be fulfilled: give it back.
  // This runs after commit (never call Stripe inside a DB transaction). The event is
  // already recorded, so a failure here is surfaced to admins rather than retried.
  let refunded: boolean | undefined;
  if (result.refund) {
    const { paymentIntentId, orderId, buyerId, reason } = result.refund;
    try {
      await (deps.refund ?? stripeRefund)(paymentIntentId, `refund-${paymentIntentId}`);
      refunded = true;
      await notify({
        userId: buyerId,
        type: "SYSTEM",
        title: "Payment refunded",
        body: `We refunded a payment for an order that was ${reason}. You won't be charged.`,
        link: `/account/orders/${orderId}`,
      });
      emitToAdmins("order", `Refunded ${paymentIntentId} for order ${orderId} (${reason})`);
    } catch (err) {
      refunded = false;
      console.error(`[stripe] refund of ${paymentIntentId} for order ${orderId} failed`, err);
      emitToAdmins("order", `REFUND FAILED for order ${orderId} (${paymentIntentId}); refund it in Stripe`);
    }
  }
  return { outcome: "processed", orderId: result.orderId, changed: result.changed, refunded };
}

type TxResult = {
  outcome: "processed";
  orderId?: string;
  changed: boolean;
  notifications: NotificationRow[];
  adminMessage: string | null;
  refund: { paymentIntentId: string; orderId: string; buyerId: string; reason: string } | null;
};

async function findOrderForSession(tx: Tx, session: Stripe.Checkout.Session) {
  // Auction orders get a fresh session per payment attempt, so prefer the
  // orderId from metadata over the (latest) stored session id.
  const orderId = session.metadata?.orderId;
  return tx.order.findFirst({
    where: orderId ? { id: orderId } : { stripeCheckoutSessionId: session.id },
    include: { items: { include: { artisan: { select: { userId: true } } } } },
  });
}

async function onSessionPaid(tx: Tx, session: Stripe.Checkout.Session): Promise<TxResult> {
  const none: TxResult = { outcome: "processed", changed: false, notifications: [], adminMessage: null, refund: null };
  if (session.payment_status !== "paid") return none; // async methods finish later

  const order = await findOrderForSession(tx, session);
  if (!order) {
    console.warn(`[stripe] paid session ${session.id} has no matching order`);
    return none;
  }

  const shipping = session.collected_information?.shipping_details ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  // Only PENDING orders transition, so replays and late events are harmless.
  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutSessionId: session.id,
      ...(shipping ? { shippingAddress: shipping as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  if (count === 0) {
    // Either the order is no longer payable (expired/cancelled), or it was already
    // paid by a different payment (e.g. two open auction sessions both paid).
    // The same payment arriving again via another event type is not a double charge.
    const alreadyPaid = ["PAID", "SHIPPED", "DELIVERED", "REFUNDED"].includes(order.status);
    const samePayment = alreadyPaid && paymentIntentId != null && paymentIntentId === order.stripePaymentIntentId;
    if (paymentIntentId && !samePayment) {
      const reason = alreadyPaid ? "already paid" : order.status.toLowerCase();
      console.warn(`[stripe] session ${session.id} paid but order ${order.id} is ${order.status}; refunding`);
      return { ...none, orderId: order.id, refund: { paymentIntentId, orderId: order.id, buyerId: order.buyerId, reason } };
    }
    return { ...none, orderId: order.id };
  }

  if (order.auctionId) {
    await tx.auction.update({ where: { id: order.auctionId }, data: { status: "PAID" } });
  }

  const total = (order.totalCents / 100).toFixed(2);
  const notifications = [
    await createNotification(
      {
        userId: order.buyerId,
        type: "ORDER_PAID",
        title: "Payment received",
        body: `Thanks! Your payment of $${total} was received. We'll let you know when it ships.`,
        link: `/account/orders/${order.id}`,
      },
      tx,
    ),
  ];
  const artisanUsers = new Map<string, string[]>();
  for (const item of order.items) {
    const list = artisanUsers.get(item.artisan.userId) ?? [];
    list.push(item.qty > 1 ? `${item.titleSnapshot} x${item.qty}` : item.titleSnapshot);
    artisanUsers.set(item.artisan.userId, list);
  }
  for (const [userId, titles] of artisanUsers) {
    notifications.push(
      await createNotification(
        {
          userId,
          type: "ORDER_PAID",
          title: "New order to ship",
          body: `Paid order: ${titles.join(", ")}`,
          link: "/dashboard/orders",
        },
        tx,
      ),
    );
  }

  return {
    outcome: "processed",
    orderId: order.id,
    changed: true,
    notifications,
    adminMessage: `Order ${order.id} paid (${total}, ${order.source.toLowerCase()})`,
    refund: null,
  };
}

async function onSessionExpired(tx: Tx, session: Stripe.Checkout.Session): Promise<TxResult> {
  const none: TxResult = { outcome: "processed", changed: false, notifications: [], adminMessage: null, refund: null };
  const order = await findOrderForSession(tx, session);
  // AUCTION orders: the winner may open a new session until payDeadline; the
  // auction jobs expire those. CART orders: only the order's current session counts.
  if (!order || order.source !== "CART") return { ...none, orderId: order?.id };
  if (order.stripeCheckoutSessionId && order.stripeCheckoutSessionId !== session.id) return { ...none, orderId: order.id };

  const changed = await releaseCartOrder(order.id, "EXPIRED", { db: tx });
  return {
    ...none,
    orderId: order.id,
    changed,
    adminMessage: changed ? `Checkout for order ${order.id} expired; stock restored` : null,
  };
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * Marks one order line shipped. Only the artisan who owns the line may do it,
 * and only while the order is PAID. When every line is shipped the order moves
 * to SHIPPED and the buyer is notified.
 */
export async function markItemShipped(artisanUserId: string, orderItemId: string, trackingNo: string) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({
      where: { id: orderItemId, artisan: { userId: artisanUserId } },
      include: { order: { select: { id: true, status: true, buyerId: true } } },
    });
    if (!item) throw new OrderError("Order item not found");
    if (item.order.status !== "PAID") throw new OrderError("Only paid orders can be marked shipped");
    if (item.shippedAt) throw new OrderError("This item is already marked shipped");

    const { count } = await tx.orderItem.updateMany({
      where: { id: item.id, shippedAt: null },
      data: { shippedAt: new Date(), trackingNo },
    });
    if (count === 0) throw new OrderError("This item is already marked shipped");

    const remaining = await tx.orderItem.count({ where: { orderId: item.orderId, shippedAt: null } });
    if (remaining > 0) return { orderShipped: false, notifications: [] as NotificationRow[] };

    const moved = await tx.order.updateMany({ where: { id: item.orderId, status: "PAID" }, data: { status: "SHIPPED" } });
    if (moved.count === 0) return { orderShipped: false, notifications: [] as NotificationRow[] };
    const n = await createNotification(
      {
        userId: item.order.buyerId,
        type: "ORDER_SHIPPED",
        title: "Your order has shipped",
        body: `Order ${item.orderId.slice(-8)} is on its way. Tracking: ${trackingNo}`,
        link: `/account/orders/${item.orderId}`,
      },
      tx,
    );
    return { orderShipped: true, notifications: [n] };
  });

  pushNotifications(result.notifications);
  return { orderShipped: result.orderShipped };
}
