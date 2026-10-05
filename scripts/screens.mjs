// Captures screenshots of key pages for design review.
// Usage: node scripts/screens.mjs <outDir> [baseUrl]   (app must be running)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "dotenv/config";

const outDir = process.argv[2] ?? "screens";
const BASE = process.argv[3] ?? "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (sql) => (await db.query(sql)).rows[0];
const product = await one(`SELECT slug FROM "Product" WHERE status='ACTIVE' AND "priceCents" > 0 ORDER BY "createdAt" LIMIT 1`);
const shop = await one(`SELECT slug FROM "ArtisanProfile" ORDER BY "createdAt" LIMIT 1`);
const auction =
  (await one(`SELECT id FROM "Auction" WHERE status='LIVE' ORDER BY "endsAt" LIMIT 1`)) ??
  (await one(`SELECT id FROM "Auction" ORDER BY "createdAt" DESC LIMIT 1`));
await db.end();

const pages = {
  anon: [
    ["home", "/"],
    ["products", "/products"],
    ["product", `/products/${product.slug}`],
    ["shop", `/shops/${shop.slug}`],
    ["auctions", "/auctions"],
    ["auction-room", `/auctions/${auction.id}`],
    ["sign-in", "/sign-in"],
    ["not-found", "/products/nope-nope"],
  ],
  "buyer@demo.test": [
    ["cart", "/cart"],
    ["account-orders", "/account/orders"],
    ["account-auctions", "/account/auctions"],
    ["auction-room-buyer", `/auctions/${auction.id}`],
  ],
  "artisan@demo.test": [
    ["dashboard", "/dashboard"],
    ["dashboard-products", "/dashboard/products"],
    ["dashboard-auctions", "/dashboard/auctions"],
  ],
  "admin@demo.test": [
    ["admin", "/admin"],
    ["admin-users", "/admin/users"],
  ],
};

// ONLY=home,auction-room limits the run to those screenshot names.
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const browser = await chromium.launch();
const widths = process.env.MOBILE ? [["mobile", 390]] : [["desktop", 1440]];
for (const [label, width] of widths) {
  for (const [who, all] of Object.entries(pages)) {
    const list = all.filter(([name]) => !only || only.has(name));
    if (!list.length) continue;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    if (who !== "anon") {
      await page.goto(`${BASE}/sign-in`);
      await page.getByLabel("Email").fill(who);
      await page.getByLabel("Password").fill("Password123!");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20_000 });
    }
    for (const [name, url] of list) {
      await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(600);
      const file = path.join(outDir, `${label}-${name}.png`);
      await page.screenshot({ path: file, fullPage: !process.env.VIEWPORT });
      console.log("saved", file);
    }
    await context.close();
  }
}
await browser.close();
