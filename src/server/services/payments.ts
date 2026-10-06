// Payments through Tap (BENEFIT, BenefitPay and cards, in BHD).
//
// Flow: the buyer picks a method on /pay/[orderId]. BENEFIT and card create a Tap
// charge and redirect to Tap's page; BenefitPay renders Tap's SDK (QR code) with a
// request we sign here. A charge's outcome reaches us three ways, all funnelled into
// applyCharge(): the buyer's return to /checkout/return, Tap's signed webhook, and
// the release job. We always re-fetch the charge from Tap's API before acting on it.
//
// No "server-only" import: the pg-boss jobs in the tsx custom server use this module.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { APP_CURRENCY, formatCents, MINOR_PER_MAJOR, toMajorString } from "@/lib/money";
import { appUrl } from "@/lib/app-url";
import { enqueueAt, QUEUES, type OrderJob } from "@/lib/boss";
import * as tapApi from "@/lib/tap";
import { createNotification, notify, pushNotifications } from "@/server/services/notification.service";
import { emitToAdmins } from "@/server/realtime/emit";

/** A user-facing payment problem (order not payable, missing address, ...). */
export class PaymentError extends Error {}

/** Tap's payment pages expire after 30 minutes; we hold cart stock a little longer. */
export const PAYMENT_HOLD_MS = 35 * 60_000;
/** Time to choose a method and enter an address after checking out. */
export const CHECKOUT_HOLD_MS = 20 * 60_000;

type Tx = Prisma.TransactionClient;
type NotificationRow = Awaited<ReturnType<typeof createNotification>>;

/** Tap calls, injectable so tests never reach the network. */
export type TapClient = Pick<typeof tapApi, "createCharge" | "retrieveCharge" | "createRefund">;
export type PaymentDeps = { tap?: TapClient };
const client = (deps?: PaymentDeps): TapClient => deps?.tap ?? tapApi;

export const webhookUrl = () => appUrl("/api/webhooks/tap");

export type ShippingAddress = {
  name: string;
  phone: string;
  address: { line1: string; line2?: string; city: string; country: "BH" };
  /** The fields as entered, so the form can be pre-filled next time. */
  fields: { building: string; flat?: string; road: string; block: string; area: string };
};

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

async function payableOrder(orderId: string, buyerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: { buyer: { select: { name: true, email: true } } },
  });
  if (!order) throw new PaymentError("Order not found");
  if (order.status !== "PENDING") throw new PaymentError("This order can no longer be paid");
  if (order.payDeadline && order.payDeadline.getTime() <= Date.now()) {
    throw new PaymentError("The payment deadline for this lot has passed");
  }
  if (!order.shippingAddress) throw new PaymentError("Add a delivery address before paying");
  return order;
}

function splitName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first: first || "Customer", last: rest.join(" ") || "-" };
}

const newTransactionRef = (orderId: string) => `${orderId}_${Date.now().toString(36)}`;

/** Extends a cart order's stock hold while a payment attempt is open. */
async function holdForPayment(order: { id: string; source: string }) {
  if (order.source !== "CART") return;
  const holdUntil = new Date(Date.now() + PAYMENT_HOLD_MS);
  await prisma.order.update({ where: { id: order.id }, data: { paymentHoldUntil: holdUntil } });
  await scheduleRelease(order.id, holdUntil);
}

export const scheduleRelease = (orderId: string, at: Date) =>
  enqueueAt(QUEUES.orderRelease, { orderId } satisfies OrderJob, new Date(at.getTime() + 30_000));

/**
 * Creates a Tap charge for BENEFIT or card and returns the Tap page to send the
 * buyer to. The charge carries the order id, so its result maps back to the order.
 */
