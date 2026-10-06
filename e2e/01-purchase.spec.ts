import { expect, test } from "@playwright/test";
import { payOnBenefitPage, signIn, withDb } from "./helpers";

// Pays for real against Tap's sandbox (BENEFIT test card), so it needs Tap test keys.
test.skip(!process.env.TAP_SECRET_KEY, "TAP_SECRET_KEY not set");

test("buyer checks out, pays with BENEFIT on Tap's sandbox, and the order is paid", async ({ page, request }) => {
  test.setTimeout(150_000);
  await signIn(page, "buyer@demo.test");

  const stockBefore = await withDb(async (db) =>
    (await db.query(`SELECT stock FROM "Product" WHERE slug = 'walnut-serving-board'`)).rows[0].stock as number,
  );
  await page.goto("/products/walnut-serving-board");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("Walnut Serving Board")).toBeVisible();
  await page.getByRole("button", { name: "Checkout" }).click();
  await page.waitForURL(/\/pay\//);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;

  // Stock is reserved as soon as the order exists.
  await withDb(async (db) => {
    const { rows } = await db.query(`SELECT stock FROM "Product" WHERE slug = 'walnut-serving-board'`);
    expect(rows[0].stock).toBe(stockBefore - 1);
  });

  // The address form is prefilled from an earlier order on a retry; on a fresh run
  // the payment methods stay locked until there's a delivery address.
  if (await page.getByLabel("Recipient name").isVisible()) {
    await expect(page.getByRole("button", { name: /^Pay BD/ })).toBeDisabled();
    await page.getByLabel("Recipient name").fill("E2E Buyer");
    await page.getByLabel("Mobile number").fill("3312 3456");
    await page.getByLabel("House / building").fill("1204");
    await page.getByLabel("Road").fill("4321");
    await page.getByLabel("Block").fill("343");
    await page.getByLabel("Area").fill("Juffair");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByText("Delivery address saved")).toBeVisible();
  }
  await page.getByRole("radio", { name: /BENEFIT debit card/ }).click();
  await page.getByRole("button", { name: /^Pay BD .* with BENEFIT$/ }).click();
  await page.waitForURL(/benefit-gateway|tap\.company/, { timeout: 30_000 });
  await payOnBenefitPage(page);

  // Tap sends the buyer back; the app asks Tap for the result before showing success.
  await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
  await expect(page.getByText("Thank you for your order!")).toBeVisible();

  const order = await withDb(async (db) =>
    (await db.query(`SELECT status, "paymentMethod", "paidChargeId" FROM "Order" WHERE id = $1`, [orderId])).rows[0],
  );
  expect(order).toMatchObject({ status: "PAID", paymentMethod: "BENEFIT" });
  expect(order.paidChargeId).toMatch(/^chg_/);

  // A webhook without a valid signature is rejected.
  const forged = await request.post("/api/webhooks/tap", {
    headers: { "content-type": "application/json", hashstring: "deadbeef" },
    data: { id: order.paidChargeId, object: "charge", status: "CAPTURED", amount: 25.5, currency: "BHD" },
  });
  expect(forged.status()).toBe(401);

  await page.goto(`/account/orders/${orderId}`);
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Juffair")).toBeVisible();
});
