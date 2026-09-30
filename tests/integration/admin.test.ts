import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  AdminActionError,
  banUser,
  cancelAuctionAsAdmin,
  hideProduct,
  restoreProduct,
  setUserRole,
  unbanUser,
} from "@/server/services/admin.service";
import { getDailyRevenue, listAuditLogs, listOrders, listProducts, listUsers } from "@/server/queries/admin";
import { makeArtisan, makeProduct, makeUser, resetDb } from "../helpers/db";

// Stand-ins for the Better Auth admin endpoints (which need a real request's headers).
const fakeAuth = {
  banInAuth: vi.fn(async (userId: string, banReason: string) => {
    await prisma.user.update({ where: { id: userId }, data: { banned: true, banReason } });
    await prisma.session.deleteMany({ where: { userId } });
  }),
  unbanInAuth: vi.fn(async (userId: string) => {
    await prisma.user.update({ where: { id: userId }, data: { banned: false, banReason: null } });
  }),
  setRoleInAuth: vi.fn(async (userId: string, role: string) => {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  }),
};

describe("admin moderation services", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });
  afterAll(() => prisma.$disconnect());

  it("hides a product, notifies the artisan and writes an audit row; restore reverses it", async () => {
    const admin = await makeUser("admin");
    const { user: artisanUser, shop } = await makeArtisan();
    const product = await makeProduct(shop.id);

    await hideProduct({ actorId: admin.id, productId: product.id, reason: "Counterfeit item" });

    const hidden = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(hidden.status).toBe("HIDDEN");
    expect(hidden.hiddenReason).toBe("Counterfeit item");

    const notes = await prisma.notification.findMany({ where: { userId: artisanUser.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("LISTING_HIDDEN");

    const hideAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "product.hide" } });
    expect(hideAudit).toMatchObject({ actorId: admin.id, targetType: "product", targetId: product.id, reason: "Counterfeit item" });

    await expect(hideProduct({ actorId: admin.id, productId: product.id, reason: "again" })).rejects.toThrow(AdminActionError);

    await restoreProduct({ actorId: admin.id, productId: product.id });
    const restored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.hiddenReason).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "product.restore", targetId: product.id } })).toBe(1);

    await expect(restoreProduct({ actorId: admin.id, productId: product.id })).rejects.toThrow("Only hidden products");
  });

  it("refuses self-ban and self role change without touching Better Auth or the audit log", async () => {
    const admin = await makeUser("admin");

    await expect(
      banUser({ actorId: admin.id, userId: admin.id, reason: "testing", hideProducts: false }, fakeAuth),
    ).rejects.toThrow("You can't ban yourself");
    await expect(setUserRole({ actorId: admin.id, userId: admin.id, role: "buyer" }, fakeAuth)).rejects.toThrow(
      "You can't change your own role",
    );

    expect(fakeAuth.banInAuth).not.toHaveBeenCalled();
    expect(fakeAuth.setRoleInAuth).not.toHaveBeenCalled();
    const me = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(me.banned).toBe(false);
    expect(me.role).toBe("admin");
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("bans an artisan, optionally hiding their active products, and unbans", async () => {
    const admin = await makeUser("admin");
    const { user, shop } = await makeArtisan();
    const p1 = await makeProduct(shop.id);
    await makeProduct(shop.id);
    await prisma.product.update({ where: { id: p1.id }, data: { status: "DRAFT" } });

    const { hiddenProducts } = await banUser(
      { actorId: admin.id, userId: user.id, reason: "Fraud", hideProducts: true },
      fakeAuth,
    );
    expect(hiddenProducts).toBe(1); // the DRAFT one is left alone
    expect(fakeAuth.banInAuth).toHaveBeenCalledWith(user.id, "Fraud");
    expect(await prisma.product.count({ where: { artisanId: shop.id, status: "HIDDEN" } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.ban" } });
    expect(audit.meta).toMatchObject({ hideProducts: true, hiddenProducts: 1 });

    await expect(
      banUser({ actorId: admin.id, userId: user.id, reason: "Fraud", hideProducts: false }, fakeAuth),
    ).rejects.toThrow("already banned");

    await unbanUser({ actorId: admin.id, userId: user.id }, fakeAuth);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).banned).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "user.unban" } })).toBe(1);
  });

  it("changes another user's role and records from/to", async () => {
    const admin = await makeUser("admin");
    const buyer = await makeUser("buyer");
    await setUserRole({ actorId: admin.id, userId: buyer.id, role: "admin" }, fakeAuth);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).role).toBe("admin");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.role" } });
    expect(audit.meta).toMatchObject({ from: "buyer", to: "admin" });
  });

  it("does not audit an auction cancel that the auction service rejects", async () => {
    const admin = await makeUser("admin");
    const { shop } = await makeArtisan();
    const product = await makeProduct(shop.id);
    const auction = await prisma.auction.create({
      data: {
        productId: product.id,
        artisanId: shop.id,
        status: "SCHEDULED",
        startPriceCents: 1000,
        startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 7_200_000),
        originalEndsAt: new Date(Date.now() + 7_200_000),
      },
    });
    // Until the auctions workstream lands, cancelAuction() is a stub that throws.
    await cancelAuctionAsAdmin({ actorId: admin.id, auctionId: auction.id, reason: "Policy" }).catch((e) => {
      expect(e).toBeInstanceOf(AdminActionError);
    });
    const audited = await prisma.auditLog.count({ where: { action: "auction.cancel" } });
    const status = (await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status;
    expect(audited).toBe(status === "CANCELLED" ? 1 : 0);
  });
});

