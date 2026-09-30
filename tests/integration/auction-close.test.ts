import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { placeBid } from "@/server/services/bid.service";
import { closeAuction, expireAuctionOrder, startAuction, sweep, PAY_WINDOW_MS } from "@/server/services/auction-lifecycle";
import { cancelAuction } from "@/server/services/auction.service";
import { makeArtisan, makeProduct, makeUser, resetDb } from "../helpers/db";
import { expireAuctionNow, makeAuction } from "../helpers/auction";

async function setup(over: Parameters<typeof makeAuction>[2] = {}) {
  const { user: artisan, shop } = await makeArtisan();
  const product = await makeProduct(shop.id);
  const auction = await makeAuction(shop.id, product.id, over);
  return { artisan, shop, product, auction };
}

async function wonAuction() {
  const s = await setup();
  const buyer = await makeUser("buyer");
  await placeBid(buyer.id, s.auction.id, 1000);
  await expireAuctionNow(s.auction.id);
  await closeAuction(s.auction.id);
  const order = await prisma.order.findUniqueOrThrow({ where: { auctionId: s.auction.id } });
  return { ...s, buyer, order };
}

describe("auction lifecycle", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("closing the same auction twice concurrently creates exactly one order", async () => {
    const { auction, artisan, product } = await setup({ startPriceCents: 5000, reservePriceCents: 6000 });
    const [b1, b2] = [await makeUser("buyer"), await makeUser("buyer")];
    await placeBid(b1.id, auction.id, 5000);
    await placeBid(b2.id, auction.id, 6500);
    await expireAuctionNow(auction.id);

    const results = await Promise.all([closeAuction(auction.id), closeAuction(auction.id), closeAuction(auction.id)]);
    expect(results.filter((r) => r.kind === "done")).toHaveLength(1);

    const orders = await prisma.order.findMany({ where: { auctionId: auction.id }, include: { items: true } });
    expect(orders).toHaveLength(1);
    const a = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.status).toBe("ENDED");
    expect(a.winnerId).toBe(b2.id);
    expect(a.endedAt).not.toBeNull();

    const o = orders[0];
    expect(o).toMatchObject({ buyerId: b2.id, source: "AUCTION", status: "PENDING", subtotalCents: 6500, totalCents: 6500 });
    expect(o.commissionCents).toBe(650); // default 1000 bps
    expect(o.payDeadline!.getTime()).toBe(a.endedAt!.getTime() + PAY_WINDOW_MS);
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ productId: product.id, titleSnapshot: product.title, unitPriceCents: 6500, qty: 1 });

    expect(await prisma.notification.count({ where: { userId: b2.id, type: "AUCTION_WON", link: `/pay/${o.id}` } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: artisan.id, type: "AUCTION_ENDED" } })).toBe(1);
  });

  it("reserve not met ends UNSOLD with no order", async () => {
    const { auction } = await setup({ startPriceCents: 1000, reservePriceCents: 5000 });
    const b1 = await makeUser("buyer");
    await placeBid(b1.id, auction.id, 1000);
    await expireAuctionNow(auction.id);
    expect((await closeAuction(auction.id)).kind).toBe("done");
    const a = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.status).toBe("UNSOLD");
    expect(a.winnerId).toBeNull();
    expect(await prisma.order.count()).toBe(0);
  });

  it("no bids ends UNSOLD with no order", async () => {
    const { auction } = await setup();
    await expireAuctionNow(auction.id);
    await closeAuction(auction.id);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe("UNSOLD");
    expect(await prisma.order.count()).toBe(0);
  });

  it("does not close before endsAt and asks to be rescheduled (anti-snipe moved it)", async () => {
    const { auction } = await setup();
    const r = await closeAuction(auction.id);
    expect(r).toEqual({ kind: "reschedule", at: auction.endsAt });
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe("LIVE");
  });

  it("starts a scheduled auction only once its start time has passed", async () => {
    const future = await setup({ status: "SCHEDULED", startsAt: new Date(Date.now() + 60_000) });
    expect((await startAuction(future.auction.id)).kind).toBe("reschedule");
    const due = await setup({ status: "SCHEDULED", startsAt: new Date(Date.now() - 1000) });
    expect((await startAuction(due.auction.id)).kind).toBe("done");
    expect((await startAuction(due.auction.id)).kind).toBe("noop");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: due.auction.id } })).status).toBe("LIVE");
  });

  it("the sweep starts and closes overdue auctions", async () => {
    const overdueStart = await setup({ status: "SCHEDULED", startsAt: new Date(Date.now() - 1000) });
    const overdueEnd = await setup({ endsAt: new Date(Date.now() - 1000) });
    const r = await sweep();
    expect(r.started).toBe(1);
    expect(r.closed).toBe(1);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: overdueStart.auction.id } })).status).toBe("LIVE");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: overdueEnd.auction.id } })).status).toBe("UNSOLD");
  });

  it("an unpaid order expires at its deadline and the auction becomes UNSOLD", async () => {
    const { auction, artisan, buyer, order } = await wonAuction();

    expect((await expireAuctionOrder(order.id)).kind).toBe("reschedule"); // deadline not reached
    await prisma.order.update({ where: { id: order.id }, data: { payDeadline: new Date(Date.now() - 1000) } });
    const [r1, r2] = await Promise.all([expireAuctionOrder(order.id), expireAuctionOrder(order.id)]);
    expect([r1.kind, r2.kind].sort()).toEqual(["done", "noop"]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe("UNSOLD");
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "SYSTEM" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: artisan.id, title: { contains: "didn't pay" } } })).toBe(1);
  });

  it("does not expire a paid order", async () => {
    const { order } = await wonAuction();
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID", payDeadline: new Date(Date.now() - 1000) } });
    expect((await expireAuctionOrder(order.id)).kind).toBe("noop");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });
});

