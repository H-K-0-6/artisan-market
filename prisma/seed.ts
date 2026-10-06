import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { auth } from "../src/lib/auth";

const PASSWORD = "Password123!";
const MIN = 60_000;

const USERS = [
  { email: "admin@demo.test", name: "Ada Admin", role: "admin" },
  { email: "artisan@demo.test", name: "Mira Potter", role: "artisan" },
  { email: "artisan2@demo.test", name: "Jonas Weaver", role: "artisan" },
  { email: "buyer@demo.test", name: "Ben Buyer", role: "buyer" },
  { email: "buyer2@demo.test", name: "Bea Bidder", role: "buyer" },
] as const;

const CATEGORIES = [
  { name: "Ceramics", slug: "ceramics" },
  { name: "Textiles", slug: "textiles" },
  { name: "Woodwork", slug: "woodwork" },
  { name: "Jewelry", slug: "jewelry" },
];

// Prices in fils (1 BHD = 1000 fils): 9_500 is BD 9.500.
const PRODUCTS: { title: string; category: string; price: number; stock: number; shop: 0 | 1 }[] = [
  { title: "Speckled Stoneware Mug", category: "ceramics", price: 9_500, stock: 12, shop: 0 },
  { title: "Celadon Serving Bowl", category: "ceramics", price: 24_000, stock: 4, shop: 0 },
  { title: "Raku Bud Vase", category: "ceramics", price: 16_000, stock: 6, shop: 0 },
  { title: "Hand-thrown Pour-over Set", category: "ceramics", price: 33_500, stock: 3, shop: 0 },
  { title: "Silver Hammered Ring", category: "jewelry", price: 21_000, stock: 8, shop: 0 },
  { title: "Ceramic Bead Necklace", category: "jewelry", price: 14_500, stock: 10, shop: 0 },
  { title: "Indigo Linen Throw", category: "textiles", price: 47_000, stock: 5, shop: 1 },
  { title: "Handwoven Wool Scarf", category: "textiles", price: 28_000, stock: 9, shop: 1 },
  { title: "Block-printed Tea Towels (set of 3)", category: "textiles", price: 12_000, stock: 20, shop: 1 },
  { title: "Walnut Serving Board", category: "woodwork", price: 25_500, stock: 7, shop: 1 },
  { title: "Carved Cherry Spoon", category: "woodwork", price: 9_800, stock: 15, shop: 1 },
  { title: "Oak Jewelry Box", category: "woodwork", price: 37_000, stock: 2, shop: 1 },
];

// Demo photos live in public/demo (public-domain / CC0, see credits.json).
const demoImage = (slug: string) =>
  existsSync(path.join("public/demo", `${slug}.jpg`)) ? `/demo/${slug}.jpg` : `https://picsum.photos/seed/${slug}/800/800`;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  // Users go through Better Auth so passwords are hashed the same way as real sign-ups.
  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) {
      await auth.api.signUpEmail({ body: { email: u.email, password: PASSWORD, name: u.name } });
      user = await prisma.user.findUniqueOrThrow({ where: { email: u.email } });
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: u.role, emailVerified: true } });
    userIds[u.email] = user.id;
  }

  const shops = await Promise.all(
    [
      { email: "artisan@demo.test", shopName: "Mira's Clay Studio", bio: "Small-batch stoneware and porcelain, fired in Portland." },
      { email: "artisan2@demo.test", shopName: "Weaver & Wood", bio: "Handwoven textiles and hand-carved hardwood goods." },
    ].map((s) =>
      prisma.artisanProfile.upsert({
        where: { userId: userIds[s.email] },
        update: {},
        create: { userId: userIds[s.email], shopName: s.shopName, slug: slugify(s.shopName), bio: s.bio },
      }),
    ),
  );

  const categories: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categories[c.slug] = cat.id;
  }

  for (const p of PRODUCTS) {
    const slug = slugify(p.title);
    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: p.title,
        description: `${p.title}, made by hand. Each piece is one of a kind, so small variations in colour and texture are part of its character.`,
        priceCents: p.price,
        stock: p.stock,
        status: "ACTIVE",
        artisanId: shops[p.shop].id,
        categoryId: categories[p.category],
        images: { create: [{ key: `seed-${slug}-0`, url: demoImage(slug) }] },
      },
    });
  }

  // Three auctions: live, scheduled, ended (unsold). Only created on a fresh database.
  if ((await prisma.auction.count()) === 0) {
    const now = Date.now();
    const auctionProducts = await Promise.all(
      [
        { title: "Anagama Wood-fired Moon Jar", shop: 0, cat: "ceramics" },
        { title: "Heirloom Tapestry Wall Hanging", shop: 1, cat: "textiles" },
        { title: "Burl Maple Keepsake Bowl", shop: 1, cat: "woodwork" },
      ].map((p) => {
        const slug = slugify(p.title);
        return prisma.product.create({
          data: {
            slug,
            title: p.title,
            description: `${p.title}. A single, one-off piece offered at auction.`,
            priceCents: 0,
            stock: 1,
            status: "ACTIVE",
            artisanId: shops[p.shop].id,
            categoryId: categories[p.cat],
            images: { create: [{ key: `seed-${slug}-0`, url: demoImage(slug) }] },
          },
        });
      }),
    );

    const liveEnds = new Date(now + 30 * MIN);
    await prisma.auction.create({
      data: {
        productId: auctionProducts[0].id,
        artisanId: shops[0].id,
        status: "LIVE",
        startPriceCents: 56_500,
        minIncrementCents: 2_000,
        reservePriceCents: 75_000,
        startsAt: new Date(now - 10 * MIN),
        endsAt: liveEnds,
        originalEndsAt: liveEnds,
      },
    });
    const schedStart = new Date(now + 60 * MIN);
    const schedEnd = new Date(now + 180 * MIN);
    await prisma.auction.create({
      data: {
        productId: auctionProducts[1].id,
        artisanId: shops[1].id,
        status: "SCHEDULED",
        startPriceCents: 94_000,
        minIncrementCents: 4_000,
        startsAt: schedStart,
        endsAt: schedEnd,
        originalEndsAt: schedEnd,
      },
    });
    const endedAt = new Date(now - 60 * MIN);
    await prisma.auction.create({
      data: {
        productId: auctionProducts[2].id,
        artisanId: shops[1].id,
        status: "UNSOLD",
        startPriceCents: 34_000,
        minIncrementCents: 2_000,
        startsAt: new Date(now - 24 * 60 * MIN),
        endsAt: endedAt,
        originalEndsAt: endedAt,
        endedAt,
      },
    });
  }

  console.log(`Seeded ${USERS.length} users, ${PRODUCTS.length} products, 3 auctions. Password: ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
