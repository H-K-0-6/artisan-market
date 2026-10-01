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
