import type { Job } from "pg-boss";
import type { OrderJob } from "@/lib/boss";
import { releaseIfUnpaid, scheduleRelease } from "@/server/services/payments";

/** order.release: when a cart order's stock hold ends unpaid, give the stock back. */
export async function handleOrderRelease(jobs: Job<OrderJob>[]) {
  for (const job of jobs) {
    const result = await releaseIfUnpaid(job.data.orderId);
    if (result.kind === "reschedule") await scheduleRelease(job.data.orderId, result.at);
  }
}
