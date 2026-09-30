import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/** The signed-in artisan's shop. Every dashboard query is scoped to its id. */
export async function getMyShop(userId: string) {
  const shop = await prisma.artisanProfile.findUnique({ where: { userId } });
  if (!shop) notFound();
  return shop;
}

export function listMyProducts(artisanId: string) {
  return prisma.product.findMany({
    where: { artisanId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 1 }, category: true },
  });
}

/** Returns the product only if it belongs to this artisan. */
export async function getMyProduct(artisanId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, artisanId, status: { not: "ARCHIVED" } },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!product) notFound();
  return product;
}

export const listCategories = () => prisma.category.findMany({ orderBy: { name: "asc" } });
