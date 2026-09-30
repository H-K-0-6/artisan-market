import { sweep } from "@/server/services/auction-lifecycle";

/** auction.sweep (every 30s): starts, closes and expires anything a job missed. */
export async function handleSweep() {
  const r = await sweep();
  if (r.started || r.closed || r.expired) console.log(`[sweep] started ${r.started}, closed ${r.closed}, expired ${r.expired}`);
}
