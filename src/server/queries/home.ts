import "server-only";
import { prisma } from "@/lib/db";
import { minNextBid } from "@/server/services/bid.rules";
import { buyableProductWhere, visibleArtisanWhere } from "@/server/queries/catalog";

const lotInclude = {
  product: { select: { title: true, description: true, images: { orderBy: { position: "asc" as const }, take: 1, select: { url: true } } } },
  artisan: { select: { shopName: true, slug: true } },
};

/** Materials shown on the home page, mapped to catalogue categories. */
export const MATERIALS = [
  { key: "clay", label: "Clay", category: "ceramics", line: "Thrown, glazed and fired", image: "/demo/material-clay.jpg" },
  { key: "fiber", label: "Fiber", category: "textiles", line: "Woven, dyed and printed", image: "/demo/material-fiber.jpg" },
  { key: "wood", label: "Wood", category: "woodwork", line: "Carved, turned and oiled", image: "/demo/material-wood.jpg" },
  { key: "metal", label: "Metal", category: "jewelry", line: "Forged, set and polished", image: "/demo/material-metal.jpg" },
] as const;

export async function getHomeData() {
  const [live, upcoming, newest, makers, categoryCounts] = await Promise.all([
    prisma.auction.findMany({ where: { status: "LIVE" }, orderBy: { endsAt: "asc" }, take: 5, include: lotInclude }),
    prisma.auction.findMany({ where: { status: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 4, include: lotInclude }),
    prisma.product.findMany({
      where: buyableProductWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { images: { orderBy: { position: "asc" }, take: 1 }, artisan: { select: { shopName: true, slug: true } } },
    }),
    prisma.artisanProfile.findMany({
      where: { ...visibleArtisanWhere, products: { some: buyableProductWhere } },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: {
        shopName: true,
        slug: true,
        bio: true,
        _count: { select: { products: { where: buyableProductWhere } } },
        products: {
          where: { ...buyableProductWhere, images: { some: {} } },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { slug: true, title: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } },
        },
      },
    }),
    prisma.product.groupBy({ by: ["categoryId"], where: buyableProductWhere, _count: true }),
  ]);

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const countBySlug = new Map(
    categories.map((c) => [c.slug, categoryCounts.find((g) => g.categoryId === c.id)?._count ?? 0]),
  );

  const featured = live[0] ?? upcoming[0] ?? null;
  return {
    featured: featured && { ...featured, minNextBidCents: minNextBid(featured), serverNow: Date.now() },
    moreLots: [...live, ...upcoming].filter((a) => a.id !== featured?.id).slice(0, 4),
    newest,
    makers,
    materials: MATERIALS.map((m) => ({ ...m, count: countBySlug.get(m.category) ?? 0 })),
  };
}

export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
