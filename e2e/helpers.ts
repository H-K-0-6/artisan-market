import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

export const PASSWORD = "Password123!";

/** Signs in through the real form and waits for the redirect. */
export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/** A fresh, isolated browser session signed in as `email`. */
export async function signedInContext(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
}

/** Runs `fn` with a client on the E2E database. */
export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

// Prisma stores DateTime as UTC in "timestamp without time zone" columns.
export const DB_NOW = `(now() AT TIME ZONE 'UTC')`;

/**
 * Completes Tap's BENEFIT sandbox page with a test debit card. The page checks the
 * card number when the field loses focus, then asks for the PIN on an on-screen
 * keypad whose digits are shuffled, so we click buttons by their value.
 */
export async function payOnBenefitPage(page: Page, cardNumber = "4600410123456789", pin = "1234") {
  const card = page.locator("#debitCardNumber");
  await card.click();
  await card.pressSequentially(cardNumber, { delay: 40 });
  await page.keyboard.press("Tab");
  await page.locator("#debitMonthSelect").selectOption("12");
  await page.locator("#debitYearSelect").selectOption("2027");
  await page.locator("#debitCardholderName").fill("Test Buyer"); // letters and spaces only
  await page.locator("#cardPin").click();
  for (const digit of pin) {
    await page.locator(`input[id^=cardPinbtn][value="${digit}"]:visible`).first().click();
  }
  const enter = page.locator("#cardPinbtnRef1EN:visible");
  if (await enter.count()) await enter.click();
  // A click on Pay while the keypad is still closing is swallowed.
  await expect(page.locator("input[id^=cardPinbtn]:visible")).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Pay$/ }).or(page.locator("input[value=Pay]")).first().click();
}
