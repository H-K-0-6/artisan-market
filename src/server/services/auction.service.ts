import "server-only";

// Owned by the auctions workstream (Phases 4–5). The admin dashboard calls
// cancelAuction(); its signature is fixed here so both can be built in parallel.

export type CancelAuctionInput = {
  auctionId: string;
  /** Admin or owning artisan performing the cancel. */
  actorId: string;
  reason: string;
};

/**
 * Cancels a DRAFT/SCHEDULED/LIVE auction (or an ENDED one whose order is unpaid):
 * sets status CANCELLED, expires/cancels any PENDING winner order, notifies bidders,
 * and emits `auction:ended` with result CANCELLED. Throws if not cancellable.
 */
export async function cancelAuction(input: CancelAuctionInput): Promise<void> {
  void input;
  throw new Error("cancelAuction is not implemented yet");
}