describe("cancelAuction", () => {
  beforeEach(resetDb);

  it("lets the owning artisan cancel before LIVE, recording who and why", async () => {
    const { auction, artisan } = await setup({ status: "SCHEDULED", startsAt: new Date(Date.now() + 60_000) });
    await cancelAuction({ auctionId: auction.id, actorId: artisan.id, reason: "Piece cracked in the kiln" });
    const a = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.status).toBe("CANCELLED");
    expect(a.cancelledReason).toBe(`Cancelled by artisan ${artisan.name}: Piece cracked in the kiln`);
  });

  it("refuses artisan cancels once LIVE, and on other artisans' auctions", async () => {
    const { auction, artisan } = await setup();
    await expect(cancelAuction({ auctionId: auction.id, actorId: artisan.id, reason: "changed my mind" })).rejects.toThrow(
      /admin/,
    );
    const other = await setup({ status: "SCHEDULED", startsAt: new Date(Date.now() + 60_000) });
    await expect(cancelAuction({ auctionId: other.auction.id, actorId: artisan.id, reason: "not mine" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets an admin cancel an ENDED auction with an unpaid order, cancelling the order", async () => {
    const { auction, buyer } = await wonAuction();
    const admin = await makeUser("admin");
    await cancelAuction({ auctionId: auction.id, actorId: admin.id, reason: "Fraud report" });
    const a = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.status).toBe("CANCELLED");
    expect(a.cancelledReason).toBe(`Cancelled by admin ${admin.name}: Fraud report`);
    expect((await prisma.order.findUniqueOrThrow({ where: { auctionId: auction.id } })).status).toBe("CANCELLED");
    expect(await prisma.notification.count({ where: { userId: buyer.id, title: { startsWith: "Auction cancelled" } } })).toBe(1);
    await expect(cancelAuction({ auctionId: auction.id, actorId: admin.id, reason: "again" })).rejects.toMatchObject({
      code: "NOT_CANCELLABLE",
    });
  });

  it("refuses to cancel once the winner has paid", async () => {
    const { auction, order } = await wonAuction();
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    const admin = await makeUser("admin");
    await expect(cancelAuction({ auctionId: auction.id, actorId: admin.id, reason: "late cancel" })).rejects.toMatchObject({
      code: "NOT_CANCELLABLE",
    });
  });

  it("a bid after an admin cancels a LIVE auction is rejected", async () => {
    const { auction } = await setup();
    const admin = await makeUser("admin");
    const b1 = await makeUser("buyer");
    await cancelAuction({ auctionId: auction.id, actorId: admin.id, reason: "Policy violation" });
    await expect(placeBid(b1.id, auction.id, 1000)).rejects.toMatchObject({ code: "CLOSED" });
  });
});
