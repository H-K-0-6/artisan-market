"use server";

import { getSession } from "@/lib/rbac";
import { placeBid, toBidErrorResponse, type PlacedBid } from "@/server/services/bid.service";

export type BidActionResult =
  | { ok: true; bid: PlacedBid }
  | { ok: false; code: string; message: string; minCents?: number };

/** Server-action entry point for bidding. Thin wrapper over bid.service.placeBid. */
export async function placeBidAction(auctionId: string, amountCents: number): Promise<BidActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to bid" };
  if (typeof auctionId !== "string" || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Enter a valid amount" };
  }
  try {
    return { ok: true, bid: await placeBid(session.user.id, auctionId, amountCents) };
  } catch (err) {
    return { ok: false, ...toBidErrorResponse(err) };
  }
}