export async function startRedirectPayment(orderId: string, buyerId: string, method: tapApi.RedirectMethod, deps?: PaymentDeps) {
  const order = await payableOrder(orderId, buyerId);
  const { first, last } = splitName(order.buyer.name);
  const charge = await client(deps).createCharge({
    amount: toMajorString(order.totalCents),
    currency: APP_CURRENCY,
    sourceId: tapApi.TAP_SOURCES[method],
    description: `Artisan Market order ${order.id.slice(-8).toUpperCase()}`,
    reference: { transaction: newTransactionRef(order.id), order: order.id },
    metadata: { orderId: order.id },
    customer: { first_name: first, last_name: last, email: order.buyer.email },
    postUrl: webhookUrl(),
    redirectUrl: appUrl(`/checkout/return?order=${order.id}`),
  });
  if (!charge.transaction?.url) throw new PaymentError("The payment page couldn't be opened. Please try again.");
  await prisma.order.update({ where: { id: order.id }, data: { paymentChargeId: charge.id } });
  await holdForPayment(order);
  return charge.transaction.url;
}

/**
 * Everything Tap's BenefitPay SDK needs in the browser. The hash signs the amount,
 * currency, transaction reference and webhook URL with our secret key, so none of
 * them can be altered client-side.
 */
export async function prepareBenefitPay(orderId: string, buyerId: string) {
  const publicKey = process.env.TAP_PUBLISHABLE_KEY;
  const merchantId = process.env.TAP_MERCHANT_ID;
  if (!publicKey || !merchantId) throw new PaymentError("BenefitPay isn't set up yet");
  const order = await payableOrder(orderId, buyerId);
  const { first, last } = splitName(order.buyer.name);
  const amount = toMajorString(order.totalCents);
  const transaction = newTransactionRef(order.id);
  const postUrl = webhookUrl();
  await holdForPayment(order);
  return {
    publicKey,
    merchantId,
    // The SDK talks to Tap's sandbox or live API depending on this.
    environment: publicKey.startsWith("pk_live") ? ("live" as const) : ("development" as const),
    hashString: tapApi.benefitPayHash({ publicKey, amount, currency: APP_CURRENCY, transaction, postUrl }),
    amount,
    currency: APP_CURRENCY,
    reference: { transaction, order: order.id },
    postUrl,
    metadata: { orderId: order.id },
    customer: { first, last, email: order.buyer.email },
  };
}
export type BenefitPayConfig = Awaited<ReturnType<typeof prepareBenefitPay>>;

const belongsTo = (charge: tapApi.TapCharge, orderId: string) =>
  charge.metadata?.orderId === orderId || charge.reference?.order === orderId;

/** Records a charge the BenefitPay SDK created, after checking with Tap that it is for this order. */
export async function attachCharge(orderId: string, buyerId: string, chargeId: string, deps?: PaymentDeps) {
  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId, status: "PENDING" }, select: { id: true } });
  if (!order) throw new PaymentError("Order not found");
  const charge = await client(deps).retrieveCharge(chargeId);
  if (!belongsTo(charge, orderId)) throw new PaymentError("That payment isn't for this order");
  await prisma.order.update({ where: { id: orderId }, data: { paymentChargeId: charge.id } });
  return charge;
}

// ---------------------------------------------------------------------------
// Applying a charge result
// ---------------------------------------------------------------------------

export type ChargeResult =
  | { outcome: "open" } // still INITIATED / IN_PROGRESS
  | { outcome: "duplicate" }
  | { outcome: "processed"; orderId?: string; changed: boolean; refunded?: boolean };

type TxResult = {
  orderId?: string;
  changed: boolean;
  notifications: NotificationRow[];
  adminMessage: string | null;
  refund: { orderId: string; buyerId: string; reason: string } | null;
};

/**
 * Applies a charge fetched from Tap's API. A ProcessedPaymentEvent row for
 * (charge id, status) is written in the same transaction as the side effects, so
 * the same result reported twice (return page + webhook + job) changes nothing.
 * Captured money that can't complete an order is refunded after commit.
 */
