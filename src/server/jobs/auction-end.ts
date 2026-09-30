import type { Job } from "pg-boss";
import { scheduleAuctionEnd, type AuctionJob } from "@/lib/boss";
import { closeAuction } from "@/server/services/auction-lifecycle";

/**
 * auction.end: closes a LIVE auction once the database clock passes endsAt. If a
 * late bid moved endsAt (anti-sniping), the job re-queues itself for the new time.
 */
export async function handleAuctionEnd(jobs: Job<AuctionJob>[]) {
  for (const job of jobs) {
    const result = await closeAuction(job.data.auctionId);
    if (result.kind === "reschedule") await scheduleAuctionEnd(job.data.auctionId, result.at);
  }
}
