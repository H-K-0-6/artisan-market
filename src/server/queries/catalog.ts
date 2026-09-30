import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZE = 12;

export const SORTS = {
  newest: { label: "Newest", orderBy: { createdAt: "desc" } },
  "price-asc": { label: "Price: low to high", orderBy: { priceCents: "asc" } },
  "price-desc": { label: "Price: high to low", orderBy: { priceCents: "desc" } },
} as const satisfies Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }>;

export type SortKey = keyof typeof SORTS;

/** A shop is publicly visible unless its owner has been banned. */
export const visibleArtisanWhere: Prisma.ArtisanProfileWhereInput = {
  user: { OR: [{ banned: false }, { banned: null }] },
};

/** Products a buyer can see and purchase from the storefront. */
export const buyableProductWhere: Prisma.ProductWhereInput = {
  status: "ACTIVE",
  priceCents: { gt: 0 },
  artisan: visibleArtisanWhere,
};

export type CatalogParams = { q?: string; category?: string; sort?: string; page?: string };

/** Normalises raw searchParams into safe values. */
export function parseCatalogParams(raw: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const sort = one(raw.sort);
  const page = Number.parseInt(one(raw.page) ?? "1", 10);
  return {
    q: one(raw.q)?.slice(0, 100),
    category: one(raw.category),
    sort: (sort && sort in SORTS ? sort : "newest") as SortKey,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export async function searchProducts(params: ReturnType<typeof parseCatalogParams>) {
  const where: Prisma.ProductWhereInput = {
    ...buyableProductWhere,
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: "insensitive" } },
            { description: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    // A parent category also matches products filed under its subcategories.
    ...(params.category
      ? { category: { OR: [{ slug: params.category }, { parent: { slug: params.category } }] } }
      : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [SORTS[params.sort].orderBy, { id: "asc" }],
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        artisan: { select: { shopName: true, slug: true } },
      },
    }),
  ]);

  return { products, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const listCategories = () =>
  prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true, parentId: true } });

/** An ACTIVE product from a visible shop, or null. */
export function getProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "ACTIVE", artisan: visibleArtisanWhere },
    include: {
      images: { orderBy: { position: "asc" } },
      category: { select: { name: true, slug: true } },
      artisan: { select: { id: true, userId: true, shopName: true, slug: true, avatarUrl: true } },
    },
  });
}

export function getShopBySlug(slug: string) {
  return prisma.artisanProfile.findFirst({
    where: { slug, ...visibleArtisanWhere },
    include: {
      products: {
        where: { status: "ACTIVE", priceCents: { gt: 0 } },
        orderBy: { createdAt: "desc" },
        include: { images: { orderBy: { position: "asc" }, take: 1 } },
      },
    },
  });
}
