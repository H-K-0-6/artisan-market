import { expect, test } from "@playwright/test";
import { PASSWORD, signedInContext } from "./helpers";

test("admin bans a signed-in buyer; their session ends and they can't sign back in", async ({ browser }) => {
  const victim = await signedInContext(browser, "buyer2@demo.test");
  await victim.page.goto("/account/notifications");
  await expect(victim.page).toHaveURL(/\/account\/notifications/);

  const admin = await signedInContext(browser, "admin@demo.test");
  await admin.page.goto("/admin/users?q=buyer2");
  await admin.page.getByRole("link", { name: /buyer2@demo\.test|Bea Bidder/ }).first().click();
  await admin.page.getByRole("button", { name: "Ban user" }).click();
  const dialog = admin.page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("E2E: repeated non-payment");
  await dialog.getByRole("button", { name: "Ban user" }).click();
  // Wait for the action to finish (its success toast), not just any "banned" text.
  await expect(admin.page.getByText(/^User banned/).first()).toBeVisible();

  // The banned buyer's next request lands on sign-in...
  await victim.page.reload();
  await expect(victim.page).toHaveURL(/\/sign-in/);
  // ...and signing in again is refused.
  await victim.page.getByLabel("Email").fill("buyer2@demo.test");
  await victim.page.getByLabel("Password").fill(PASSWORD);
  await victim.page.getByRole("button", { name: "Sign in" }).click();
  await expect(victim.page.getByRole("alert")).toBeVisible();
  await expect(victim.page).toHaveURL(/\/sign-in/);

  // The ban is in the audit log.
  await admin.page.goto("/admin/audit");
  await expect(admin.page.getByText(/repeated non-payment/)).toBeVisible();

  await victim.context.close();
  await admin.context.close();
});
