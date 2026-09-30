import { prisma } from "@/lib/db";

/** Empties every application table (keeps the schema and migrations). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** A user with a role (bypasses Better Auth; no password). */
export async function makeUser(role: "buyer" | "artisan" | "admin" = "buyer", extra: { banned?: boolean } = {}) {
  const id = uid();
  return prisma.user.create({ data: { id, name: `User ${id}`, email: `${id}@test.local`, role, ...extra } });
}

/** An artisan user plus their shop. */
export async function makeArtisan() {
  const user = await makeUser("artisan");
  const shop = await prisma.artisanProfile.create({
    data: { userId: user.id, shopName: `Shop ${user.id}`, slug: `shop-${user.id}` },
  });
  return { user, shop };
}

export async function makeProduct(artisanId: string, data: { priceCents?: number; stock?: number } = {}) {
  const id = uid();
  return prisma.product.create({
    data: {
      artisanId,
      title: `Product ${id}`,
      slug: `product-${id}`,
      description: "Test product",
      priceCents: data.priceCents ?? 2500,
      stock: data.stock ?? 5,
      status: "ACTIVE",
    },
  });
}
