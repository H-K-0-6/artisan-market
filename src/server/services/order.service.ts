import "server-only";
import { prisma } from "@/lib/db";
import { commissionCents } from "@/lib/money";
import { createNotification, pushNotifications } from "@/server/services/notification.service";
import { CHECKOUT_HOLD_MS, releaseCartOrder } from "@/server/services/payments";

export { releaseCartOrder };

/** A user-facing failure (bad cart, not enough stock, not allowed...). */
export class OrderError extends Error {}

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
        paymentHoldUntil: new Date(Date.now() + CHECKOUT_HOLD_MS),
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
