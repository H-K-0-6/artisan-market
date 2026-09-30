import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuctionStatus, OrderSource, OrderStatus, ProductStatus } from "@/generated/prisma/enums";
import type { Role } from "@/lib/permissions";
import { paged, type TableState } from "@/lib/table-params";

// Read side of the admin dashboard. Admins see everything, so nothing here is
// scoped to an owner; callers must have passed requireRolePage("admin").

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const });
const REVENUE_STATUSES: OrderStatus[] = ["PAID", "SHIPPED", "DELIVERED"];

// ---------- Users ----------

export const USER_SORTS = ["name", "email", "role", "createdAt", "orders"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export async function listUsers(
  input: TableState<UserSort> & { role?: Role; banned?: boolean; q?: string },
) {
  const where: Prisma.UserWhereInput = {
    ...(input.role && { role: input.role }),
    ...(input.banned === true && { banned: true }),
    ...(input.banned === false && { OR: [{ banned: false }, { banned: null }] }),
    ...(input.q && { AND: [{ OR: [{ name: insensitive(input.q) }, { email: insensitive(input.q) }, { id: input.q }] }] }),
  };
  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    input.sort === "orders" ? [{ orders: { _count: input.dir } }, { id: "asc" }] : [{ [input.sort]: input.dir }, { id: "asc" }];
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        artisan: { select: { shopName: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return paged(rows, total, input);
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      artisan: { include: { _count: { select: { products: true, auctions: true } } } },
      _count: { select: { orders: true, bids: true } },
    },
  });
  if (!user) return null;
  const [orders, bids, audit, sessions] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { items: true } } },
    }),
    prisma.bid.findMany({
      where: { bidderId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { auction: { select: { id: true, status: true, product: { select: { title: true } } } } },
    }),
    prisma.auditLog.findMany({
      where: { OR: [{ targetType: "user", targetId: id }, { actorId: id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actor: { select: { id: true, name: true } } },
    }),
    prisma.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
  ]);
  return { user, orders, bids, audit, activeSessions: sessions };
}

// ---------- Products ----------

export const PRODUCT_SORTS = ["title", "priceCents", "stock", "status", "createdAt", "updatedAt"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export async function listProducts(
  input: TableState<ProductSort> & { status?: ProductStatus; q?: string; artisanId?: string },
) {
  const where: Prisma.ProductWhereInput = {
    ...(input.status && { status: input.status }),
    ...(input.artisanId && { artisanId: input.artisanId }),
    ...(input.q && {
      OR: [{ title: insensitive(input.q) }, { artisan: { shopName: insensitive(input.q) } }, { id: input.q }],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ [input.sort]: input.dir }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        priceCents: true,
        stock: true,
        status: true,
        hiddenReason: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        artisan: { select: { id: true, shopName: true, userId: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);
  return paged(rows, total, input);
}

// ---------- Auctions ----------

export const AUCTION_SORTS = ["startsAt", "endsAt", "currentPriceCents", "bidCount", "status", "createdAt"] as const;
export type AuctionSort = (typeof AUCTION_SORTS)[number];

export async function listAuctions(input: TableState<AuctionSort> & { status?: AuctionStatus; q?: string }) {
  const where: Prisma.AuctionWhereInput = {
    ...(input.status && { status: input.status }),
    ...(input.q && {
      OR: [{ product: { title: insensitive(input.q) } }, { artisan: { shopName: insensitive(input.q) } }, { id: input.q }],
    }),
  };
  const orderBy: Prisma.AuctionOrderByWithRelationInput[] =
    input.sort === "currentPriceCents"
      ? [{ currentPriceCents: { sort: input.dir, nulls: "last" } }, { id: "asc" }]
      : [{ [input.sort]: input.dir }, { id: "asc" }];
  const [rows, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        startPriceCents: true,
        currentPriceCents: true,
        reservePriceCents: true,
        reserveMet: true,
        bidCount: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        product: { select: { title: true } },
        artisan: { select: { shopName: true } },
        highBidder: { select: { id: true, name: true } },
      },
    }),
    prisma.auction.count({ where }),
  ]);
  return paged(rows, total, input);
}

