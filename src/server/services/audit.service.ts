import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

/** Records an admin action. Call inside the same transaction as the action when possible. */
export function recordAudit(
  entry: {
    actorId: string;
    action: string;
    targetType: "user" | "product" | "auction" | "order";
    targetId: string;
    reason?: string;
    meta?: Prisma.InputJsonValue;
  },
  db: Client = prisma,
) {
  return db.auditLog.create({ data: entry });
}
