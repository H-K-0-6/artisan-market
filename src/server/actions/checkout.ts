"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthError, requireRole } from "@/lib/rbac";
import { stripe } from "@/lib/stripe";
import { createCheckoutSessionForOrder } from "@/server/services/payment.service";
import { createOrderFromCart, OrderError, releaseCartOrder } from "@/server/services/order.service";
import type { FormState } from "@/server/actions/types";

async function signedInUserId() {
  try {
    return (await requireRole()).user.id;
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

/**
 * Creates a PENDING order from the cart (stock reserved), opens a Stripe
 * Checkout Session for it and redirects there. If Stripe fails, the order is
 * cancelled, its stock released and the items put back in the cart.
 */
export async function checkout(): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in to check out" };

  let orderId: string;
  try {
    orderId = (await createOrderFromCart(userId)).id;
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    console.error("Checkout failed", e);
    return { error: "Checkout failed. Please try again." };
  }

  let url: string | null;
  try {
    url = (await createCheckoutSessionForOrder(orderId, userId)).url;
    if (!url) throw new Error("Stripe returned a session without a URL");
  } catch (e) {
    console.error("Creating Stripe Checkout Session failed", e);
    await releaseCartOrder(orderId, "CANCELLED", { restoreCart: true });
    revalidatePath("/cart");
    return { error: "We couldn't start the payment. Your cart has been kept; please try again." };
  }

  revalidatePath("/cart");
  redirect(url);
}

/** Sends the buyer back to the still-open Stripe session of a PENDING cart order. */
export async function resumeCartPayment(orderId: string): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: userId, source: "CART", status: "PENDING" },
    select: { stripeCheckoutSessionId: true },
  });
  if (!order?.stripeCheckoutSessionId) return { error: "This order can no longer be paid" };

  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (session.status === "open") url = session.url;
  } catch (e) {
    console.error("Retrieving Stripe session failed", e);
  }
  if (!url) return { error: "This checkout has closed. Cancel the order and check out again." };
  redirect(url);
}

/** Cancels a PENDING cart order: closes its Stripe session, releases stock, refills the cart. */
export async function cancelCartOrder(orderId: string): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: userId, source: "CART", status: "PENDING" },
    select: { id: true, stripeCheckoutSessionId: true },
  });
  if (!order) return { error: "This order can't be cancelled" };

  if (order.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
      if (session.status === "complete") return { error: "This order has already been paid" };
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    } catch (e) {
      console.error("Expiring Stripe session failed", e);
      return { error: "Couldn't cancel the payment session. Please try again." };
    }
  }

  await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true });
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${order.id}`);
  revalidatePath("/cart");
  return { ok: true };
}
