// Adds (or refreshes) a cheap "Payment test" item so you can try real sandbox or
// live payments without spending much. Priced below the normal BD 1.000 minimum,
// so it can only be created here, not through the artisan dashboard.
//
// Usage: npm run test-item            (BD 0.100)
//        npm run test-item -- 250     (price in fils, here BD 0.250)
import "dotenv/config";
import { prisma } from "../src/lib/db";

const SLUG = "payment-test-item";

async function main() {
  const fils = Number(process.argv[2] ?? 100);
  if (!Number.isInteger(fils) || fils < 100) throw new Error("Price must be whole fils, at least 100 (BD 0.100)");

  const shop = await prisma.artisanProfile.findFirstOrThrow({ where: { user: { email: "artisan@demo.test" } } });
  // Borrow a photo from an existing listing so the card doesn't look broken.
  const photo = await prisma.productImage.findFirst({ where: { product: { slug: "carved-cherry-spoon" } } });

  const data = {
    title: "Payment Test Item",
    description: "A placeholder for trying out checkout. Buying it charges a tiny amount and nothing is shipped.",
    priceCents: fils,
    stock: 999,
    status: "ACTIVE" as const,
  };
  const product = await prisma.product.upsert({
    where: { slug: SLUG },
    update: data,
    create: {
      ...data,
      slug: SLUG,
      artisanId: shop.id,
      images: photo ? { create: [{ key: `test-${SLUG}`, url: photo.url }] } : undefined,
    },
  });
  console.log(`Ready: "${product.title}" at BD ${(fils / 1000).toFixed(3)} -> /products/${SLUG}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
