-- Orders left unpaid from the Stripe era still hold a Stripe Checkout Session id
-- (cs_...) in "paymentChargeId". Tap can't look those up, so clear them: the order
-- then simply has no payment in progress and is released normally.
UPDATE "Order" SET "paymentChargeId" = NULL
WHERE "paymentChargeId" IS NOT NULL AND "paymentChargeId" NOT LIKE 'chg\_%';
