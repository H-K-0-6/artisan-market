"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireRole } from "@/lib/rbac";
import { buyableProductWhere } from "@/server/queries/catalog";
import type { FormState } from "@/server/actions/types";

const qtySchema = z.coerce.number().int().min(1).max(99);

async function signedInUserId() {
  try {
    return (await requireRole()).user.id;
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

async function loadBuyable(productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, ...buyableProductWhere },
    select: { id: true, stock: true, artisan: { select: { userId: true } } },
  });
}

/** Adds `qty` of a product to the signed-in user's cart, clamped to stock. */
export async function addToCart(productId: string, qty: number = 1): Promise<FormState & { qty?: number }> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in to add items to your cart" };
  const parsed = qtySchema.safeParse(qty);
  if (!parsed.success) return { error: "Choose a quantity between 1 and 99" };

  const product = await loadBuyable(productId);
  if (!product) return { error: "This product is no longer available" };
  if (product.artisan.userId === userId) return { error: "You can't buy your own product" };
  if (product.stock < 1) return { error: "This product is out of stock" };

  const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
    select: { qty: true },
  });
  const next = Math.min((existing?.qty ?? 0) + parsed.data, product.stock);
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { qty: next },
    create: { cartId: cart.id, productId, qty: next },
  });
  // Touch the cart so updatedAt reflects the change.
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  revalidatePath("/cart");
  return { ok: true, qty: next };
}

/** Sets a cart line's quantity (clamped to stock); 0 removes it. */
export async function updateCartItem(cartItemId: string, qty: number): Promise<FormState & { qty?: number }> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in to edit your cart" };
  const parsed = z.coerce.number().int().min(0).max(99).safeParse(qty);
  if (!parsed.success) return { error: "Choose a quantity between 0 and 99" };

  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: { userId } },
    select: { id: true, productId: true },
  });
  if (!item) return { error: "Cart item not found" };
  if (parsed.data === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    revalidatePath("/cart");
    return { ok: true, qty: 0 };
  }

  const product = await loadBuyable(item.productId);
  if (!product || product.stock < 1) return { error: "This product is no longer available" };
  const next = Math.min(parsed.data, product.stock);
  await prisma.cartItem.update({ where: { id: item.id }, data: { qty: next } });

  revalidatePath("/cart");
  return { ok: true, qty: next };
}

export async function removeCartItem(cartItemId: string): Promise<FormState> {
  const userId = await signedInUserId();
  if (!userId) return { error: "Sign in to edit your cart" };
  await prisma.cartItem.deleteMany({ where: { id: cartItemId, cart: { userId } } });
  revalidatePath("/cart");
  return { ok: true };
}
