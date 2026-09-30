import type { PgBoss } from "pg-boss";

// pg-boss runs inside the custom server (server.ts -> src/server/jobs/register.ts).
// Next route handlers and server actions live in a different module graph, so the
// running instance is shared through globalThis, like io and prisma. This file only
// imports pg-boss types, so the Next bundle never pulls pg-boss in.

export const QUEUES = {
  auctionStart: "auction.start",
  auctionEnd: "auction.end",
  orderExpire: "order.expire",
  sweep: "auction.sweep",
} as const;

export type AuctionJob = { auctionId: string };
export type OrderJob = { orderId: string };

const globalForBoss = globalThis as unknown as { boss?: PgBoss };

export function setBoss(boss: PgBoss | undefined) {
  globalForBoss.boss = boss;
}

export function getBoss(): PgBoss | null {
  return globalForBoss.boss ?? null;
}

/**
 * Queues a job to run at `at`. Missing boss (tests, scripts) or a failed send is
 * logged, not thrown: the 30s sweep job is the safety net for every lifecycle step.
 */
export async function enqueueAt(queue: string, data: object, at: Date) {
  const boss = getBoss();
  if (!boss) return null;
  try {
    return await boss.send(queue, data, { startAfter: at });
  } catch (err) {
    console.error(`[boss] failed to queue ${queue}`, err);
    return null;
  }
}

export const scheduleAuctionStart = (auctionId: string, at: Date) =>
  enqueueAt(QUEUES.auctionStart, { auctionId } satisfies AuctionJob, at);
export const scheduleAuctionEnd = (auctionId: string, at: Date) =>
  enqueueAt(QUEUES.auctionEnd, { auctionId } satisfies AuctionJob, at);
export const scheduleOrderExpire = (orderId: string, at: Date) =>
  enqueueAt(QUEUES.orderExpire, { orderId } satisfies OrderJob, at);
