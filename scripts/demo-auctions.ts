// Refreshes the demo auctions so there is always something on the block:
// removes test lots, puts two lots live (with a few real bids placed through the
// bid service) and schedules one to open later.
//
// Usage: npm run demo:auctions   (server running or not; its sweep picks the lots up)
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { placeBid } from "../src/server/services/bid.service";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOTS = [
  { slug: "anagama-wood-fired-moon-jar", start: 30_000, increment: 1_000, opensIn: -20 * MIN, closesIn: 6 * 60 * MIN, reserve: 40_000, bids: 3 },
  { slug: "heirloom-tapestry-wall-hanging", start: 24_000, increment: 1_000, opensIn: -5 * MIN, closesIn: 95 * MIN, reserve: null, bids: 2 },
  { slug: "burl-maple-keepsake-bowl", start: 9_000, increment: 500, opensIn: 3 * 60 * MIN, closesIn: 27 * 60 * MIN, reserve: null, bids: 0 },
] as const;

async function main() {
  // Lots left behind by smoke/E2E runs.
  const testProducts = await prisma.product.findMany({ where: { slug: { startsWith: "e2e-" } }, select: { id: true } });
  const ids = testProducts.map((p) => p.id);
  await prisma.order.deleteMany({ where: { auction: { productId: { in: ids } } } });
  await prisma.auction.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  if (ids.length) console.log(`Removed ${ids.length} test lots`);

  const bidders = await prisma.user.findMany({
    where: { email: { in: ["buyer@demo.test", "buyer2@demo.test"] }, banned: { not: true } },
    select: { id: true },
  });

  for (const lot of LOTS) {
    const product = await prisma.product.findUnique({ where: { slug: lot.slug }, select: { id: true, artisanId: true } });
    if (!product) {
      console.log(`- ${lot.slug}: product missing (run the seed first)`);
      continue;
    }
    const active = await prisma.auction.findFirst({ where: { productId: product.id, status: { in: ["LIVE", "SCHEDULED"] } } });
    if (active) {
      console.log(`= ${lot.slug}: already ${active.status.toLowerCase()} (lot ${active.lotNumber})`);
      continue;
    }
    const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT (now() AT TIME ZONE 'UTC') AS now`;
    const startsAt = new Date(now.getTime() + lot.opensIn);
    const endsAt = new Date(now.getTime() + lot.closesIn);
    const auction = await prisma.auction.create({
      data: {
        productId: product.id,
        artisanId: product.artisanId,
        status: lot.opensIn <= 0 ? "LIVE" : "SCHEDULED",
        startPriceCents: lot.start,
        minIncrementCents: lot.increment,
        reservePriceCents: lot.reserve,
        startsAt,
        endsAt,
        originalEndsAt: endsAt,
      },
    });
    let amount = lot.start;
    for (let i = 0; i < lot.bids && bidders.length; i++) {
      await placeBid(bidders[i % bidders.length].id, auction.id, amount);
      amount += lot.increment * (i + 2);
      await sleep(250);
    }
    console.log(`+ lot ${auction.lotNumber}: ${lot.slug} ${auction.status.toLowerCase()} with ${lot.bids} bids`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