export function getAuctionDetail(id: string) {
  return prisma.auction.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, title: true, slug: true, status: true } },
      artisan: { select: { id: true, shopName: true, user: { select: { id: true, name: true, email: true } } } },
      highBidder: { select: { id: true, name: true, email: true } },
      winner: { select: { id: true, name: true, email: true } },
      order: { select: { id: true, status: true, totalCents: true, payDeadline: true, paidAt: true } },
      bids: {
        orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }],
        include: { bidder: { select: { id: true, name: true, email: true, banned: true } } },
      },
    },
  });
}

// ---------- Orders ----------

export const ORDER_SORTS = ["createdAt", "totalCents", "commissionCents", "status", "paidAt"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export async function listOrders(
  input: TableState<OrderSort> & { status?: OrderStatus; source?: OrderSource; q?: string },
) {
  const where: Prisma.OrderWhereInput = {
    ...(input.status && { status: input.status }),
    ...(input.source && { source: input.source }),
    ...(input.q && {
      OR: [{ id: input.q }, { buyer: { email: insensitive(input.q) } }, { buyer: { name: insensitive(input.q) } }],
    }),
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    input.sort === "paidAt"
      ? [{ paidAt: { sort: input.dir, nulls: "last" } }, { id: "asc" }]
      : [{ [input.sort]: input.dir }, { id: "asc" }];
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        source: true,
        totalCents: true,
        commissionCents: true,
        createdAt: true,
        paidAt: true,
        buyer: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return paged(rows, total, input);
}

export function getOrderDetail(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      auction: { select: { id: true, status: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { id: true, slug: true, status: true } },
          artisan: { select: { id: true, shopName: true, commissionBps: true, userId: true } },
        },
      },
    },
  });
}

// ---------- Audit log ----------

export const AUDIT_TARGETS = ["user", "product", "auction", "order"] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

export async function listAuditLogs(
  input: TableState<"createdAt"> & { action?: string; targetType?: AuditTarget; actorId?: string; targetId?: string },
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(input.action && { action: input.action }),
    ...(input.targetType && { targetType: input.targetType }),
    ...(input.actorId && { actorId: input.actorId }),
    ...(input.targetId && { targetId: input.targetId }),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: input.dir }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paged(rows, total, input);
}

export async function listAuditActions() {
  const rows = await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  return rows.map((r) => r.action);
}

// ---------- Overview ----------

export type RevenuePoint = { day: string; gross: number; commission: number };

/** Daily gross and commission (cents) for the last `days` days, UTC, zero-filled. */
export async function getDailyRevenue(days = 30): Promise<RevenuePoint[]> {
  const rows = await prisma.$queryRaw<{ day: string; gross: bigint; commission: bigint }[]>`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           COALESCE(SUM(o."totalCents"), 0)::bigint AS gross,
           COALESCE(SUM(o."commissionCents"), 0)::bigint AS commission
    FROM generate_series(
           (now() AT TIME ZONE 'UTC')::date - ${days - 1}::int,
           (now() AT TIME ZONE 'UTC')::date,
           interval '1 day'
         ) AS d(day)
    LEFT JOIN "Order" o
      ON o.status::text = ANY(${REVENUE_STATUSES})
     AND COALESCE(o."paidAt", o."createdAt") >= d.day
     AND COALESCE(o."paidAt", o."createdAt") < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day`;
  return rows.map((r) => ({ day: r.day, gross: Number(r.gross), commission: Number(r.commission) }));
}

export async function getAdminOverview() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [users, bannedUsers, artisans, activeProducts, hiddenProducts, liveAuctions, pendingOrders, allTime, last30, revenue, recent] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { banned: true } }),
      prisma.artisanProfile.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.product.count({ where: { status: "HIDDEN" } }),
      prisma.auction.count({ where: { status: "LIVE" } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES } },
        _sum: { totalCents: true, commissionCents: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES }, OR: [{ paidAt: { gte: since } }, { paidAt: null, createdAt: { gte: since } }] },
        _sum: { totalCents: true, commissionCents: true },
        _count: true,
      }),
      getDailyRevenue(30),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { actor: { select: { name: true } } },
      }),
    ]);
  return {
    users,
    bannedUsers,
    artisans,
    activeProducts,
    hiddenProducts,
    liveAuctions,
    pendingOrders,
    allTime: { gross: allTime._sum.totalCents ?? 0, commission: allTime._sum.commissionCents ?? 0, orders: allTime._count },
    last30: { gross: last30._sum.totalCents ?? 0, commission: last30._sum.commissionCents ?? 0, orders: last30._count },
    revenue,
    recent,
  };
}
