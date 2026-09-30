"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getNotificationSummary } from "@/server/queries/notifications";

/** Fresh bell contents for the signed-in user (called when the dropdown opens). */
export async function fetchMyNotifications() {
  const session = await requireRole();
  return getNotificationSummary(session.user.id);
}

export async function markNotificationRead(id: string) {
  const session = await requireRole();
  const notificationId = z.string().min(1).parse(id);
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/account/notifications");
  return { ok: true as const };
}

export async function markAllNotificationsRead() {
  const session = await requireRole();
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/account/notifications");
  return { ok: true as const };
}
