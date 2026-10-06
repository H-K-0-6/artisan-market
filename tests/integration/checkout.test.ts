import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { CreateChargeInput, TapCharge } from "@/lib/tap";
import { createOrderFromCart, markItemShipped, OrderError } from "@/server/services/order.service";
import {
  applyCharge,
  PaymentError,
  releaseCartOrder,
  releaseIfUnpaid,
  startRedirectPayment,
  syncOrderPayment,
  type TapClient,
} from "@/server/services/payments";
import { makeArtisan, makeProduct, makeUser, resetDb } from "../helpers/db";

async function fillCart(userId: string, productId: string, qty: number) {
  const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  await prisma.cartItem.create({ data: { cartId: cart.id, productId, qty } });
}

const ADDRESS = {
  name: "Test Buyer",
  phone: "+97333333333",
  address: { line1: "Building 12, Road 34", line2: "Block 316", city: "Manama", country: "BH" },
  fields: { building: "12", road: "34", block: "316", area: "Manama" },
};

let n = 0;
/** A Tap charge for an order, CAPTURED for the order's exact total unless overridden. */
function charge(order: { id: string; totalCents: number }, over: Partial<TapCharge> = {}): TapCharge {
  return {
    id: `chg_test_${++n}`,
    object: "charge",
    status: "CAPTURED",
    amount: order.totalCents / 1000,
    currency: "BHD",
    metadata: { orderId: order.id },
    reference: { order: order.id, transaction: `${order.id}_t${n}` },
    source: { id: "src_bh.benefit", payment_method: "BENEFIT" },
    transaction: { created: String(Date.now()) },
    ...over,
  };
}

/** In-memory stand-in for Tap's API. */
function fakeTap() {
  const charges: Record<string, TapCharge> = {};
  const created: CreateChargeInput[] = [];
  const refunds: { chargeId: string; amount: string }[] = [];
  const state = { failRetrieve: false, failRefund: false };
  const tap: TapClient = {
    createCharge: async (input) => {
      created.push(input);
      const c: TapCharge = {
        id: `chg_created_${created.length}`,
        status: "INITIATED",
        amount: Number(input.amount),
        currency: input.currency,
        metadata: input.metadata,
        reference: input.reference,
        transaction: { url: `https://sandbox.tap.company/pay/${created.length}` },
      };
      charges[c.id] = c;
      return c;
    },
    retrieveCharge: async (id) => {
      if (state.failRetrieve) throw new Error("Tap unreachable");
      const c = charges[id];
      if (!c) throw new Error(`no charge ${id}`);
      return c;
    },
    createRefund: async (input) => {
      if (state.failRefund) throw new Error("Tap down");
      refunds.push({ chargeId: input.chargeId, amount: input.amount });
      return { id: `re_${refunds.length}`, status: "PENDING" };
    },
  };
  return { tap, charges, created, refunds, state };
}

async function cartOrder(opts: { price?: number; stock?: number; qty?: number } = {}) {
  const { user: artisanUser, shop } = await makeArtisan();
  const p = await makeProduct(shop.id, { priceCents: opts.price ?? 12_500, stock: opts.stock ?? 3 });
  const buyer = await makeUser();
  await fillCart(buyer.id, p.id, opts.qty ?? 1);
  const order = await createOrderFromCart(buyer.id);
  return { order, product: p, buyer, artisanUser, shop };
}

