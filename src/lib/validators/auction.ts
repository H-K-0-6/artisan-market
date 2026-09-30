import { z } from "zod";

export const MIN_AUCTION_MS = 5 * 60 * 1000;
export const MAX_AUCTION_MS = 14 * 24 * 60 * 60 * 1000;
/** Form round-trips take a moment; a start this far in the past counts as "now". */
export const START_GRACE_MS = 2 * 60 * 1000;

const imageSchema = z.object({ key: z.string().min(1).max(200), url: z.url() });

export const auctionSchema = z
  .object({
    productId: z.string().min(1).nullable(),
    newProduct: z
      .object({
        title: z.string().trim().min(3, "Title is too short").max(120),
        description: z.string().trim().min(10, "Add a few more words").max(5000),
        categoryId: z.string().nullable(),
        images: z.array(imageSchema).max(8, "Up to 8 photos"),
      })
      .nullable(),
    startPriceCents: z.number().int().min(100, "Minimum start price is $1.00").max(10_000_000),
    minIncrementCents: z.number().int().min(50, "Minimum increment is $0.50").max(1_000_000),
    reservePriceCents: z.number().int().max(10_000_000).nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .superRefine((v, ctx) => {
    if (!v.productId && !v.newProduct) {
      ctx.addIssue({ code: "custom", path: ["productId"], message: "Choose a product or describe a new item" });
    }
    if (v.reservePriceCents != null && v.reservePriceCents < v.startPriceCents) {
      ctx.addIssue({ code: "custom", path: ["reservePriceCents"], message: "Reserve must be at least the start price" });
    }
  });

export type AuctionInput = z.input<typeof auctionSchema>;

/** Returns field errors for the schedule, judged against `nowMs` (the server clock). */
export function validateAuctionTimes(startsAt: Date, endsAt: Date, nowMs: number) {
  const errors: { startsAt?: string; endsAt?: string } = {};
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Pick a start time";
  else if (startsAt.getTime() < nowMs - START_GRACE_MS) errors.startsAt = "Start time can't be in the past";
  if (Number.isNaN(endsAt.getTime())) errors.endsAt = "Pick an end time";
  else if (!errors.startsAt && endsAt.getTime() <= startsAt.getTime() + MIN_AUCTION_MS) {
    errors.endsAt = "Auctions must run for more than 5 minutes";
  } else if (!errors.startsAt && endsAt.getTime() - startsAt.getTime() > MAX_AUCTION_MS) {
    errors.endsAt = "Auctions can run for at most 14 days";
  }
  return errors;
}