describe("admin queries", () => {
  beforeEach(resetDb);

  const base = { page: 1, pageSize: 2, dir: "asc" as const };

  it("paginates and filters users by role, banned and search", async () => {
    await makeUser("admin");
    for (let i = 0; i < 3; i++) await makeUser("buyer");
    const banned = await makeUser("buyer", { banned: true });
    await makeArtisan();

    const buyers = await listUsers({ ...base, sort: "createdAt", role: "buyer" });
    expect(buyers.total).toBe(4);
    expect(buyers.rows).toHaveLength(2);
    expect(buyers.pageCount).toBe(2);
    const page2 = await listUsers({ ...base, page: 2, sort: "createdAt", role: "buyer" });
    expect(page2.rows).toHaveLength(2);
    expect(new Set([...buyers.rows, ...page2.rows].map((r) => r.id)).size).toBe(4);

    const bannedOnly = await listUsers({ ...base, sort: "createdAt", banned: true });
    expect(bannedOnly.rows.map((r) => r.id)).toEqual([banned.id]);
    const notBanned = await listUsers({ ...base, pageSize: 50, sort: "createdAt", banned: false });
    expect(notBanned.total).toBe(5);

    const search = await listUsers({ ...base, sort: "email", q: banned.email.toUpperCase() });
    expect(search.rows.map((r) => r.id)).toEqual([banned.id]);
  });

  it("sorts users by order count", async () => {
    const a = await makeUser("buyer");
    const b = await makeUser("buyer");
    await prisma.order.create({
      data: { buyerId: b.id, source: "CART", subtotalCents: 100, commissionCents: 10, totalCents: 100 },
    });
    const desc = await listUsers({ page: 1, pageSize: 10, sort: "orders", dir: "desc" });
    expect(desc.rows[0].id).toBe(b.id);
    expect(desc.rows[0]._count.orders).toBe(1);
    expect(desc.rows.at(-1)?.id).toBe(a.id);
  });

  it("filters products by status and paginates with skip/take", async () => {
    const admin = await makeUser("admin");
    const { shop } = await makeArtisan();
    const products = [];
    for (let i = 0; i < 5; i++) products.push(await makeProduct(shop.id, { priceCents: 1000 + i * 100 }));
    await hideProduct({ actorId: admin.id, productId: products[0].id, reason: "Spam listing" });

    const hidden = await listProducts({ ...base, sort: "createdAt", status: "HIDDEN" });
    expect(hidden.total).toBe(1);
    expect(hidden.rows[0]).toMatchObject({ id: products[0].id, hiddenReason: "Spam listing" });

    const active = await listProducts({ ...base, sort: "priceCents", dir: "desc", status: "ACTIVE" });
    expect(active.total).toBe(4);
    expect(active.pageCount).toBe(2);
    expect(active.rows.map((r) => r.priceCents)).toEqual([1400, 1300]);
    const last = await listProducts({ ...base, page: 2, sort: "priceCents", dir: "desc", status: "ACTIVE" });
    expect(last.rows.map((r) => r.priceCents)).toEqual([1200, 1100]);

    const audit = await listAuditLogs({ page: 1, pageSize: 10, sort: "createdAt", dir: "desc", targetType: "product" });
    expect(audit.total).toBe(1);
    expect(audit.rows[0].actor.id).toBe(admin.id);
  });

  it("filters orders by status/source and buckets revenue by day", async () => {
    const buyer = await makeUser("buyer");
    const now = Date.now();
    const mk = (status: "PAID" | "PENDING" | "DELIVERED", source: "CART" | "AUCTION", daysAgo: number, total: number) =>
      prisma.order.create({
        data: {
          buyerId: buyer.id,
          source,
          status,
          subtotalCents: total,
          commissionCents: total / 10,
          totalCents: total,
          paidAt: status === "PENDING" ? null : new Date(now - daysAgo * 86_400_000),
        },
      });
    await mk("PAID", "CART", 0, 5000);
    await mk("DELIVERED", "AUCTION", 0, 3000);
    await mk("PENDING", "CART", 0, 9900);
    await mk("PAID", "CART", 45, 7000); // outside the 30-day window

    const paid = await listOrders({ page: 1, pageSize: 10, sort: "createdAt", dir: "desc", status: "PAID" });
    expect(paid.total).toBe(2);
    const auction = await listOrders({ page: 1, pageSize: 10, sort: "createdAt", dir: "desc", source: "AUCTION" });
    expect(auction.rows.map((r) => r.totalCents)).toEqual([3000]);

    const series = await getDailyRevenue(30);
    expect(series).toHaveLength(30);
    const today = series.at(-1)!;
    expect(today).toMatchObject({ gross: 8000, commission: 800 });
    expect(series.reduce((s, p) => s + p.gross, 0)).toBe(8000);
  });
});
