import type { Job } from "pg-boss";
import { scheduleAuctionStart, type AuctionJob } from "@/lib/boss";
import { startAuction } from "@/server/services/auction-lifecycle";

/** auction.start: SCHEDULED -> LIVE at startsAt, then emits `auction:started`. */
export async function handleAuctionStart(jobs: Job<AuctionJob>[]) {
  for (const job of jobs) {
    const result = await startAuction(job.data.auctionId);
    if (result.kind === "reschedule") await scheduleAuctionStart(job.data.auctionId, result.at);
  }
}
