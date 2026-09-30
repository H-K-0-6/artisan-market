import "server-only";
import { prisma } from "@/lib/db";
import { appUrl, stripe } from "@/lib/stripe";

const HOUR = 60 * 60 * 1000;

/**
 * Creates a Stripe Checkout Session for a PENDING order (cart or auction) and
 * stores its id on the order. A session can live at most 24h, so auction orders
 * get a fresh session each time the winner clicks "Pay now", capped at payDeadline.
 *
 * The webhook (src/app/api/webhooks/stripe/route.ts) is the only place that marks
 * orders PAID.
 */
export async function createCheckoutSessionForOrder(orderId: string, buyerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: { items: true, buyer: { select: { email: true } } },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "PENDING") throw new Error("This order can no longer be paid");
  if (order.payDeadline && order.payDeadline.getTime() <= Date.now()) {
    throw new Error("The payment deadline has passed");
  }

  // Stripe requires expires_at between 30 minutes and 24 hours from now.
  const maxExpiry = Date.now() + 23 * HOUR;
  const expiresAt = Math.max(
    Date.now() + 31 * 60 * 1000,
    Math.min(maxExpiry, order.payDeadline?.getTime() ?? maxExpiry),
  );

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: order.buyer.email,
      line_items: order.items.map((item) => ({
        quantity: item.qty,
        price_data: {
          currency: "usd",
          unit_amount: item.unitPriceCents,
          product_data: { name: item.titleSnapshot },
        },
      })),
      shipping_address_collection: { allowed_countries: ["US", "CA", "GB"] },
      metadata: { orderId: order.id, ...(order.auctionId ? { auctionId: order.auctionId } : {}) },
      payment_intent_data: { metadata: { orderId: order.id } },
      expires_at: Math.floor(expiresAt / 1000),
      success_url: appUrl(`/checkout/success?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: appUrl(order.source === "AUCTION" ? `/account/auctions` : `/cart`),
    },
    // One session per order per expiry window; retries within it reuse the same session.
    { idempotencyKey: `checkout-${order.id}-${Math.floor(expiresAt / HOUR)}` },
  );

  await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  return session;
}
