import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import {
  createOrderFromCart,
  handleStripeEvent,
  markItemShipped,
  OrderError,
  releaseCartOrder,
} from "@/server/services/order.service";
import { makeArtisan, makeProduct, makeUser, resetDb } from "../helpers/db";

async function fillCart(userId: string, productId: string, qty: number) {
  const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  await prisma.cartItem.create({ data: { cartId: cart.id, productId, qty } });
}

let evt = 0;
function sessionEvent(
  type: string,
  orderId: string,
  session: Partial<Stripe.Checkout.Session> = {},
  id = `evt_test_${++evt}`,
) {
  return {
    id,
    type,
    data: {
      object: {
        id: `cs_test_${orderId}`,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_test_123",
        metadata: { orderId },
        collected_information: {
          business_name: null,
          individual_name: null,
          shipping_details: {
            name: "Test Buyer",
            address: { line1: "1 Main St", line2: null, city: "Springfield", state: "IL", postal_code: "62701", country: "US" },
          },
        },
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}

describe("checkout and Stripe webhook handling", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates a PENDING order that snapshots prices, reserves stock, computes commission and clears the cart", async () => {
    const { shop } = await makeArtisan();
    await prisma.artisanProfile.update({ where: { id: shop.id }, data: { commissionBps: 1250 } });
    const a = await makeProduct(shop.id, { priceCents: 1999, stock: 5 });
    const b = await makeProduct(shop.id, { priceCents: 500, stock: 2 });
    const buyer = await makeUser();
    await fillCart(buyer.id, a.id, 3);
    await fillCart(buyer.id, b.id, 1);

    const order = await createOrderFromCart(buyer.id);

    expect(order.status).toBe("PENDING");
    expect(order.source).toBe("CART");
    expect(order.subtotalCents).toBe(1999 * 3 + 500);
    expect(order.totalCents).toBe(order.subtotalCents);
    // round(5997 * 0.125) + round(500 * 0.125) = 750 + 63
    expect(order.commissionCents).toBe(750 + 63);
    expect(order.items).toHaveLength(2);
    expect(order.items.find((i) => i.productId === a.id)).toMatchObject({
      titleSnapshot: a.title,
      unitPriceCents: 1999,
      qty: 3,
      artisanId: shop.id,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).stock).toBe(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: b.id } })).stock).toBe(1);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects over-stock carts and the artisan's own product without changing anything", async () => {
    const { user: artisanUser, shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 1 });
    const buyer = await makeUser();
    await fillCart(buyer.id, p.id, 2);
    await expect(createOrderFromCart(buyer.id)).rejects.toThrow(/Only 1 of/);

    await fillCart(artisanUser.id, p.id, 1);
    await expect(createOrderFromCart(artisanUser.id)).rejects.toBeInstanceOf(OrderError);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(1);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.cartItem.count()).toBe(2);
  });

  it("two concurrent checkouts for the last unit: exactly one succeeds and stock never goes negative", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 1 });
    const buyers = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]);
    for (const b of buyers) await fillCart(b.id, p.id, 1);

    const results = await Promise.allSettled(buyers.map((b) => createOrderFromCart(b.id)));

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(3);
    for (const f of failed) expect((f as PromiseRejectedResult).reason).toBeInstanceOf(OrderError);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(0);
    expect(await prisma.order.count()).toBe(1);
    // Losers keep their carts.
    expect(await prisma.cartItem.count()).toBe(3);
  });

  it("processes checkout.session.completed once even when the same event is delivered twice", async () => {
    const { user: artisanUser, shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 3 });
    const buyer = await makeUser();
    await fillCart(buyer.id, p.id, 2);
    const order = await createOrderFromCart(buyer.id);
    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: `cs_test_${order.id}` } });

    const event = sessionEvent("checkout.session.completed", order.id);
    const [first, second] = await Promise.all([handleStripeEvent(event), handleStripeEvent(event)]);
    const third = await handleStripeEvent(event);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["duplicate", "processed"]);
    expect(third.outcome).toBe("duplicate");

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();
    expect(paid.stripePaymentIntentId).toBe("pi_test_123");
    expect(paid.shippingAddress).toMatchObject({ name: "Test Buyer", address: { city: "Springfield" } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(1);
    expect(await prisma.processedStripeEvent.count()).toBe(1);
    // Buyer + artisan notified exactly once.
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "ORDER_PAID" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: artisanUser.id, type: "ORDER_PAID" } })).toBe(1);

    // A different event for the same session (e.g. a later async success) is a no-op too.
    const again = await handleStripeEvent(sessionEvent("checkout.session.async_payment_succeeded", order.id));
    expect(again).toMatchObject({ outcome: "processed", changed: false });
    expect(await prisma.notification.count()).toBe(2);
  });

  it("does not mark an order paid while payment_status is unpaid", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id);
    const buyer = await makeUser();
    await fillCart(buyer.id, p.id, 1);
    const order = await createOrderFromCart(buyer.id);

    await handleStripeEvent(sessionEvent("checkout.session.completed", order.id, { payment_status: "unpaid" }));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");

    await handleStripeEvent(sessionEvent("checkout.session.async_payment_succeeded", order.id));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });

  it("checkout.session.expired restores stock for a CART order, once", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 4 });
    const buyer = await makeUser();
    await fillCart(buyer.id, p.id, 3);
    const order = await createOrderFromCart(buyer.id);
    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: `cs_test_${order.id}` } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(1);

    const expired = sessionEvent("checkout.session.expired", order.id, { payment_status: "unpaid", status: "expired" });
    expect(await handleStripeEvent(expired)).toMatchObject({ outcome: "processed", changed: true });
    expect(await handleStripeEvent(expired)).toEqual({ outcome: "duplicate" });
    // A different expired event id for the same order must not restore twice either.
    expect(
      await handleStripeEvent(sessionEvent("checkout.session.expired", order.id, { payment_status: "unpaid" })),
    ).toMatchObject({ changed: false });

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(4);

    // A late completed event cannot resurrect an expired order.
    await handleStripeEvent(sessionEvent("checkout.session.completed", order.id));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
  });

  it("ignores expiry of AUCTION orders and marks the auction PAID on payment", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { priceCents: 0, stock: 1 });
    const buyer = await makeUser();
    const now = Date.now();
    const auction = await prisma.auction.create({
      data: {
        productId: p.id,
        artisanId: shop.id,
        status: "ENDED",
        startPriceCents: 1000,
        currentPriceCents: 4200,
        winnerId: buyer.id,
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now - 60_000),
        originalEndsAt: new Date(now - 60_000),
      },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        source: "AUCTION",
        auctionId: auction.id,
        subtotalCents: 4200,
        commissionCents: 420,
        totalCents: 4200,
        payDeadline: new Date(now + 48 * 3_600_000),
        items: {
          create: { productId: p.id, artisanId: shop.id, titleSnapshot: p.title, unitPriceCents: 4200, qty: 1 },
        },
      },
    });

    await handleStripeEvent(sessionEvent("checkout.session.expired", order.id, { payment_status: "unpaid" }));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(1);

    await handleStripeEvent(sessionEvent("checkout.session.completed", order.id, { id: "cs_test_second_attempt" }));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe("PAID");
  });

  it("releaseCartOrder cancels, restores stock and refills the cart, and is idempotent", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 2 });
    const buyer = await makeUser();
    await fillCart(buyer.id, p.id, 2);
    const order = await createOrderFromCart(buyer.id);

    expect(await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true })).toBe(true);
    expect(await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true })).toBe(false);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(2);
    expect((await prisma.cartItem.findFirstOrThrow()).qty).toBe(2);
  });

  it("markItemShipped: only the owning artisan, only PAID orders; last item ships the order", async () => {
    const one = await makeArtisan();
    const two = await makeArtisan();
    const p1 = await makeProduct(one.shop.id);
    const p2 = await makeProduct(two.shop.id);
    const buyer = await makeUser();
    await fillCart(buyer.id, p1.id, 1);
    await fillCart(buyer.id, p2.id, 1);
    const order = await createOrderFromCart(buyer.id);
    const item1 = order.items.find((i) => i.productId === p1.id)!;
    const item2 = order.items.find((i) => i.productId === p2.id)!;

    await expect(markItemShipped(one.user.id, item1.id, "TRACK1")).rejects.toThrow(/Only paid orders/);
    await handleStripeEvent(sessionEvent("checkout.session.completed", order.id));

    await expect(markItemShipped(two.user.id, item1.id, "TRACK1")).rejects.toThrow(/not found/);
    expect(await markItemShipped(one.user.id, item1.id, "TRACK1")).toEqual({ orderShipped: false });
    await expect(markItemShipped(one.user.id, item1.id, "TRACK1")).rejects.toThrow(/already/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");

    expect(await markItemShipped(two.user.id, item2.id, "TRACK2")).toEqual({ orderShipped: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SHIPPED");
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "ORDER_SHIPPED" } })).toBe(1);
  });
});
