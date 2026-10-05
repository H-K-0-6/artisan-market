// Points already-seeded demo products at the local photos in public/demo,
// replacing their placeholder images. Safe to run repeatedly.
// Usage: npx tsx scripts/apply-demo-images.ts
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";

async function main() {
  const products = await prisma.product.findMany({ select: { id: true, slug: true } });
  let updated = 0;
  for (const p of products) {
    if (!existsSync(path.join("public/demo", `${p.slug}.jpg`))) continue;
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: p.id, key: { startsWith: "seed-" } } }),
      prisma.productImage.create({ data: { productId: p.id, key: `seed-${p.slug}-0`, url: `/demo/${p.slug}.jpg`, position: 0 } }),
    ]);
    updated++;
  }
  console.log(`Updated photos for ${updated} demo products.`);
}

main().finally(() => prisma.$disconnect());
