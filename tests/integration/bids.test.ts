import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { BidError, placeBid } from "@/server/services/bid.service";
import { makeArtisan, makeProduct, makeUser, resetDb } from "../helpers/db";
import { makeAuction } from "../helpers/auction";

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BidError) return e.code;
    throw e;
  }
}

async function setup(over: Parameters<typeof makeAuction>[2] = {}) {
  const { user: artisan, shop } = await makeArtisan();
  const product = await makeProduct(shop.id);
  const auction = await makeAuction(shop.id, product.id, over);
  return { artisan, shop, product, auction };
}

describe("placeBid", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("stays consistent under 50 concurrent bids from several buyers", async () => {
    const { auction } = await setup({ startPriceCents: 1000, minIncrementCents: 100 });
    // 10 buyers x 5 bids (the per-user limit is 5/s). Amounts rise, with many duplicates.
    const buyers = await Promise.all(Array.from({ length: 10 }, () => makeUser("buyer")));
    const attempts = Array.from({ length: 50 }, (_, i) => ({
      bidder: buyers[i % 10],
      amount: 1000 + Math.floor(i / 3) * 100 + (i % 7 === 0 ? 50 : 0),
    }));
    // Fired in rising order all at once: lock acquisition order is up to Postgres,
    // so duplicates and near-duplicates race for the same slot.
    const results = await Promise.allSettled(attempts.map((a) => placeBid(a.bidder.id, auction.id, a.amount)));
    const accepted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(BidError);
      expect(["TOO_LOW", "ALREADY_HIGH_BIDDER"]).toContain((r.reason as BidError).code);
    }
    expect(accepted.length).toBeGreaterThan(0);

    const final = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    const bids = await prisma.bid.findMany({
      where: { auctionId: auction.id },
      orderBy: [{ createdAt: "asc" }, { amountCents: "asc" }],
    });

    expect(bids.length).toBe(accepted.length);
    expect(final.bidCount).toBe(bids.length);
    const max = Math.max(...bids.map((b) => b.amountCents));
    expect(final.currentPriceCents).toBe(max);
    expect(new Set(bids.map((b) => b.amountCents)).size).toBe(bids.length);
    expect(bids[0].amountCents).toBeGreaterThanOrEqual(1000);
    for (let i = 1; i < bids.length; i++) {
      expect(bids[i].amountCents).toBeGreaterThanOrEqual(bids[i - 1].amountCents + 100);
      expect(bids[i].bidderId).not.toBe(bids[i - 1].bidderId);
    }
    expect(final.highBidderId).toBe(bids[bids.length - 1].bidderId);
    console.log(`50 concurrent bids: ${accepted.length} accepted, ${rejected.length} rejected, final ${max}`);
  });

  it("extends endsAt when a bid lands in the last 2 minutes", async () => {
    const endsAt = new Date(Date.now() + 60_000);
    const { auction } = await setup({ endsAt });
    const buyer = await makeUser("buyer");
    const res = await placeBid(buyer.id, auction.id, 1000);
    expect(res.extended).toBe(true);
    const after = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(after.endsAt.getTime()).toBeGreaterThan(endsAt.getTime());
    expect(after.endsAt.getTime()).toBeGreaterThan(Date.now() + 110_000);
    expect(after.originalEndsAt.getTime()).toBe(endsAt.getTime());
  });

  it("does not extend when more than 2 minutes remain", async () => {
    const { auction } = await setup();
    const buyer = await makeUser("buyer");
    const res = await placeBid(buyer.id, auction.id, 1000);
    expect(res.extended).toBe(false);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).endsAt).toEqual(auction.endsAt);
  });

  it("rejects banned users (re-read inside the transaction)", async () => {
    const { auction } = await setup();
    const buyer = await makeUser("buyer");
    await prisma.user.update({ where: { id: buyer.id }, data: { banned: true } });
    expect(await codeOf(placeBid(buyer.id, auction.id, 1000))).toBe("NOT_ALLOWED");
    expect(await prisma.bid.count()).toBe(0);
  });

  it("rejects own-auction, non-buyer, too-low, repeat high bidder and closed auctions", async () => {
    const { auction, artisan } = await setup({ reservePriceCents: 1500 });
    const [b1, b2] = [await makeUser("buyer"), await makeUser("buyer")];
    const otherArtisan = await makeUser("artisan");

    expect(await codeOf(placeBid(artisan.id, auction.id, 1000))).toBe("OWN_AUCTION");
    expect(await codeOf(placeBid(otherArtisan.id, auction.id, 1000))).toBe("NOT_ALLOWED");
    expect(await codeOf(placeBid(b1.id, auction.id, 999))).toBe("TOO_LOW");
    await placeBid(b1.id, auction.id, 1000);
    expect(await codeOf(placeBid(b1.id, auction.id, 2000))).toBe("ALREADY_HIGH_BIDDER");
    expect(await codeOf(placeBid(b2.id, auction.id, 1099))).toBe("TOO_LOW");
    await placeBid(b2.id, auction.id, 1500);

    const a = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.reserveMet).toBe(true);
    // b1 was outbid: an OUTBID notification is stored for them.
    expect(await prisma.notification.count({ where: { userId: b1.id, type: "OUTBID" } })).toBe(1);

    await prisma.auction.update({ where: { id: auction.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await codeOf(placeBid(b1.id, auction.id, 5000))).toBe("CLOSED");
    expect(await codeOf(placeBid(b1.id, "does-not-exist", 5000))).toBe("NOT_FOUND");
  });
});
