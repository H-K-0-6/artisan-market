import "server-only";
import { prisma } from "@/lib/db";

/** Plain, serializable shape handed to client components. */
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type Row = { id: string; type: string; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date };

export const toItem = (n: Row): NotificationItem => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/** Latest notifications plus the unread count, for the header bell. */
export async function getNotificationSummary(userId: string, take = 10) {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map(toItem), unread };
}

export async function listNotifications(userId: string, page: number, pageSize = 20) {
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map(toItem), total, unread, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Total quantity in the user's cart (read-only; the cart itself belongs to the shop workstream). */
export async function getCartCount(userId: string) {
  const agg = await prisma.cartItem.aggregate({ where: { cart: { userId } }, _sum: { qty: true } });
  return agg._sum.qty ?? 0;
}
