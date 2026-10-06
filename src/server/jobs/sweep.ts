import { sweep } from "@/server/services/auction-lifecycle";
import { overdueCartOrders, releaseIfUnpaid } from "@/server/services/payments";

/**
 * auction.sweep (every 30s): starts, closes and expires anything a job missed,
 * and releases cart orders whose payment hold ran out without a release job.
 */
export async function handleSweep() {
  const r = await sweep();
  let released = 0;
  for (const { id } of await overdueCartOrders()) {
    try {
      if ((await releaseIfUnpaid(id)).kind === "released") released++;
    } catch (err) {
      console.error(`[sweep] release ${id} failed`, err);
    }
  }
  if (r.started || r.closed || r.expired || released) {
    console.log(`[sweep] started ${r.started}, closed ${r.closed}, expired ${r.expired}, released ${released}`);
  }
}
