"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import { isTrustedUpload } from "@/lib/validators/product";
import { auctionSchema, validateAuctionTimes, type AuctionInput } from "@/lib/validators/auction";
import { AuctionError, cancelAuction } from "@/server/services/auction.service";
import { queueAuctionJobs } from "@/server/services/auction-lifecycle";
import type { FormState } from "@/server/actions/types";

async function myShopId(userId: string) {
  const shop = await prisma.artisanProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!shop) throw new Error("Open a shop before running auctions");
  return shop.id;
}

/**
 * Creates and schedules an auction for one of the artisan's own products, or for a
 * new one-off item created inline. Queues the start and end jobs.
 */
export async function createAuction(input: AuctionInput): Promise<FormState & { auctionId?: string }> {
  const session = await requireRole("artisan");
  const artisanId = await myShopId(session.user.id);

  const parsed = auctionSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const timeErrors = validateAuctionTimes(v.startsAt, v.endsAt, Date.now());
  if (timeErrors.startsAt || timeErrors.endsAt) {
    return {
      fieldErrors: {
        startsAt: timeErrors.startsAt ? [timeErrors.startsAt] : undefined,
        endsAt: timeErrors.endsAt ? [timeErrors.endsAt] : undefined,
      },
    };
  }

  let productId: string;
  if (v.productId) {
    const product = await prisma.product.findFirst({
      where: { id: v.productId, artisanId, status: { in: ["ACTIVE", "DRAFT"] } },
      select: { id: true },
    });
    if (!product) return { fieldErrors: { productId: ["Choose one of your listed products"] } };
    const busy = await prisma.auction.findFirst({
      where: { productId: product.id, status: { in: ["DRAFT", "SCHEDULED", "LIVE", "ENDED"] } },
      select: { id: true },
    });
    if (busy) return { fieldErrors: { productId: ["This product already has an open auction"] } };
    productId = product.id;
  } else {
    const np = v.newProduct!;
    if (np.images.some((img) => !isTrustedUpload(img))) return { error: "Photos must be uploaded through the form" };
    if (np.categoryId && !(await prisma.category.findUnique({ where: { id: np.categoryId }, select: { id: true } }))) {
      return { fieldErrors: { categoryId: ["Unknown category"] } };
    }
    // One-off auction items follow the seed convention: price 0 (not sold in the shop), stock 1.
    const product = await prisma.product.create({
      data: {
        artisanId,
        title: np.title,
        description: np.description,
        categoryId: np.categoryId,
        priceCents: 0,
        stock: 1,
        status: "ACTIVE",
        slug: await uniqueProductSlug(np.title),
        images: { create: np.images.map((img, position) => ({ ...img, position })) },
      },
      select: { id: true },
    });
    productId = product.id;
  }

  // A start slightly in the past (form latency) just starts right away.
  const startsAt = new Date(Math.max(v.startsAt.getTime(), Date.now()));
  const auction = await prisma.auction.create({
    data: {
      productId,
      artisanId,
      status: "SCHEDULED",
      startPriceCents: v.startPriceCents,
      minIncrementCents: v.minIncrementCents,
      reservePriceCents: v.reservePriceCents,
      startsAt,
      endsAt: v.endsAt,
      originalEndsAt: v.endsAt,
    },
    select: { id: true, startsAt: true, endsAt: true },
  });
  await queueAuctionJobs(auction);

  revalidatePath("/dashboard/auctions");
  revalidatePath("/auctions");
  return { ok: true, auctionId: auction.id };
}

/** Artisans may cancel their own auction only before it goes live. */
export async function cancelMyAuction(auctionId: string, reason: string): Promise<FormState> {
  const session = await requireRole("artisan");
  try {
    await cancelAuction({ auctionId, actorId: session.user.id, reason });
  } catch (err) {
    if (err instanceof AuctionError) return { error: err.message };
    throw err;
  }
  revalidatePath("/dashboard/auctions");
  revalidatePath(`/dashboard/auctions/${auctionId}`);
  revalidatePath("/auctions");
  return { ok: true };
}

async function uniqueProductSlug(title: string) {
  const base = slugify(title) || "item";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.product.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}
