import { PgBoss } from "pg-boss";
import { getBoss, QUEUES, setBoss } from "@/lib/boss";
import { handleAuctionStart } from "@/server/jobs/auction-start";
import { handleAuctionEnd } from "@/server/jobs/auction-end";
import { handleOrderExpire } from "@/server/jobs/order-expire";
import { handleSweep } from "@/server/jobs/sweep";

const SWEEP_SECONDS = 30;
const globalForSweep = globalThis as unknown as { sweepTimer?: NodeJS.Timeout };

/**
 * Starts pg-boss (own `pgboss` schema in the app database), creates the queues,
 * and registers the workers. Called once from server.ts.
 */
export async function startJobs() {
  if (getBoss()) return getBoss()!;

  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (err) => console.error("[boss]", err));
  await boss.start();

  // Lifecycle jobs are idempotent, so retries are safe.
  const lifecycle = { retryLimit: 5, retryDelay: 2, retryBackoff: true, expireInSeconds: 60 };
  await boss.createQueue(QUEUES.auctionStart, lifecycle);
  await boss.createQueue(QUEUES.auctionEnd, lifecycle);
  await boss.createQueue(QUEUES.orderExpire, lifecycle);
  await boss.createQueue(QUEUES.sweep, { retryLimit: 0, expireInSeconds: 60 });

  // Poll every 0.5s so auctions start and close promptly after their time.
  const fast = { pollingIntervalSeconds: 0.5, batchSize: 10 };
  await boss.work(QUEUES.auctionStart, fast, handleAuctionStart);
  await boss.work(QUEUES.auctionEnd, fast, handleAuctionEnd);
  await boss.work(QUEUES.orderExpire, { pollingIntervalSeconds: 5, batchSize: 10 }, handleOrderExpire);
  await boss.work(QUEUES.sweep, { pollingIntervalSeconds: 1 }, handleSweep);

  setBoss(boss);

  // Throttled send: at most one sweep job per window, even with several nodes.
  const tick = () =>
    boss.sendThrottled(QUEUES.sweep, {}, null, SWEEP_SECONDS - 5).catch((e) => console.error("[boss] sweep", e));
  void tick();
  clearInterval(globalForSweep.sweepTimer);
  globalForSweep.sweepTimer = setInterval(tick, SWEEP_SECONDS * 1000);

  console.log("> pg-boss started (auction.start, auction.end, order.expire, auction.sweep)");
  return boss;
}

export async function stopJobs() {
  clearInterval(globalForSweep.sweepTimer);
  const boss = getBoss();
  setBoss(undefined);
  await boss?.stop({ graceful: true, timeout: 5000 });
}
