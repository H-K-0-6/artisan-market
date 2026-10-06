-- Switch payments from Stripe (USD) to Tap Payments (BHD).

-- 1. Provider-neutral payment fields on orders.
ALTER TABLE "Order" RENAME COLUMN "stripeCheckoutSessionId" TO "paymentChargeId";
ALTER TABLE "Order" RENAME COLUMN "stripePaymentIntentId" TO "paidChargeId";
ALTER INDEX "Order_stripeCheckoutSessionId_key" RENAME TO "Order_paymentChargeId_key";
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentHoldUntil" TIMESTAMP(3);

-- 2. Idempotency table is no longer Stripe-specific.
ALTER TABLE "ProcessedStripeEvent" RENAME TO "ProcessedPaymentEvent";
ALTER TABLE "ProcessedPaymentEvent" RENAME CONSTRAINT "ProcessedStripeEvent_pkey" TO "ProcessedPaymentEvent_pkey";

-- 3. Money: USD cents -> BHD fils (1 BHD = 1000 fils) at ~0.377 BHD per USD,
--    rounded to whole 100 fils (0.100 BD) so prices stay tidy. The same function is
--    applied to every column, so equal amounts stay equal (e.g. current price = top bid).
CREATE FUNCTION pg_temp.usd_cents_to_fils(c INTEGER) RETURNS INTEGER AS $$
  SELECT CASE WHEN c IS NULL THEN NULL ELSE GREATEST(100, (ROUND(c * 0.377 / 10.0) * 100)::INTEGER) END
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "Product" SET "priceCents" = CASE WHEN "priceCents" <= 0 THEN 0 ELSE pg_temp.usd_cents_to_fils("priceCents") END;
UPDATE "Auction" SET
  "startPriceCents"   = pg_temp.usd_cents_to_fils("startPriceCents"),
  "minIncrementCents" = pg_temp.usd_cents_to_fils("minIncrementCents"),
  "reservePriceCents" = pg_temp.usd_cents_to_fils("reservePriceCents"),
  "currentPriceCents" = pg_temp.usd_cents_to_fils("currentPriceCents");
UPDATE "Bid" SET "amountCents" = pg_temp.usd_cents_to_fils("amountCents");
UPDATE "OrderItem" SET "unitPriceCents" = pg_temp.usd_cents_to_fils("unitPriceCents");
-- Order totals are recomputed from their lines so they stay consistent.
UPDATE "Order" o SET
  "subtotalCents" = t.total,
  "totalCents" = t.total,
  "commissionCents" = t.commission
FROM (
  SELECT i."orderId",
    SUM(i."unitPriceCents" * i.qty)::INTEGER AS total,
    SUM(ROUND(i."unitPriceCents" * i.qty * a."commissionBps" / 10000.0))::INTEGER AS commission
  FROM "OrderItem" i JOIN "ArtisanProfile" a ON a.id = i."artisanId"
  GROUP BY i."orderId"
) t
WHERE t."orderId" = o.id;

ALTER TABLE "Auction" ALTER COLUMN "minIncrementCents" SET DEFAULT 500;
