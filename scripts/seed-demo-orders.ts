// Dev-only: adds paid/shipped/delivered demo orders spread over the last 30 days so the
// admin revenue chart and order tables have data without going through Stripe.
// Re-running replaces the previous demo orders (they're tagged with a pi_demo_ payment id).
//
//   npx tsx scripts/seed-demo-orders.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { commissionCents } from "../src/lib/money";

const DAY = 86_400_000;
const STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;
const ADDRESSES = [
  { name: "Ben Buyer", line1: "12 Market St", city: "Portland", state: "OR", postal_code: "97205", country: "US" },
  { name: "Bea Bidder", line1: "88 King St W", city: "Toronto", state: "ON", postal_code: "M5H 1J9", country: "CA" },
];

// Deterministic pseudo-random so re-runs produce the same chart.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo orders in production");

  const buyers = await prisma.user.findMany({
    where: { email: { in: ["buyer@demo.test", "buyer2@demo.test"] } },
    orderBy: { email: "asc" },
  });
  if (buyers.length === 0) throw new Error("Run `npx tsx prisma/seed.ts` first");
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", priceCents: { gt: 0 } },
    include: { artisan: true },
  });
  if (products.length === 0) throw new Error("No active products to order");

  const removed = await prisma.order.deleteMany({ where: { stripePaymentIntentId: { startsWith: "pi_demo_" } } });

  let created = 0;
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    // 0–2 orders a day, a few more on weekends.
    const date = new Date(Date.now() - daysAgo * DAY);
    const count = Math.floor(rand() * (date.getUTCDay() % 6 === 0 ? 3 : 2.2));
    for (let i = 0; i < count; i++) {
      const buyerIdx = Math.floor(rand() * buyers.length);
      const buyer = buyers[buyerIdx];
      const lines = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({ product: pick(products), qty: 1 + Math.floor(rand() * 2) }))
        .filter((l, idx, all) => all.findIndex((o) => o.product.id === l.product.id) === idx);
      const subtotal = lines.reduce((s, l) => s + l.product.priceCents * l.qty, 0);
      const commission = lines.reduce((s, l) => s + commissionCents(l.product.priceCents * l.qty, l.product.artisan.commissionBps), 0);
      const paidAt = new Date(date.getTime() - Math.floor(rand() * 8) * 3_600_000);
      const status = daysAgo < 3 ? "PAID" : pick(STATUSES);
      const n = created + 1;
      await prisma.order.create({
        data: {
          buyerId: buyer.id,
          source: "CART",
          status,
          subtotalCents: subtotal,
          commissionCents: commission,
          totalCents: subtotal,
          stripeCheckoutSessionId: `cs_demo_${paidAt.getTime()}_${n}`,
          stripePaymentIntentId: `pi_demo_${paidAt.getTime()}_${n}`,
          paidAt,
          createdAt: new Date(paidAt.getTime() - 5 * 60_000),
          shippingAddress: ADDRESSES[buyerIdx % ADDRESSES.length],
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              artisanId: l.product.artisanId,
              titleSnapshot: l.product.title,
              unitPriceCents: l.product.priceCents,
              qty: l.qty,
              ...(status !== "PAID" && { shippedAt: new Date(paidAt.getTime() + DAY), trackingNo: `1Z${n.toString().padStart(8, "0")}` }),
            })),
          },
        },
      });
      created++;
    }
  }
  console.log(`Removed ${removed.count} old demo orders, created ${created} demo orders over the last 30 days.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