export async function applyCharge(charge: tapApi.TapCharge, deps?: PaymentDeps): Promise<ChargeResult> {
  if (tapApi.OPEN_STATUSES.has(charge.status)) return { outcome: "open" };

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.processedPaymentEvent.createMany({
      data: [{ id: `${charge.id}:${charge.status}`, type: `charge.${charge.status.toLowerCase()}` }],
      skipDuplicates: true,
    });
    if (count === 0) return null;
    return charge.status === "CAPTURED" ? onCaptured(tx, charge) : onFailed(tx, charge);
  });
  if (!result) return { outcome: "duplicate" };

  pushNotifications(result.notifications);
  if (result.adminMessage) emitToAdmins("order", result.adminMessage);

  // Never call Tap inside a DB transaction. The event is already recorded, so a
  // failed refund is surfaced to admins rather than retried.
  let refunded: boolean | undefined;
  if (result.refund) {
    const { orderId, buyerId, reason } = result.refund;
    try {
      await client(deps).createRefund({
        chargeId: charge.id,
        amount: Number(charge.amount).toFixed(3),
        currency: charge.currency,
        reason: "duplicate",
        reference: `refund_${charge.id}`,
      });
      refunded = true;
      await notify({
        userId: buyerId,
        type: "SYSTEM",
        title: "Payment refunded",
        body: `We refunded a payment for an order that was ${reason}. You won't be charged.`,
        link: `/account/orders/${orderId}`,
      });
      emitToAdmins("order", `Refunded ${charge.id} for order ${orderId} (${reason})`);
    } catch (err) {
      refunded = false;
      console.error(`[tap] refund of ${charge.id} for order ${orderId} failed`, err);
      emitToAdmins("order", `REFUND FAILED for order ${orderId} (${charge.id}); refund it in the Tap dashboard`);
    }
  }
  return { outcome: "processed", orderId: result.orderId, changed: result.changed, refunded };
}

async function findOrderForCharge(tx: Tx, charge: tapApi.TapCharge) {
  const orderId = charge.metadata?.orderId ?? charge.reference?.order;
  if (!orderId) return null;
  return tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { artisan: { select: { userId: true } } } } },
  });
}

async function onCaptured(tx: Tx, charge: tapApi.TapCharge): Promise<TxResult> {
  const none: TxResult = { changed: false, notifications: [], adminMessage: null, refund: null };
  const order = await findOrderForCharge(tx, charge);
  if (!order) {
    console.warn(`[tap] captured charge ${charge.id} has no matching order`);
    return { ...none, adminMessage: `Captured charge ${charge.id} matches no order; check the Tap dashboard` };
  }

  // The amount Tap captured must be exactly what we asked for.
  const paidMinor = Math.round(Number(charge.amount) * MINOR_PER_MAJOR);
  if (charge.currency !== APP_CURRENCY || paidMinor !== order.totalCents) {
    console.warn(`[tap] charge ${charge.id} paid ${charge.amount} ${charge.currency} for order ${order.id} (${order.totalCents} fils)`);
    return { ...none, orderId: order.id, refund: { orderId: order.id, buyerId: order.buyerId, reason: "charged the wrong amount" } };
  }

  // Only PENDING orders transition, so a replay or a second charge can't pay twice.
  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paidChargeId: charge.id,
      paymentChargeId: charge.id,
      paymentMethod: tapApi.chargeMethod(charge),
      paymentHoldUntil: null,
    },
  });
  if (count === 0) {
    if (order.paidChargeId === charge.id) return { ...none, orderId: order.id }; // already applied
    const alreadyPaid = ["PAID", "SHIPPED", "DELIVERED", "REFUNDED"].includes(order.status);
    const reason = alreadyPaid ? "already paid" : order.status.toLowerCase();
    console.warn(`[tap] charge ${charge.id} captured but order ${order.id} is ${order.status}; refunding`);
    return { ...none, orderId: order.id, refund: { orderId: order.id, buyerId: order.buyerId, reason } };
  }

  if (order.auctionId) await tx.auction.update({ where: { id: order.auctionId }, data: { status: "PAID" } });

  const total = formatCents(order.totalCents);
  const notifications = [
    await createNotification(
      {
        userId: order.buyerId,
        type: "ORDER_PAID",
        title: "Payment received",
        body: `Thanks! Your payment of ${total} was received. We'll let you know when it ships.`,
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
        { userId, type: "ORDER_PAID", title: "New order to ship", body: `Paid order: ${titles.join(", ")}`, link: "/dashboard/orders" },
        tx,
      ),
    );
  }
  return {
    orderId: order.id,
    changed: true,
    notifications,
    adminMessage: `Order ${order.id} paid (${total}, ${tapApi.chargeMethod(charge) ?? "Tap"})`,
    refund: null,
  };
}

