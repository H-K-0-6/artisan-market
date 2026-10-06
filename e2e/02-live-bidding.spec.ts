import { expect, test } from "@playwright/test";
import { DB_NOW, signedInContext, withDb } from "./helpers";

test("two buyers bid live; each sees the other's bid and the outbid alert", async ({ browser }) => {
  // A LIVE auction with 10 minutes left (BD 100 start, BD 5 increment).
  const auctionId = await withDb(async (db) => {
    const { rows: [shop] } = await db.query(
      `SELECT s.id FROM "ArtisanProfile" s JOIN "user" u ON u.id = s."userId" WHERE u.email = 'artisan@demo.test'`,
    );
    const suffix = Date.now().toString(36);
    await db.query(
      `INSERT INTO "Product" (id, "artisanId", title, slug, description, "priceCents", stock, status, "updatedAt")
       VALUES ($1, $2, 'E2E Lidded Jar', $3, 'Auction lot', 0, 1, 'ACTIVE', ${DB_NOW})`,
      [`e2ep${suffix}`, shop.id, `e2e-lidded-jar-${suffix}`],
    );
    await db.query(
      `INSERT INTO "Auction" (id, "productId", "artisanId", status, "startPriceCents", "minIncrementCents",
         "startsAt", "endsAt", "originalEndsAt", "updatedAt")
       VALUES ($1, $2, $3, 'LIVE', 100000, 5000, ${DB_NOW} - interval '1 minute',
         ${DB_NOW} + interval '10 minutes', ${DB_NOW} + interval '10 minutes', ${DB_NOW})`,
      [`e2ea${suffix}`, `e2ep${suffix}`, shop.id],
    );
    return `e2ea${suffix}`;
  });

  const a = await signedInContext(browser, "buyer@demo.test");
  const b = await signedInContext(browser, "buyer2@demo.test");
  await a.page.goto(`/auctions/${auctionId}`);
  await b.page.goto(`/auctions/${auctionId}`);
  await expect(a.page.getByTestId("current-price")).toHaveText("BD 100.000");
  await expect(b.page.getByTestId("current-price")).toHaveText("BD 100.000");

  // Buyer A opens at the start price; B sees it live, without reloading.
  await a.page.getByRole("button", { name: "Bid BD 100.000" }).click();
  await expect(b.page.getByTestId("current-price")).toHaveText("BD 100.000");
  await expect(b.page.getByTestId("bid-count")).toContainText("1");

  // Buyer B outbids; A sees the new price and gets the outbid notification toast.
  await b.page.getByRole("button", { name: "Bid BD 105.000" }).click();
  await expect(a.page.getByTestId("current-price")).toHaveText("BD 105.000");
  await expect(a.page.getByText(/outbid/i).first()).toBeVisible();

  // A too-low typed bid is rejected inline.
  await a.page.getByLabel(/Your bid/).fill("101");
  await a.page.getByRole("button", { name: "Place bid" }).click();
  await expect(a.page.getByTestId("bid-error")).toBeVisible();

  // Server state agrees with what both screens show.
  await withDb(async (db) => {
    const { rows: [row] } = await db.query(
      `SELECT a."currentPriceCents", a."bidCount", u.email FROM "Auction" a JOIN "user" u ON u.id = a."highBidderId" WHERE a.id = $1`,
      [auctionId],
    );
    expect(row).toMatchObject({ currentPriceCents: 105000, bidCount: 2, email: "buyer2@demo.test" });
  });

  await a.context.close();
  await b.context.close();
});
