import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { signIn, withDb } from "./helpers";

test("buyer adds to cart, checks out on Stripe, and the webhook marks the order paid", async ({ page, request }) => {
  await signIn(page, "buyer@demo.test");

  await page.goto("/products/walnut-serving-board");
  const stockBefore = await withDb(async (db) =>
    (await db.query(`SELECT stock FROM "Product" WHERE slug = 'walnut-serving-board'`)).rows[0].stock as number,
  );
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("Walnut Serving Board")).toBeVisible();
  await page.getByRole("button", { name: "Checkout" }).click();

  // Real Stripe Checkout (test mode). Completing the hosted page is Stripe's job;
  // we only confirm the redirect and then deliver the webhook ourselves.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  const order = await withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT o.id, o."stripeCheckoutSessionId" AS sid, o.status FROM "Order" o JOIN "user" u ON u.id = o."buyerId"
       WHERE u.email = 'buyer@demo.test' ORDER BY o."createdAt" DESC LIMIT 1`,
    );
    return rows[0] as { id: string; sid: string; status: string };
  });
  expect(order.status).toBe("PENDING");
  expect(order.sid).toMatch(/^cs_test_/);
  // Stock is reserved as soon as the order exists.
  await withDb(async (db) => {
    const { rows } = await db.query(`SELECT stock FROM "Product" WHERE slug = 'walnut-serving-board'`);
    expect(rows[0].stock).toBe(stockBefore - 1);
  });

  // Deliver a correctly signed checkout.session.completed to our webhook.
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: order.sid,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: `pi_e2e_${Date.now()}`,
        metadata: { orderId: order.id },
        collected_information: {
          shipping_details: {
            name: "E2E Buyer",
            address: { line1: "1 Test St", line2: null, city: "Testville", state: "CA", postal_code: "90001", country: "US" },
          },
        },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  const res = await request.post("/api/webhooks/stripe", {
    headers: { "content-type": "application/json", "stripe-signature": signature },
    data: payload,
  });
  expect(res.status()).toBe(200);

  // A bad signature is rejected.
  const forged = await request.post("/api/webhooks/stripe", {
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    data: payload,
  });
  expect(forged.status()).toBe(400);

  await page.goto(`/account/orders/${order.id}`);
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Testville")).toBeVisible();
});
