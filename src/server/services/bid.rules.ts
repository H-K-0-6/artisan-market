// Pure bidding rules, shared by bid.service (inside the locked transaction) and
// the unit tests. No I/O here: callers pass in the database clock as `now`.

export const ANTI_SNIPE_MS = 2 * 60 * 1000;

export type BidErrorCode =
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_AUCTION"
  | "NOT_ALLOWED"
  | "ALREADY_HIGH_BIDDER"
  | "TOO_LOW"
  | "INVALID_AMOUNT"
  | "RATE_LIMITED";

export class BidError extends Error {
  constructor(
    public code: BidErrorCode,
    message: string,
    /** For TOO_LOW: the smallest amount that would be accepted. */
    public minCents?: number,
  ) {
    super(message);
    this.name = "BidError";
  }
}

export type AuctionForBid = {
  status: string;
  endsAt: Date;
  artisanUserId: string;
  startPriceCents: number;
  minIncrementCents: number;
  reservePriceCents: number | null;
  currentPriceCents: number | null;
  highBidderId: string | null;
  bidCount: number;
};

export type BidderForBid = {
  id: string;
  role: string;
  banned: boolean | null;
  banExpires: Date | null;
};

export type AcceptedBid = {
  amountCents: number;
  endsAt: Date;
  extended: boolean;
  reserveMet: boolean;
  minNextBidCents: number;
};

/** The smallest bid the auction will accept next. */
export function minNextBid(a: Pick<AuctionForBid, "currentPriceCents" | "bidCount" | "startPriceCents" | "minIncrementCents">) {
  return a.currentPriceCents != null && a.bidCount > 0 ? a.currentPriceCents + a.minIncrementCents : a.startPriceCents;
}

export function isReserveMet(priceCents: number | null, reservePriceCents: number | null) {
  if (priceCents == null) return false;
  return reservePriceCents == null || priceCents >= reservePriceCents;
}

export function isBanned(user: Pick<BidderForBid, "banned" | "banExpires">, now: Date) {
  if (!user.banned) return false;
  return user.banExpires == null || user.banExpires.getTime() > now.getTime();
}

/**
 * Validates a bid against the locked auction row and returns the new auction
 * state, or throws a BidError. Anti-sniping: a bid with less than 2 minutes left
 * pushes endsAt to now + 2 minutes.
 */
export function evaluateBid(auction: AuctionForBid, bidder: BidderForBid, amountCents: number, now: Date): AcceptedBid {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BidError("INVALID_AMOUNT", "Enter a valid amount");
  }
  if (auction.status !== "LIVE" || now.getTime() >= auction.endsAt.getTime()) {
    throw new BidError("CLOSED", "This auction is not accepting bids");
  }
  if (bidder.id === auction.artisanUserId) {
    throw new BidError("OWN_AUCTION", "You can't bid on your own auction");
  }
  if (bidder.role !== "buyer" || isBanned(bidder, now)) {
    throw new BidError("NOT_ALLOWED", "Your account can't place bids");
  }
  if (auction.highBidderId === bidder.id) {
    throw new BidError("ALREADY_HIGH_BIDDER", "You're already the highest bidder");
  }
  const min = minNextBid(auction);
  if (amountCents < min) {
    throw new BidError("TOO_LOW", "Your bid is below the minimum", min);
  }

  const remaining = auction.endsAt.getTime() - now.getTime();
  const extended = remaining < ANTI_SNIPE_MS;
  const endsAt = extended ? new Date(now.getTime() + ANTI_SNIPE_MS) : auction.endsAt;

  return {
    amountCents,
    endsAt,
    extended,
    reserveMet: isReserveMet(amountCents, auction.reservePriceCents),
    minNextBidCents: amountCents + auction.minIncrementCents,
  };
}

/** "Bea Bidder" -> "B***r". Never reveals more than the first and last letter. */
export function maskName(name: string | null | undefined) {
  const s = (name ?? "").trim();
  if (s.length === 0) return "B***r";
  if (s.length === 1) return `${s}***`;
  return `${s[0]}***${s[s.length - 1]}`;
}

/** Sliding-window limiter: at most `limit` hits per `windowMs` per key. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function take(key: string, nowMs = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((t) => nowMs - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
