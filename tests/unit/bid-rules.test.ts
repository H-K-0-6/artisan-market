import { describe, expect, it } from "vitest";
import {
  ANTI_SNIPE_MS,
  BidError,
  createRateLimiter,
  evaluateBid,
  isReserveMet,
  maskName,
  minNextBid,
  type AuctionForBid,
  type BidderForBid,
} from "@/server/services/bid.rules";

const NOW = new Date("2026-09-30T12:00:00Z");
const MIN = 60_000;

const auction = (over: Partial<AuctionForBid> = {}): AuctionForBid => ({
  status: "LIVE",
  endsAt: new Date(NOW.getTime() + 30 * MIN),
  artisanUserId: "artisan-1",
  startPriceCents: 10_000,
  minIncrementCents: 500,
  reservePriceCents: null,
  currentPriceCents: null,
  highBidderId: null,
  bidCount: 0,
  ...over,
});
const buyer = (over: Partial<BidderForBid> = {}): BidderForBid => ({
  id: "buyer-1",
  role: "buyer",
  banned: false,
  banExpires: null,
  ...over,
});

function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof BidError) return e.code;
    throw e;
  }
  return "OK";
}

describe("evaluateBid", () => {
  it("first bid must be at least the start price, and may equal it", () => {
    expect(code(() => evaluateBid(auction(), buyer(), 9_999, NOW))).toBe("TOO_LOW");
    const r = evaluateBid(auction(), buyer(), 10_000, NOW);
    expect(r.amountCents).toBe(10_000);
    expect(r.minNextBidCents).toBe(10_500);
  });

  it("later bids must be at least current price + min increment", () => {
    const a = auction({ currentPriceCents: 12_000, bidCount: 3, highBidderId: "someone" });
    let err: BidError | undefined;
    try {
      evaluateBid(a, buyer(), 12_499, NOW);
    } catch (e) {
      err = e as BidError;
    }
    expect(err?.code).toBe("TOO_LOW");
    expect(err?.minCents).toBe(12_500);
    expect(evaluateBid(a, buyer(), 12_500, NOW).amountCents).toBe(12_500);
  });

  it("rejects bids on your own auction", () => {
    expect(code(() => evaluateBid(auction(), buyer({ id: "artisan-1", role: "artisan" }), 10_000, NOW))).toBe("OWN_AUCTION");
  });

  it("rejects banned users, unless the ban has expired", () => {
    expect(code(() => evaluateBid(auction(), buyer({ banned: true }), 10_000, NOW))).toBe("NOT_ALLOWED");
    expect(
      code(() => evaluateBid(auction(), buyer({ banned: true, banExpires: new Date(NOW.getTime() + MIN) }), 10_000, NOW)),
    ).toBe("NOT_ALLOWED");
    expect(
      code(() => evaluateBid(auction(), buyer({ banned: true, banExpires: new Date(NOW.getTime() - MIN) }), 10_000, NOW)),
    ).toBe("OK");
  });

  it("rejects non-buyer roles", () => {
    expect(code(() => evaluateBid(auction(), buyer({ role: "artisan" }), 10_000, NOW))).toBe("NOT_ALLOWED");
    expect(code(() => evaluateBid(auction(), buyer({ role: "admin" }), 10_000, NOW))).toBe("NOT_ALLOWED");
  });

  it("rejects ended or not-live auctions", () => {
    expect(code(() => evaluateBid(auction({ endsAt: NOW }), buyer(), 10_000, NOW))).toBe("CLOSED");
    expect(code(() => evaluateBid(auction({ endsAt: new Date(NOW.getTime() - 1) }), buyer(), 10_000, NOW))).toBe("CLOSED");
    for (const status of ["SCHEDULED", "ENDED", "UNSOLD", "CANCELLED", "PAID", "DRAFT"]) {
      expect(code(() => evaluateBid(auction({ status }), buyer(), 10_000, NOW))).toBe("CLOSED");
    }
  });

  it("rejects the current high bidder raising against themselves", () => {
    const a = auction({ currentPriceCents: 10_000, bidCount: 1, highBidderId: "buyer-1" });
    expect(code(() => evaluateBid(a, buyer(), 20_000, NOW))).toBe("ALREADY_HIGH_BIDDER");
  });

  it("rejects non-integer or non-positive amounts", () => {
    expect(code(() => evaluateBid(auction(), buyer(), 10_000.5, NOW))).toBe("INVALID_AMOUNT");
    expect(code(() => evaluateBid(auction(), buyer(), 0, NOW))).toBe("INVALID_AMOUNT");
  });

  it("anti-sniping: a bid with under 2 minutes left extends endsAt to now + 2 minutes", () => {
    const endsAt = new Date(NOW.getTime() + 30_000);
    const r = evaluateBid(auction({ endsAt }), buyer(), 10_000, NOW);
    expect(r.extended).toBe(true);
    expect(r.endsAt.getTime()).toBe(NOW.getTime() + ANTI_SNIPE_MS);
  });

  it("anti-sniping: a bid with 2 minutes or more left does not extend", () => {
    const endsAt = new Date(NOW.getTime() + ANTI_SNIPE_MS);
    const r = evaluateBid(auction({ endsAt }), buyer(), 10_000, NOW);
    expect(r.extended).toBe(false);
    expect(r.endsAt).toBe(endsAt);
  });

  it("sets reserveMet from the new price", () => {
    const a = auction({ reservePriceCents: 15_000 });
    expect(evaluateBid(a, buyer(), 14_999, NOW).reserveMet).toBe(false);
    expect(evaluateBid(a, buyer(), 15_000, NOW).reserveMet).toBe(true);
    expect(evaluateBid(auction(), buyer(), 10_000, NOW).reserveMet).toBe(true);
  });
});

describe("helpers", () => {
  it("minNextBid", () => {
    expect(minNextBid({ currentPriceCents: null, bidCount: 0, startPriceCents: 500, minIncrementCents: 100 })).toBe(500);
    expect(minNextBid({ currentPriceCents: 800, bidCount: 2, startPriceCents: 500, minIncrementCents: 100 })).toBe(900);
  });

  it("isReserveMet", () => {
    expect(isReserveMet(null, null)).toBe(false);
    expect(isReserveMet(100, null)).toBe(true);
    expect(isReserveMet(100, 200)).toBe(false);
  });

  it("maskName shows only the first and last letter", () => {
    expect(maskName("Bea Bidder")).toBe("B***r");
    expect(maskName("Ben Buyer")).toBe("B***r");
    expect(maskName("")).toBe("B***r");
  });

  it("rate limiter allows 5 per second per key", () => {
    const take = createRateLimiter(5, 1000);
    for (let i = 0; i < 5; i++) expect(take("u", 1000 + i)).toBe(true);
    expect(take("u", 1100)).toBe(false);
    expect(take("other", 1100)).toBe(true);
    expect(take("u", 2001)).toBe(true);
  });
});
