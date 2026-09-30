import { describe, expect, it } from "vitest";
import { auctionSchema, validateAuctionTimes } from "@/lib/validators/auction";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const MIN = 60_000;

describe("validateAuctionTimes", () => {
  it("accepts a future start and a run longer than 5 minutes", () => {
    expect(validateAuctionTimes(new Date(NOW + MIN), new Date(NOW + 7 * MIN), NOW)).toEqual({});
  });
  it("rejects a start in the past", () => {
    expect(validateAuctionTimes(new Date(NOW - 10 * MIN), new Date(NOW + 10 * MIN), NOW).startsAt).toBeTruthy();
  });
  it("requires endsAt > startsAt + 5 minutes", () => {
    expect(validateAuctionTimes(new Date(NOW + MIN), new Date(NOW + 6 * MIN), NOW).endsAt).toBeTruthy();
    expect(validateAuctionTimes(new Date(NOW + MIN), new Date(NOW + 6 * MIN + 1), NOW).endsAt).toBeUndefined();
  });
});

describe("auctionSchema", () => {
  const base = {
    productId: "p1",
    newProduct: null,
    startPriceCents: 1000,
    minIncrementCents: 100,
    reservePriceCents: null,
    startsAt: new Date(NOW).toISOString(),
    endsAt: new Date(NOW + 10 * MIN).toISOString(),
  };
  it("accepts a valid auction", () => {
    expect(auctionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a reserve below the start price", () => {
    expect(auctionSchema.safeParse({ ...base, reservePriceCents: 500 }).success).toBe(false);
  });
  it("requires a product or a new item", () => {
    expect(auctionSchema.safeParse({ ...base, productId: null }).success).toBe(false);
  });
});