const statusOf = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
const stockOf = async (productId: string) => (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

describe("checkout and Tap payment handling", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates a PENDING order that snapshots prices, reserves stock, computes commission, holds it and clears the cart", async () => {
    const { shop } = await makeArtisan();
    await prisma.artisanProfile.update({ where: { id: shop.id }, data: { commissionBps: 1250 } });
    const a = await makeProduct(shop.id, { priceCents: 19_990, stock: 5 });
    const b = await makeProduct(shop.id, { priceCents: 5_000, stock: 2 });
    const buyer = await makeUser();
    await fillCart(buyer.id, a.id, 3);
    await fillCart(buyer.id, b.id, 1);

    const order = await createOrderFromCart(buyer.id);

    expect(order.status).toBe("PENDING");
    expect(order.source).toBe("CART");
    expect(order.subtotalCents).toBe(19_990 * 3 + 5_000);
    expect(order.totalCents).toBe(order.subtotalCents);
    // round(59970 * 0.125) + round(5000 * 0.125)
    expect(order.commissionCents).toBe(7_496 + 625);
    expect(order.items.find((i) => i.productId === a.id)).toMatchObject({ titleSnapshot: a.title, unitPriceCents: 19_990, qty: 3 });
    expect(order.paymentHoldUntil!.getTime()).toBeGreaterThan(Date.now() + 15 * 60_000);
    expect(await stockOf(a.id)).toBe(2);
    expect(await stockOf(b.id)).toBe(1);
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
    expect(await stockOf(p.id)).toBe(1);
    expect(await prisma.order.count()).toBe(0);
  });

  it("two concurrent checkouts for the last unit: exactly one succeeds and stock never goes negative", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { stock: 1 });
    const buyers = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]);
    for (const b of buyers) await fillCart(b.id, p.id, 1);
    const results = await Promise.allSettled(buyers.map((b) => createOrderFromCart(b.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(p.id)).toBe(0);
    expect(await prisma.cartItem.count()).toBe(3);
  });

  it("starts a payment only once an address is saved, asking Tap for the exact BHD total", async () => {
    const { order, buyer } = await cartOrder({ price: 12_500, qty: 2 });
    const t = fakeTap();
    await expect(startRedirectPayment(order.id, buyer.id, "BENEFIT", t)).rejects.toBeInstanceOf(PaymentError);

    await prisma.order.update({ where: { id: order.id }, data: { shippingAddress: ADDRESS } });
    const url = await startRedirectPayment(order.id, buyer.id, "BENEFIT", t);
    expect(url).toMatch(/^https:\/\/sandbox\.tap\.company\//);
    expect(t.created[0]).toMatchObject({
      amount: "25.000",
      currency: "BHD",
      sourceId: "src_bh.benefit",
      reference: { order: order.id },
      metadata: { orderId: order.id },
    });
    expect(t.created[0].redirectUrl).toContain(`/checkout/return?order=${order.id}`);
    expect(t.created[0].postUrl).toMatch(/\/api\/webhooks\/tap$/);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.paymentChargeId).toBe("chg_created_1");
    expect(saved.paymentHoldUntil!.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);

    // Card goes to Tap's card source; someone else's order can't be paid.
    await startRedirectPayment(order.id, buyer.id, "CARD", t);
    expect(t.created[1].sourceId).toBe("src_card");
    const stranger = await makeUser();
    await expect(startRedirectPayment(order.id, stranger.id, "CARD", t)).rejects.toThrow(/not found/);
  });

  it("applies a captured charge once even when it is reported three times (return, webhook, job)", async () => {
    const { order, product, buyer, artisanUser } = await cartOrder({ stock: 3, qty: 2 });
    const c = charge(order);
    const [first, second] = await Promise.all([applyCharge(c), applyCharge(c)]);
    const third = await applyCharge(c);

    expect([first.outcome, second.outcome].sort()).toEqual(["duplicate", "processed"]);
    expect(third.outcome).toBe("duplicate");
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "PAID", paidChargeId: c.id, paymentMethod: "BENEFIT", paymentHoldUntil: null });
    expect(paid.paidAt).not.toBeNull();
    expect(await stockOf(product.id)).toBe(1);
    expect(await prisma.processedPaymentEvent.count()).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "ORDER_PAID" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: artisanUser.id, type: "ORDER_PAID" } })).toBe(1);
  });

  it("ignores open charges and keeps the order payable after a declined one", async () => {
    const { order, product } = await cartOrder({ stock: 3 });
    expect(await applyCharge(charge(order, { status: "INITIATED" }))).toEqual({ outcome: "open" });
    expect(await prisma.processedPaymentEvent.count()).toBe(0);

    const declined = charge(order, { status: "DECLINED" });
    expect(await applyCharge(declined)).toMatchObject({ outcome: "processed", changed: false });
    expect(await applyCharge(declined)).toEqual({ outcome: "duplicate" });
    expect(await statusOf(order.id)).toBe("PENDING");
    expect(await stockOf(product.id)).toBe(2);

    // A later successful attempt still pays it.
    await applyCharge(charge(order, { source: { payment_method: "BENEFITPAY" } }));
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "PAID", paymentMethod: "BENEFITPAY" });
  });

  it("refunds a charge for the wrong amount instead of accepting it", async () => {
    const { order, buyer } = await cartOrder({ price: 12_500 });
    const t = fakeTap();
    const res = await applyCharge(charge(order, { amount: 1.0 }), t);
    expect(res).toMatchObject({ changed: false, refunded: true });
    expect(t.refunds).toEqual([{ chargeId: expect.any(String), amount: "1.000" }]);
    expect(await statusOf(order.id)).toBe("PENDING");
    expect(await prisma.notification.count({ where: { userId: buyer.id, title: "Payment refunded" } })).toBe(1);
  });

  it("refunds a payment that arrives after the order expired, once", async () => {
    const { order, product } = await cartOrder({ stock: 4, qty: 3 });
    await releaseCartOrder(order.id, "EXPIRED");
    expect(await stockOf(product.id)).toBe(4);
    const t = fakeTap();
    const late = charge(order);
    expect(await applyCharge(late, t)).toMatchObject({ changed: false, refunded: true });
    expect(await applyCharge(late, t)).toEqual({ outcome: "duplicate" });
    expect(t.refunds).toHaveLength(1);
    expect(await statusOf(order.id)).toBe("EXPIRED");
  });

  it("refunds a second, different charge for an already-paid order but not a repeat of the first", async () => {
    const { order } = await cartOrder();
    const t = fakeTap();
    const first = charge(order);
    await applyCharge(first, t);
    // The same charge seen again with the same status is a duplicate, not a double charge.
    await applyCharge(first, t);
    expect(t.refunds).toEqual([]);

    const second = charge(order, { source: { payment_method: "BENEFITPAY" } });
    expect(await applyCharge(second, t)).toMatchObject({ changed: false, refunded: true });
    expect(t.refunds.map((r) => r.chargeId)).toEqual([second.id]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paidChargeId).toBe(first.id);
  });

  it("reports a failed refund without throwing", async () => {
    const { order } = await cartOrder();
    await releaseCartOrder(order.id, "CANCELLED");
    const t = fakeTap();
    t.state.failRefund = true;
    expect(await applyCharge(charge(order), t)).toMatchObject({ outcome: "processed", refunded: false });
    expect(await statusOf(order.id)).toBe("CANCELLED");
  });

  it("marks the auction PAID when its winner pays, after an earlier failed attempt", async () => {
    const { shop } = await makeArtisan();
    const p = await makeProduct(shop.id, { priceCents: 0, stock: 1 });
    const buyer = await makeUser();
    const now = Date.now();
    const auction = await prisma.auction.create({
      data: {
        productId: p.id,
        artisanId: shop.id,
        status: "ENDED",
        startPriceCents: 10_000,
        currentPriceCents: 42_000,
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
        subtotalCents: 42_000,
        commissionCents: 4_200,
        totalCents: 42_000,
        payDeadline: new Date(now + 48 * 3_600_000),
        items: { create: { productId: p.id, artisanId: shop.id, titleSnapshot: p.title, unitPriceCents: 42_000, qty: 1 } },
      },
    });
    await applyCharge(charge(order, { status: "ABANDONED" }));
    expect(await statusOf(order.id)).toBe("PENDING");
    await applyCharge(charge(order));
    expect(await statusOf(order.id)).toBe("PAID");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe("PAID");
  });

  it("syncOrderPayment asks Tap for the order's charge and refuses a charge for another order", async () => {
    const { order } = await cartOrder();
    const other = await cartOrder();
    const t = fakeTap();
    const c = charge(order);
    t.charges[c.id] = c;
    await prisma.order.update({ where: { id: order.id }, data: { paymentChargeId: c.id } });

    expect(await syncOrderPayment(order.id, t)).toMatchObject({ chargeStatus: "CAPTURED" });
    expect(await statusOf(order.id)).toBe("PAID");
    await expect(syncOrderPayment(other.order.id, { ...t, chargeId: c.id })).rejects.toBeInstanceOf(PaymentError);
  });

  it("releaseIfUnpaid waits for the hold, checks Tap, then returns stock and refills the cart", async () => {
    const { order, product, buyer } = await cartOrder({ stock: 3, qty: 2 });
    const t = fakeTap();
    const open = charge(order, { status: "INITIATED" });
    t.charges[open.id] = open;
    await prisma.order.update({ where: { id: order.id }, data: { paymentChargeId: open.id } });

    // Hold still running: try again later.
    expect(await releaseIfUnpaid(order.id, t)).toMatchObject({ kind: "reschedule" });

    await prisma.order.update({ where: { id: order.id }, data: { paymentHoldUntil: new Date(Date.now() - 1000) } });
    // Tap unreachable: don't release yet.
    t.state.failRetrieve = true;
    expect(await releaseIfUnpaid(order.id, t)).toMatchObject({ kind: "reschedule" });
    expect(await statusOf(order.id)).toBe("PENDING");

    t.state.failRetrieve = false;
    expect(await releaseIfUnpaid(order.id, t)).toEqual({ kind: "released" });
    expect(await statusOf(order.id)).toBe("EXPIRED");
    expect(await stockOf(product.id)).toBe(3);
    expect((await prisma.cartItem.findFirstOrThrow({ where: { productId: product.id } })).qty).toBe(2);
    expect(await prisma.notification.count({ where: { userId: buyer.id, title: "Checkout timed out" } })).toBe(1);
    expect(await releaseIfUnpaid(order.id, t)).toEqual({ kind: "noop" });
  });

  it("releaseIfUnpaid records a payment Tap captured instead of releasing the order", async () => {
    const { order } = await cartOrder();
    const t = fakeTap();
    const paid = charge(order);
    t.charges[paid.id] = paid;
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentChargeId: paid.id, paymentHoldUntil: new Date(Date.now() - 1000) },
    });
    expect(await releaseIfUnpaid(order.id, t)).toEqual({ kind: "paid" });
    expect(await statusOf(order.id)).toBe("PAID");
  });

  it("releaseCartOrder cancels, restores stock and refills the cart, and is idempotent", async () => {
    const { order, product } = await cartOrder({ stock: 2, qty: 2 });
    expect(await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true })).toBe(true);
    expect(await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true })).toBe(false);
    expect(await stockOf(product.id)).toBe(2);
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
    await applyCharge(charge(order));

    await expect(markItemShipped(two.user.id, item1.id, "TRACK1")).rejects.toThrow(/not found/);
    expect(await markItemShipped(one.user.id, item1.id, "TRACK1")).toEqual({ orderShipped: false });
    await expect(markItemShipped(one.user.id, item1.id, "TRACK1")).rejects.toThrow(/already/);
    expect(await markItemShipped(two.user.id, item2.id, "TRACK2")).toEqual({ orderShipped: true });
    expect(await statusOf(order.id)).toBe("SHIPPED");
  });
});
