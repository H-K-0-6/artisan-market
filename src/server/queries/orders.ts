import "server-only";
import { prisma } from "@/lib/db";

export type CartLineIssue = "unavailable" | "own" | "out-of-stock" | "over-stock" | null;

/** The user's cart with live prices and a per-line problem flag. */
export async function getCartView(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          product: {
            include: {
              images: { orderBy: { position: "asc" }, take: 1 },
              artisan: { select: { userId: true, shopName: true, slug: true, user: { select: { banned: true } } } },
            },
          },
        },
      },
    },
  });

  const lines = (cart?.items ?? []).map((item) => {
    const p = item.product;
    let issue: CartLineIssue = null;
    if (p.status !== "ACTIVE" || p.priceCents <= 0 || p.artisan.user.banned) issue = "unavailable";
    else if (p.artisan.userId === userId) issue = "own";
    else if (p.stock < 1) issue = "out-of-stock";
    else if (item.qty > p.stock) issue = "over-stock";
    return { ...item, issue, lineTotalCents: p.priceCents * item.qty };
  });

  return {
    lines,
    subtotalCents: lines.reduce((s, l) => s + (l.issue ? 0 : l.lineTotalCents), 0),
    hasIssues: lines.some((l) => l.issue),
  };
}

export function listMyOrders(buyerId: string) {
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { titleSnapshot: true, qty: true } } },
  });
}

/** An order only if it belongs to this buyer. */
export function getMyOrder(buyerId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          artisan: { select: { shopName: true, slug: true } },
          product: { select: { slug: true, images: { orderBy: { position: "asc" }, take: 1 } } },
        },
      },
    },
  });
}

/** This shop's lines on orders that are paid or shipped, newest first. */
export function listShopOrderItems(artisanId: string) {
  return prisma.orderItem.findMany({
    where: { artisanId, order: { status: { in: ["PAID", "SHIPPED"] } } },
    orderBy: [{ order: { paidAt: "desc" } }, { id: "asc" }],
    include: {
      order: {
        select: { id: true, status: true, source: true, paidAt: true, shippingAddress: true, buyer: { select: { name: true, email: true } } },
      },
    },
  });
}

export type ShippingAddress = {
  name?: string | null;
  phone?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};

export function formatAddress(json: unknown): string[] {
  const s = json as ShippingAddress | null;
  if (!s) return [];
  const a = s.address ?? {};
  return [
    s.name,
    s.phone,
    a.line1,
    a.line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(", "),
    a.country === "BH" ? "Bahrain" : a.country,
  ].filter((x): x is string => Boolean(x));
}
