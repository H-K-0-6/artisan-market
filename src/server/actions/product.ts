"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import { isTrustedUpload, productSchema, type ProductInput } from "@/lib/validators/product";
import type { FormState } from "@/server/actions/types";

const utapi = new UTApi();

async function myShopId(userId: string) {
  const shop = await prisma.artisanProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!shop) throw new Error("Open a shop before listing products");
  return shop.id;
}

/** Creates a product (productId = null) or updates one the artisan owns. */
export async function saveProduct(
  productId: string | null,
  input: ProductInput,
): Promise<FormState & { productId?: string }> {
  const session = await requireRole("artisan");
  const artisanId = await myShopId(session.user.id);

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { images, ...data } = parsed.data;

  const existing = productId
    ? await prisma.product.findFirst({
        where: { id: productId, artisanId, status: { not: "ARCHIVED" } },
        include: { images: true },
      })
    : null;
  if (productId && !existing) return { error: "Product not found" };

  // Images already on this product keep their stored URL; new ones must be real uploads.
  const known = new Map(existing?.images.map((i) => [i.key, i.url]));
  if (images.some((img) => !known.has(img.key) && !isTrustedUpload(img))) {
    return { error: "Photos must be uploaded through the product form" };
  }

  // An image key can only ever belong to one product.
  const keys = images.map((i) => i.key);
  const taken = await prisma.productImage.findFirst({
    where: { key: { in: keys }, ...(productId ? { productId: { not: productId } } : {}) },
  });
  if (taken) return { error: "One of these photos is already used by another product" };

  // Artisans can't un-hide a product an admin has hidden.
  const status = existing?.status === "HIDDEN" ? "HIDDEN" : data.status;
  const imageRows = images.map((img, position) => ({ key: img.key, url: known.get(img.key) ?? img.url, position }));

  let id: string;
  if (existing) {
    const removed = existing.images.filter((i) => !keys.includes(i.key)).map((i) => i.key);
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: existing.id, key: { notIn: keys } } }),
      ...imageRows.map((img) =>
        prisma.productImage.upsert({
          where: { key: img.key },
          update: { position: img.position },
          create: { ...img, productId: existing.id },
        }),
      ),
      prisma.product.update({ where: { id: existing.id }, data: { ...data, status } }),
    ]);
    id = existing.id;
    if (removed.length) await utapi.deleteFiles(removed).catch((e) => console.error("UploadThing delete failed", e));
  } else {
    const product = await prisma.product.create({
      data: { ...data, status, artisanId, slug: await uniqueProductSlug(data.title), images: { create: imageRows } },
    });
    id = product.id;
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  return { ok: true, productId: id };
}

/**
 * Deletes a product the artisan owns. Products with order or auction history are
 * archived instead so those records keep pointing at something.
 */
export async function deleteProduct(productId: string): Promise<FormState> {
  const session = await requireRole("artisan");
  const artisanId = await myShopId(session.user.id);

  const product = await prisma.product.findFirst({
    where: { id: productId, artisanId },
    include: { images: true, _count: { select: { orderItems: true, auctions: true } } },
  });
  if (!product) return { error: "Product not found" };

  const liveAuction = await prisma.auction.findFirst({
    where: { productId, status: { in: ["SCHEDULED", "LIVE"] } },
    select: { id: true },
  });
  if (liveAuction) return { error: "Cancel this product's scheduled or live auction first" };

  if (product._count.orderItems || product._count.auctions) {
    await prisma.product.update({ where: { id: productId }, data: { status: "ARCHIVED" } });
  } else {
    await prisma.product.delete({ where: { id: productId } });
    const keys = product.images.map((i) => i.key);
    if (keys.length) await utapi.deleteFiles(keys).catch((e) => console.error("UploadThing delete failed", e));
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  return { ok: true };
}

async function uniqueProductSlug(title: string) {
  const base = slugify(title) || "item";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.product.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}
