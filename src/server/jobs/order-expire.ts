import type { Job } from "pg-boss";
import { scheduleOrderExpire, type OrderJob } from "@/lib/boss";
import { expireAuctionOrder } from "@/server/services/auction-lifecycle";

/** order.expire: at payDeadline an unpaid auction order becomes EXPIRED and the auction UNSOLD. */
export async function handleOrderExpire(jobs: Job<OrderJob>[]) {
  for (const job of jobs) {
    const result = await expireAuctionOrder(job.data.orderId);
    if (result.kind === "reschedule") await scheduleOrderExpire(job.data.orderId, result.at);
  }
}
