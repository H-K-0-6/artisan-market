// Walks the real checkout against Tap's sandbox: cart -> /pay -> address -> BENEFIT
// (or CARD) -> Tap's payment page. Saves screenshots and dumps what Tap's page shows.
// Usage: node scripts/smoke/tap-checkout.mjs <outDir> [BENEFIT|CARD|BENEFITPAY]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "tap-smoke";
const method = (process.argv[3] ?? "BENEFIT").toUpperCase();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

await page.goto(`${BASE}/sign-in`);
await page.getByLabel("Email").fill("buyer@demo.test");
await page.getByLabel("Password").fill("Password123!");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));

await page.goto(`${BASE}/products/carved-cherry-spoon`);
await page.getByRole("button", { name: "Add to cart" }).click();
await page.getByText("Added to cart").waitFor();
await page.goto(`${BASE}/cart`);
await page.getByRole("button", { name: "Checkout" }).click();
await page.waitForURL(/\/pay\//);
await shot(page, "1-pay-page");

if (await page.getByLabel("Recipient name").isVisible().catch(() => false)) {
  await page.getByLabel("Recipient name").fill("Ben Buyer");
  await page.getByLabel("Mobile number").fill("3312 3456");
  await page.getByLabel("House / building").fill("1204");
  await page.getByLabel("Road").fill("4321");
  await page.getByLabel("Block").fill("343");
  await page.getByLabel("Area").fill("Juffair");
  await page.getByRole("button", { name: "Save address" }).click();
  await page.getByText("Delivery address saved").waitFor();
}
await shot(page, "2-address-saved");

const label = { BENEFIT: "BENEFIT debit card", CARD: "Credit or debit card", BENEFITPAY: "BenefitPay" }[method];
await page.getByRole("radio", { name: new RegExp(label) }).click();
if (method === "BENEFITPAY") {
  await page.waitForTimeout(8000);
  await shot(page, "3-benefitpay");
} else {
  await page.getByRole("button", { name: /^Pay BD/ }).click();
  await page.waitForURL((u) => !u.href.startsWith(BASE), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "3-tap-page");
  const text = (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n").slice(0, 2500);
  const inputs = await page.$$eval("input, button, select, a", (els) =>
    els.slice(0, 40).map((e) => `${e.tagName.toLowerCase()} type=${e.getAttribute("type") ?? ""} name=${e.getAttribute("name") ?? ""} id=${e.id} text=${(e.innerText || e.value || "").trim().slice(0, 40)}`),
  );
  writeFileSync(path.join(out, "tap-page.txt"), `URL: ${page.url()}\n\n${text}\n\nCONTROLS:\n${inputs.join("\n")}\n\nFRAMES: ${page.frames().map((f) => f.url()).join("\n")}`);
}
// COMPLETE=1 finishes a BENEFIT payment with Tap's sandbox card (CARD_NUMBER overrides it,
// e.g. 1111110123456789 to get a decline) and follows the redirect back to the app.
if (process.env.COMPLETE && method === "BENEFIT") {
  const cardNumber = process.env.CARD_NUMBER ?? "4600410123456789";
  // The BENEFIT page checks the card number when you leave the field, then shows an
  // on-screen PIN keypad (#cardPin with #cardPinbtn0-9, digits possibly shuffled).
  const cardInput = page.locator("#debitCardNumber");
  await cardInput.click();
  await cardInput.pressSequentially(cardNumber, { delay: 40 });
  await page.keyboard.press("Tab");
  await page.locator("#debitMonthSelect").selectOption("12");
  await page.locator("#debitYearSelect").selectOption("2027");
  await page.locator("#debitCardholderName").fill("Ben Buyer");
  await page.locator("#cardPin").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (await page.locator("#cardPin").isVisible()) {
    await page.locator("#cardPin").click(); // opens the keypad
    for (const digit of "1234") {
      await page.locator(`input[id^=cardPinbtn][value="${digit}"]:visible`).first().click();
    }
    const enter = page.locator("#cardPinbtnRef1EN:visible");
    if (await enter.count()) await enter.click();
  } else {
    console.log("PIN keypad did not appear");
  }
  await shot(page, "4-card-filled");
  await page.getByRole("button", { name: /^Pay$/ }).or(page.locator("input[value=Pay]")).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "4b-after-pay");
  // Some flows ask for the PIN on a second page.
  const pin2 = page.locator("input[type=password]").first();
  if (page.url().includes("benefit-gateway") && (await pin2.isVisible().catch(() => false))) {
    await pin2.pressSequentially("1234", { delay: 40 });
    await page.locator("input[type=submit], button").filter({ hasText: /pay|submit|confirm/i }).first().click();
  }
  await page.waitForURL((u) => u.href.startsWith(BASE), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "5-back-in-app");
  console.log("back in app:", page.url().replace(BASE, ""));
  console.log("page says:", (await page.locator("h1").first().innerText().catch(() => "?")).trim());
}
console.log("final url:", page.url().slice(0, 120));
console.log("console errors:", consoleErrors.slice(0, 8).join("\n") || "none");
await browser.close();
