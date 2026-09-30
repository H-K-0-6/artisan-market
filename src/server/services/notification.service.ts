import { prisma } from "@/lib/db";
import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { emitToUser } from "@/server/realtime/emit";

type Client = Prisma.TransactionClient | typeof prisma;

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
};

/**
 * Stores a notification row. Pass a transaction client to write it atomically with
 * the change that caused it, then call `pushNotifications` after commit.
 */
export async function createNotification(input: NotifyInput, db: Client = prisma) {
  return db.notification.create({ data: { ...input, link: input.link ?? null } });
}

/** Sends already-committed notifications to their users' sockets. */
export function pushNotifications(
  rows: { id: string; userId: string; type: string; title: string; body: string; link: string | null; createdAt: Date }[],
) {
  for (const n of rows) {
    emitToUser(n.userId, "notification", {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
    });
  }
}

/** Convenience for the non-transactional case: store, then push. */
export async function notify(input: NotifyInput) {
  const row = await createNotification(input);
  pushNotifications([row]);
  return row;
}
