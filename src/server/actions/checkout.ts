"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireRole } from "@/lib/rbac";
import { TapError } from "@/lib/tap";
import { createOrderFromCart, OrderError } from "@/server/services/order.service";
import {
  attachCharge,
  CHECKOUT_HOLD_MS,
  PaymentError,
  prepareBenefitPay,
  releaseCartOrder,
  scheduleRelease,
  startRedirectPayment,
  syncOrderPayment,
  type BenefitPayConfig,
  type ShippingAddress,
} from "@/server/services/payments";
import type { FormState } from "@/server/actions/types";

async function signedInUserId() {
  try {
    return (await requireRole()).user.id;
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

/** Turns errors into a message the buyer can act on. */
function paymentMessage(e: unknown) {
  if (e instanceof PaymentError || e instanceof OrderError) return e.message;
  if (e instanceof TapError) {
    console.error("Tap rejected the request", e.status, e.details);
    return "The payment provider couldn't start this payment. Please try again or choose another method.";
  }
  console.error("Payment failed", e);
  return "Something went wrong starting the payment. Please try again.";
}

/**
 * Creates a PENDING order from the cart (stock reserved for a while) and sends the
 * buyer to the pay page to add a delivery address and choose how to pay.
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
  await scheduleRelease(orderId, new Date(Date.now() + CHECKOUT_HOLD_MS));
  revalidatePath("/cart");
  redirect(`/pay/${orderId}`);
}

const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+?973)?[3169]\d{7}$/, "Enter a Bahraini number, e.g. 3XXX XXXX")),
  building: z.string().trim().min(1, "Enter the house or building number").max(20),
  flat: z.string().trim().max(20).optional(),
  road: z.string().trim().min(1, "Enter the road number").max(20),
  block: z.string().trim().regex(/^\d{3,4}$/, "Blocks are 3 or 4 digits"),
  area: z.string().trim().min(2, "Enter the area, e.g. Juffair").max(60),
});

/** Saves the Bahraini delivery address on a PENDING order. */
export async function saveShippingAddress(orderId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const a = parsed.data;
  const phone = a.phone.startsWith("+") ? a.phone : a.phone.startsWith("973") ? `+${a.phone}` : `+973${a.phone}`;
  const address: ShippingAddress = {
    name: a.name,
    phone,
    address: {
      line1: [a.flat ? `Flat ${a.flat}` : null, `Building ${a.building}`, `Road ${a.road}`].filter(Boolean).join(", "),
      line2: `Block ${a.block}`,
      city: a.area,
      country: "BH",
    },
    fields: { building: a.building, flat: a.flat || undefined, road: a.road, block: a.block, area: a.area },
  };
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, buyerId: userId, status: "PENDING" },
    data: { shippingAddress: address },
  });
  if (count === 0) return { error: "This order can no longer be changed" };
  revalidatePath(`/pay/${orderId}`);
  return { ok: true };
}

/** Starts a BENEFIT or card payment and sends the buyer to Tap's page. */
export async function payWith(orderId: string, method: "BENEFIT" | "CARD"): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  let url: string;
  try {
    url = await startRedirectPayment(orderId, userId, method);
  } catch (e) {
    return { error: paymentMessage(e) };
  }
  redirect(url);
}

/** The signed request the BenefitPay button needs. */
export async function getBenefitPayConfig(orderId: string): Promise<{ config?: BenefitPayConfig; error?: string }> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  try {
    return { config: await prepareBenefitPay(orderId, userId) };
  } catch (e) {
    return { error: paymentMessage(e) };
  }
}

/** Called when the BenefitPay SDK creates its charge, so we know which one to check. */
export async function recordBenefitPayCharge(orderId: string, chargeId: string): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  try {
    await attachCharge(orderId, userId, chargeId);
    return { ok: true };
  } catch (e) {
    return { error: paymentMessage(e) };
  }
}

/** Checks the order's latest payment with Tap (after BenefitPay reports success). */
export async function confirmPayment(orderId: string): Promise<{ status?: string; error?: string }> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: userId }, select: { id: true } });
  if (!order) return { error: "Order not found" };
  try {
    await syncOrderPayment(order.id);
  } catch (e) {
    return { error: paymentMessage(e) };
  }
  const now = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
  revalidatePath(`/account/orders/${order.id}`);
  return { status: now.status };
}

/** Cancels a PENDING cart order: releases its stock and puts the items back in the cart. */
export async function cancelCartOrder(orderId: string): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in first" };
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: userId, source: "CART", status: "PENDING" },
    select: { id: true, paymentChargeId: true },
  });
  if (!order) return { error: "This order can't be cancelled" };

  // If a payment went through in the meantime, record it instead of cancelling.
  if (order.paymentChargeId) {
    try {
      await syncOrderPayment(order.id);
    } catch (e) {
      return { error: paymentMessage(e) };
    }
    const now = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    if (now.status !== "PENDING") return { error: "This order has already been paid" };
  }

  await releaseCartOrder(order.id, "CANCELLED", { restoreCart: true });
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${order.id}`);
  revalidatePath("/cart");
  return { ok: true };
}