/**
 * A failed or abandoned charge doesn't end the order: the buyer can try again or
 * pick another method until the hold (cart) or payment deadline (auction) runs out.
 */
async function onFailed(tx: Tx, charge: tapApi.TapCharge): Promise<TxResult> {
  const order = await findOrderForCharge(tx, charge);
  return { orderId: order?.id, changed: false, notifications: [], adminMessage: null, refund: null };
}

/**
 * Asks Tap for the latest state of an order's payment and applies it. Used when the
 * buyer returns from Tap (webhooks can't reach a local machine) and by the jobs.
 */
export async function syncOrderPayment(orderId: string, opts: { chargeId?: string } & PaymentDeps = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentChargeId: true } });
  // Only Tap charge ids (chg_...) can be looked up; anything else is a leftover
  // from before Tap (e.g. a Stripe session id) and means "no payment started".
  const stored = order?.paymentChargeId?.startsWith("chg_") ? order.paymentChargeId : null;
  const chargeId = opts.chargeId ?? stored;
  if (!order || !chargeId) return { chargeStatus: null as string | null, result: null as ChargeResult | null };
  const charge = await client(opts).retrieveCharge(chargeId);
  if (!belongsTo(charge, orderId)) throw new PaymentError("That payment isn't for this order");
  return { chargeStatus: charge.status, result: await applyCharge(charge, opts) };
}

// ---------------------------------------------------------------------------
// Releasing unpaid cart orders
// ---------------------------------------------------------------------------

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
      data: { status, paymentHoldUntil: null },
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

export type ReleaseResult = { kind: "released" } | { kind: "paid" } | { kind: "noop" } | { kind: "reschedule"; at: Date };

/**
 * Runs when a cart order's hold ends: checks Tap one last time (a payment may have
 * gone through without us hearing), then gives the stock back and puts the items
 * back in the buyer's cart. If Tap can't be reached, tries again in 5 minutes.
 */
export async function releaseIfUnpaid(orderId: string, deps?: PaymentDeps): Promise<ReleaseResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, source: true, status: true, buyerId: true, paymentHoldUntil: true, paymentChargeId: true },
  });
  if (!order || order.source !== "CART" || order.status !== "PENDING") return { kind: "noop" };
  if (order.paymentHoldUntil && order.paymentHoldUntil.getTime() > Date.now()) {
    return { kind: "reschedule", at: order.paymentHoldUntil };
  }

  if (order.paymentChargeId?.startsWith("chg_")) {
    try {
      await syncOrderPayment(order.id, deps);
    } catch (err) {
      console.error(`[tap] could not check order ${order.id} before releasing it`, err);
      return { kind: "reschedule", at: new Date(Date.now() + 5 * 60_000) };
    }
    const now = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
    if (now?.status !== "PENDING") return { kind: "paid" };
  }

  const released = await releaseCartOrder(order.id, "EXPIRED", { restoreCart: true });
  if (!released) return { kind: "noop" };
  await notify({
    userId: order.buyerId,
    type: "SYSTEM",
    title: "Checkout timed out",
    body: "We didn't receive payment in time, so the pieces went back on sale. They're back in your cart if you still want them.",
    link: "/cart",
  });
  return { kind: "released" };
}

/** For the safety sweep: cart orders whose hold has passed (or old ones that never had one). */
export async function overdueCartOrders() {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE status = 'PENDING' AND source = 'CART'
      AND COALESCE("paymentHoldUntil", "createdAt" + interval '1 hour') < (now() AT TIME ZONE 'UTC') - interval '1 minute'
    LIMIT 50`;
}
